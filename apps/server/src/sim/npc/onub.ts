import { balance, onubBalance, onubRoles } from '@wdi/content';
import {
  type ClaimSawPayload,
  NpcLevel,
  type NightRevealEntry,
  ONUB_PREP,
  type OnubClaimPayload,
  type OnubCommit,
  type OnubWakeView,
  Phase,
  type PlayerState,
  type Rng,
  TICK_RATE,
  npcDelayTicks,
} from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { handleClaim, handleVote } from '../Meeting';
import { handleOnubAbility } from '../Onub';
import { onubWakeView } from '../onub/Acts';
import { onubOf } from '../onub/state';
import type { PlayerSim } from '../RoomSim';
import type { Brain, NpcMemory } from './memory';
import { stand } from './walk';

// Quick mode NPC seats (GDD 3.11 "NPC seats", 3.12): prep commits, night acts, claims and votes, no walking.
// Everything below `runOnubNpc` is pure and tested on fixtures (`onubNpc.test.ts`). Each NPC seat draws only
// from its own keyed streams (contract 4.1): `npcTiming:<seat>` for every tick it picks, `npcPlay:<seat>` for
// every choice. A choice always draws the same number of values, whatever the seat's card, so how far a stream
// has moved says nothing about the deal.

type Level = keyof typeof NpcLevel;

interface StationLike {
  id: string;
  good: readonly string[];
  sabotage: readonly string[];
}

const LEVELS = Object.keys(NpcLevel) as Level[];

/** A uniform index in `0..n-1` from one draw. */
const indexAt = (r: number, n: number): number => Math.min(n - 1, Math.floor(r * n));
const pickIndex = (rng: Rng, n: number): number => indexAt(rng(), n);

/** A value of `{min, max}` placed at `rng()` of the way. */
const lerp = (range: { min: number; max: number }, r: number): number =>
  range.min + r * (range.max - range.min);

// --- Evening Prep ---------------------------------------------------------------------------------------------

/**
 * The NPC's prep commit: a station uniform whatever its role, then a sabotage card with chance `chance` when its
 * dealt role sabotages, else a good card. Draws four values every time (station, roll, good card, sabotage
 * card) so the stream moves the same for every card.
 */
export function planPrep(
  play: Rng,
  stations: readonly StationLike[],
  sabotages: boolean,
  chance: number,
): OnubCommit {
  const station = stations[pickIndex(play, stations.length)] as StationLike;
  const roll = play();
  const good = pickIndex(play, station.good.length);
  const bad = pickIndex(play, station.sabotage.length);
  const dirty = sabotages && roll < chance;
  return { station: station.id, card: (dirty ? station.sabotage[bad] : station.good[good]) as string };
}

// --- The night ------------------------------------------------------------------------------------------------

export interface ActPlan {
  act: string;
  targets: string[];
}

/**
 * One step of a night act from the wake view: a flat draw over the legal acts plus "nothing" when the window is
 * not a must-act, then `picks` distinct slots uniform over that act's pool. Returns null for "nothing" (and for a
 * view with no legal act, without drawing).
 */
export function planAct(view: Pick<OnubWakeView, 'legal' | 'must'>, play: Rng): ActPlan | null {
  const n = view.legal.length;
  if (n === 0) return null;
  const i = pickIndex(play, n + (view.must ? 0 : 1));
  const legal = view.legal[i];
  if (!legal) return null;
  const pool = [...legal.slots];
  if (pool.length < legal.picks) return null;
  const targets: string[] = [];
  for (let k = 0; k < legal.picks; k++)
    targets.push(pool.splice(pickIndex(play, pool.length), 1)[0] as string);
  return { act: legal.act, targets };
}

// --- The Rush --------------------------------------------------------------------------------------------------

/** Piles as the board shows them: the cards left in each station's pile and its net sabotage weight. */
export type PileFacts = Readonly<Record<string, { cards: readonly string[]; net: number }>>;

/** One reveal row as a sighting a claim can state: a seat id or `"pantry"`, with the role or station shown. */
export function sightingOf(r: NightRevealEntry): ClaimSawPayload {
  const targetId = r.of === '' ? 'pantry' : r.of;
  return r.kind === 'loc' ? { targetId, stationId: r.value } : { targetId, roleId: r.value };
}

const teamOf = (roleId: string): string => onubRoles.roles[roleId]?.team ?? '';

export interface ClaimFacts {
  self: string;
  /** The dealt Role card, the station worked and the Ingredient card played. */
  role: string;
  station: string;
  card: string;
  /** The deck in play (`OnubBoard.deck`). */
  deck: readonly string[];
  /** Own reveal rows, in the order they arrived. */
  rows: readonly NightRevealEntry[];
  piles: PileFacts;
}

const isSabotage = (card: string): boolean => onubBalance.cards[card]?.kind === 'sabotage';

/** Up to `maxSaw` sightings, other seats and the Pantry before the own seat, the latest first. */
function truthfulSaw(rows: readonly NightRevealEntry[], self: string): ClaimSawPayload[] {
  const latestFirst = [...rows].reverse();
  const ordered = [...latestFirst.filter((r) => r.of !== self), ...latestFirst.filter((r) => r.of === self)];
  return ordered.slice(0, onubBalance.claims.maxSaw).map(sightingOf);
}

/** Stations whose pile is clean (no sabotage left in it) or dirty, as the board shows them. */
const pilesWhere = (piles: PileFacts, stations: readonly StationLike[], dirty: boolean): StationLike[] =>
  stations.filter((s) => {
    const pile = piles[s.id];
    const hasBad = !!pile && (pile.net > 0 || pile.cards.some(isSabotage));
    return hasBad === dirty;
  });

/**
 * The one claim an NPC posts in the Rush (GDD 3.11 "NPC seats"): the truth when a draw under
 * `claimTruthChance[team]` allows it (every Baker card: its dealt role, station, card and what it saw); else a
 * lie. Team Mold claims a seeded Baker role of the deck (the Pantry role it peeked when it peeked one), at a
 * station whose pile is clean when it sabotaged; the Croissant claims a seeded Baker role at a station whose
 * pile holds sabotage, to look guilty. Draws four values every time (truth, role, station, card).
 */
export function planClaim(
  f: ClaimFacts,
  play: Rng,
  stations: readonly StationLike[] = onubBalance.stations,
): OnubClaimPayload {
  const team = teamOf(f.role);
  const chance = onubBalance.npc.claimTruthChance[team as 'baker'] ?? 0;
  const truthRoll = play();
  const roleRoll = play();
  const stationRoll = play();
  const cardRoll = play();
  if (truthRoll < chance) {
    const saw = truthfulSaw(f.rows, f.self);
    return {
      roleId: f.role,
      ...(f.station ? { stationId: f.station } : {}),
      ...(f.card ? { cardId: f.card } : {}),
      ...(saw.length ? { saw } : {}),
    };
  }

  const bakers = [...new Set(f.deck.filter((id) => teamOf(id) === 'baker'))];
  const roles = bakers.length ? bakers : [...new Set(f.deck)];
  const peeked = f.rows.find((r) => r.kind === 'role' && r.of === '' && teamOf(r.value) === 'baker');
  const roleId = peeked?.value ?? (roles[indexAt(roleRoll, roles.length)] as string);

  const croissant = team === 'croissant';
  const sabotaged = isSabotage(f.card);
  const wanted = croissant
    ? pilesWhere(f.piles, stations, true)
    : sabotaged
      ? pilesWhere(f.piles, stations, false)
      : [];
  const stationPool = wanted.length ? wanted : stations;
  const station = stationPool[indexAt(stationRoll, stationPool.length)] as StationLike;

  // The card that backs the story: a good card already in a clean story's pile, a sabotage card in a guilty one.
  const pile = f.piles[station.id]?.cards ?? [];
  const kind = croissant ? station.sabotage : station.good;
  const inPile = kind.filter((c) => pile.includes(c));
  const cardPool = inPile.length ? inPile : kind;
  const cardId = cardPool[indexAt(cardRoll, cardPool.length)] as string;
  return { roleId, stationId: station.id, cardId };
}

export interface VoteFacts {
  self: string;
  /** Seats in play other than `self`, in deal order. */
  others: readonly string[];
  /** Seats the own night showed this seat (the other Spore, the Spores a Levain sees): not suspects. */
  mates: ReadonlySet<string>;
  /** Own reveal rows. */
  rows: readonly NightRevealEntry[];
  claims: readonly { from: string; stationId: string }[];
  piles: PileFacts;
}

/** Seats the own peeks showed holding a Team Mold card. */
export function moldSightings(f: Pick<VoteFacts, 'rows' | 'self' | 'others' | 'mates'>): string[] {
  const out = new Set<string>();
  for (const r of f.rows) {
    if (r.kind !== 'role' || r.of === '' || r.of === f.self || f.mates.has(r.of)) continue;
    if (teamOf(r.value) === 'mold' && f.others.includes(r.of)) out.add(r.of);
  }
  return [...out];
}

/**
 * The seat an NPC votes for: with chance `smart` the seat it has the best evidence against (a seat its own peek
 * showed holding a Team Mold card, else a seat whose claimed station has net sabotage and is not a known
 * teammate), otherwise, and when there is no evidence, a seeded other seat; never the Pantry, never itself. Null
 * when no seat is left. Draws three values every time (smart roll, evidence pick, random pick).
 */
export function planVote(f: VoteFacts, play: Rng, smart: number): string | null {
  const smartRoll = play();
  const evidenceRoll = play();
  const randomRoll = play();
  if (f.others.length === 0) return null;
  if (smartRoll < smart) {
    const strong = moldSightings(f);
    const weak = [
      ...new Set(
        f.claims
          .filter((c) => c.from !== f.self && f.others.includes(c.from) && !f.mates.has(c.from))
          .filter((c) => (f.piles[c.stationId]?.net ?? 0) > 0)
          .map((c) => c.from),
      ),
    ];
    const pool = strong.length ? strong : weak;
    if (pool.length) return pool[indexAt(evidenceRoll, pool.length)] as string;
  }
  return f.others[indexAt(randomRoll, f.others.length)] as string;
}

// --- The brain ---------------------------------------------------------------------------------------------------

/** What one quick-mode NPC seat remembers; keyed by its `Brain`, which `runNpcs` renews at every role card. */
interface OnubBrain {
  commitAt: number;
  committed: boolean;
  windowIdx: number;
  actAt: number;
  stepAt: number;
  steps: number;
  done: boolean;
  claimAt: number;
  claimed: boolean;
  voteAt: number;
  voted: boolean;
}

const fresh = (): OnubBrain => ({
  commitAt: -1,
  committed: false,
  windowIdx: -1,
  actAt: -1,
  stepAt: -1,
  steps: 0,
  done: false,
  claimAt: -1,
  claimed: false,
  voteAt: -1,
  voted: false,
});

const brains = new WeakMap<Brain, OnubBrain>();
const brainOf = (brain: Brain): OnubBrain => {
  let b = brains.get(brain);
  if (!b) {
    b = fresh();
    brains.set(brain, b);
  }
  return b;
};

/** A night act may take three goes (the Tourrier's two steps, and one refused try). */
const MAX_ACT_SENDS = 3;

/** The difficulty level the NPCs play (3.12, same rule as the main mode's `difficultyRow`). */
function levelOf(room: PartyRoom): Level {
  const { npcSeats, npcDifficulty } = room.state.settings;
  const key = npcSeats >= balance.npc.difficultyMinNpcs ? LEVELS[npcDifficulty] : undefined;
  return key ?? (balance.npc.defaultDifficulty as Level);
}

function pilesOf(room: PartyRoom): PileFacts {
  const out: Record<string, { cards: readonly string[]; net: number }> = {};
  room.state.onub.piles.forEach((pile, station) => {
    out[station] = { cards: [...pile.cards], net: pile.net };
  });
  return out;
}

const rowsOf = (player: PlayerState): NightRevealEntry[] =>
  [...player.priv.nightReveal].map((r) => ({
    slot: r.slot,
    kind: r.kind as NightRevealEntry['kind'],
    value: r.value,
    of: r.of,
  }));

function runPrepStage(room: PartyRoom, player: PlayerState, b: OnubBrain): void {
  if (b.committed || player.priv.onubLoc !== '') return;
  const tick = room.state.tick;
  const timing = room.seeds.get('npcTiming', player.id);
  if (b.commitAt < 0) {
    const { min, max } = onubBalance.npc.commitS;
    b.commitAt = tick + npcDelayTicks(timing, min, max, TICK_RATE);
  }
  if (tick < b.commitAt) return;
  const o = onubOf(room);
  const role = player.priv.role.roleId || o?.dealt.get(player.id) || '';
  const commit = planPrep(
    room.seeds.get('npcPlay', player.id),
    onubBalance.stations,
    onubRoles.roles[role]?.sabotages ?? false,
    onubBalance.npc.sabotageChance[levelOf(room)],
  );
  b.committed = true;
  handleOnubAbility(room, player.id, { abilityId: ONUB_PREP, targets: [commit.station, commit.card] });
}

function runNightStage(room: PartyRoom, player: PlayerState, b: OnubBrain): void {
  const o = onubOf(room);
  if (!o || o.stage !== 'window' || !o.wakers.includes(player.id)) return;
  if (b.windowIdx !== o.windowIdx)
    Object.assign(b, { windowIdx: o.windowIdx, actAt: -1, stepAt: -1, steps: 0, done: false });
  if (b.done) return;
  const view = onubWakeView(room, player.id);
  if (!view || view.legal.length === 0) return;
  const tick = room.state.tick;
  const timing = room.seeds.get('npcTiming', player.id);
  if (b.actAt < 0) {
    const window = o.script[o.windowIdx];
    const length = window ? Math.round(window.seconds * TICK_RATE) : 0;
    const opens = Math.max(0, o.stageEndsTick - length);
    b.actAt =
      opens + Math.round(Math.max(0, o.stageEndsTick - opens) * lerp(onubBalance.npc.actFrac, timing()));
  }
  if (b.steps === 0) {
    if (tick < b.actAt) return;
  } else {
    if (b.stepAt < 0) {
      b.stepAt = Math.min(
        tick + npcDelayTicks(timing, onubBalance.npc.stepS.min, onubBalance.npc.stepS.max, TICK_RATE),
        o.stageEndsTick - 1,
      );
    }
    if (tick < b.stepAt) return;
  }
  const plan = planAct(view, room.seeds.get('npcPlay', player.id));
  if (!plan || b.steps >= MAX_ACT_SENDS) {
    b.done = true;
    return;
  }
  b.steps++;
  b.stepAt = -1;
  handleOnubAbility(room, player.id, { abilityId: plan.act, targets: plan.targets });
}

function runMorningStage(room: PartyRoom, player: PlayerState, b: OnubBrain): void {
  const state = room.state;
  const tick = state.tick;
  if (b.claimAt < 0) {
    const timing = room.seeds.get('npcTiming', player.id);
    const rush = Math.max(0, state.phaseEndsTick - tick);
    const span = rush + Math.round(onubBalance.timers.voteS * TICK_RATE);
    b.claimAt = tick + Math.round(rush * lerp(onubBalance.npc.claimFrac, timing()));
    b.voteAt = tick + Math.round(span * lerp(onubBalance.npc.voteFrac, timing()));
  }
  const o = onubOf(room);
  const rows = rowsOf(player);
  const piles = pilesOf(room);
  if (!b.claimed && tick >= b.claimAt) {
    b.claimed = true;
    const role = player.priv.role.roleId || o?.dealt.get(player.id) || '';
    const claim = planClaim(
      {
        self: player.id,
        role,
        station: player.priv.onubLoc,
        card: player.priv.onubCard,
        deck: [...state.onub.deck],
        rows,
        piles,
      },
      room.seeds.get('npcPlay', player.id),
    );
    handleClaim(room, player.id, claim as unknown as Record<string, unknown>);
  }
  if (!b.voted && !player.hasVoted && tick >= b.voteAt) {
    b.voted = true;
    const others = [...state.onub.seats].filter((id) => {
      const seat = state.players.get(id);
      return id !== player.id && !!seat && seat.connected;
    });
    const mates = new Set(rows.filter((r) => r.kind === 'mate').map((r) => r.of));
    const target = planVote(
      {
        self: player.id,
        others,
        mates,
        rows,
        claims: [...state.meeting.claims].map((c) => ({ from: c.from, stationId: c.stationId })),
        piles,
      },
      room.seeds.get('npcPlay', player.id),
      onubBalance.npc.smartVoteChance[levelOf(room)],
    );
    if (target !== null) handleVote(room, player.id, { targetId: target });
  }
}

/**
 * Quick mode NPC seats (GDD 3.11 "NPC seats", 3.12): called by `runNpcs` for every phase but the role card.
 * Session 5E owns this file and keeps its brain state in its own `WeakMap` (prep, acts, claims, votes; no
 * walking). It calls the verbs directly inside the step, as a human's message would be consumed.
 */
export function runOnubNpc(
  room: PartyRoom,
  mem: NpcMemory,
  brain: Brain,
  player: PlayerState,
  p: PlayerSim,
): void {
  void mem;
  stand(p);
  if (p.dead) return;
  const b = brainOf(brain);
  switch (room.state.phase) {
    case Phase.dusk:
      return runPrepStage(room, player, b);
    case Phase.night:
      return runNightStage(room, player, b);
    case Phase.meetingDiscussion:
    case Phase.meetingVote:
      return runMorningStage(room, player, b);
    default:
  }
}
