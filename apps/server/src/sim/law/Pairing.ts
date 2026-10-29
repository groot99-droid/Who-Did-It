import { balance, relations } from '@wdi/content';
import { PairPhase, Phase, type Rng, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { avatarMemory } from '../Avatars';
import { emitSim } from '../events/bus';
import { isNpcSeat } from '../Npc';
import { moodOf } from '../npc/needs';
import { spanTicks } from '../npc/routine';
import { simOf } from '../RoomSim';
import { type Figure, type FigureAct, figureOfHandle, figuresOf } from '../townsfolk/figures';
import { reject, sceneKey } from '../World';
import { isGuard } from './Guards';

/**
 * Walk with me (round 10, B8; GDD 3.31, `world-mode.md` 3.1 and R6, `living-world.md` 1.4, `failures.md` 10;
 * seams.md 3 row 10). In the night phases a living seat asks a figure in reach (a seat's or a townsperson's handle)
 * to walk with it until dawn. Every ask draws one delay from `pairing.answerS` and one yes roll from the `pairing`
 * stream, whoever is asked, and the answer reaches the asker at that delay, so its timing tells no person from an
 * NPC. A human target's prompt stays open until then (an early answer is held, no answer is a no); an NPC seat or a
 * townsperson says yes on the roll (`yesChance`, times `scaredMult` while Scared; the mood is card-blind); a guard
 * keeps its post and says no; a target already asking, asked or paired says no like any other. A no is the same
 * line for everyone, an answer and never a refusal. A pair ends at dawn, on a death, a cancel, or `apartS` in
 * different scenes; a figure or NPC-seat partner follows the asker within `followTiles`. A pair shields a seat from
 * a third party only while the partner shares its scene (`pairedWith`). Nothing public shows a pair.
 */

interface Ask {
  asker: string;
  /** The asked seat or figure id. */
  target: string;
  dueTick: number;
  roll: number;
  /** A human target's answer, held until `dueTick`; null while unanswered. */
  answer: boolean | null;
  /** The target was already asking, asked or paired when this ask came: it answers no at the delay. */
  blocked: boolean;
}

interface PairMemory {
  /** Open asks by asker. */
  asks: Map<string, Ask>;
  /** Both ends of every pair: id -> partner id (seats and figures). */
  pairs: Map<string, string>;
  /** The tick a pair's two ends went apart, by the asker's id; absent while together. */
  apartSince: Map<string, number>;
  /** Asker -> it was declined (the line shows until its next ask or dawn). */
  declined: Set<string>;
}

const memories = new WeakMap<PartyRoom, PairMemory>();
function memoryOf(room: PartyRoom): PairMemory {
  let memory = memories.get(room);
  if (!memory) {
    memory = { asks: new Map(), pairs: new Map(), apartSince: new Map(), declined: new Set() };
    memories.set(room, memory);
  }
  return memory;
}

const NIGHT_PHASES = new Set<number>([Phase.dusk, Phase.night, Phase.finalNight]);
const rngOf = (room: PartyRoom): Rng => room.seeds.get('pairing');

/** Where an id stands now: a living, placed seat or a living figure; null otherwise. */
function placeOf(room: PartyRoom, id: string): { sceneIdx: number; x: number; y: number } | null {
  const p = simOf(room).players.get(id);
  if (p) return p.dead || !p.placed ? null : p;
  const f = figuresOf(room).get(id);
  return f && !f.dead ? f : null;
}

/** The id's avatar handle in a scene, '' when it stands elsewhere (handles re-roll on every entry). */
function handleIn(room: PartyRoom, id: string, sceneIdx: number): string {
  const at = placeOf(room, id);
  if (!at || at.sceneIdx !== sceneIdx) return '';
  const f = figuresOf(room).get(id);
  return f ? (f.handle ?? '') : (avatarMemory(room).handleOf.get(id) ?? '');
}

/** The id's partner while the two share a scene (the shield of the alone rules); null otherwise. */
export function pairedWith(room: PartyRoom, id: string): string | null {
  const partner = memoryOf(room).pairs.get(id);
  if (partner === undefined) return null;
  const a = placeOf(room, id);
  const b = placeOf(room, partner);
  return a && b && a.sceneIdx === b.sceneIdx ? partner : null;
}

const busy = (m: PairMemory, id: string): boolean =>
  m.pairs.has(id) || m.asks.has(id) || [...m.asks.values()].some((a) => a.target === id);

/** `pair.ask {targetId}` (queued, consumed in `step()`): the target's handle in the asker's scene. */
export function handlePairAsk(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const m = memoryOf(room);
  const p = simOf(room).players.get(seat);
  if (!p || p.dead || !p.placed) return reject(room, seat, 'NOT_IN_PLAY');
  if (!NIGHT_PHASES.has(room.state.phase)) return reject(room, seat, 'PHASE_CLOSED', { until: 'dusk' });
  if (m.pairs.has(seat) || m.asks.has(seat)) return reject(room, seat, 'BUSY');
  const handle = typeof payload.targetId === 'string' ? payload.targetId : '';
  const figure = figureOfHandle(room, handle);
  const memory = avatarMemory(room);
  const target = figure?.id ?? memory.seatOf.get(handle);
  const at = target === undefined ? null : placeOf(room, target);
  if (target === undefined || target === seat || !at || at.sceneIdx !== p.sceneIdx)
    return reject(room, seat, 'NO_TARGET');
  if (!figure && memory.handleOf.get(target) !== handle) return reject(room, seat, 'NO_TARGET');
  if (Math.hypot(at.x - p.x, at.y - p.y) > relations.inspect.rangeTiles * TILE_PX)
    return reject(room, seat, 'TOO_FAR', { of: 'person' });
  // One delay and one roll on every ask, whoever is asked, so the stream moves the same way every time.
  const rng = rngOf(room);
  const dueTick = room.state.tick + spanTicks(rng, balance.pairing.answerS);
  const roll = rng();
  const blocked = busy(m, target);
  m.declined.delete(seat);
  m.asks.set(seat, { asker: seat, target, dueTick, roll, answer: null, blocked });
  emitSim(room, { tick: room.state.tick, kind: 'pair.ask', data: { asker: seat, target } });
}

/** `pair.answer {yes}`: a human target's answer to its open prompt, or, while paired, `yes: false` ends the pair. */
export function handlePairAnswer(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const m = memoryOf(room);
  const yes = payload.yes === true;
  const partner = m.pairs.get(seat);
  if (partner !== undefined) {
    if (!yes) endPair(room, seat);
    return;
  }
  const ask = [...m.asks.values()].find((a) => a.target === seat && !a.blocked);
  if (!ask || ask.answer !== null) return; // nothing to answer: silent, an answer is never refused
  ask.answer = yes;
}

/** Ends the pair `id` belongs to, both ends at once. */
function endPair(room: PartyRoom, id: string): void {
  const m = memoryOf(room);
  const partner = m.pairs.get(id);
  if (partner === undefined) return;
  m.pairs.delete(id);
  m.pairs.delete(partner);
  m.apartSince.delete(id);
  m.apartSince.delete(partner);
  emitSim(room, { tick: room.state.tick, kind: 'pair.end', data: { a: id, b: partner } });
}

/** Whether the asked id says yes at the delay: a human by its held answer, any other by the roll; never a guard. */
function decide(room: PartyRoom, m: PairMemory, ask: Ask): boolean {
  if (ask.blocked || !placeOf(room, ask.target) || !placeOf(room, ask.asker)) return false;
  if (m.pairs.has(ask.target) || m.asks.has(ask.target)) return false;
  const f = figuresOf(room).get(ask.target);
  if (f && isGuard(f)) return false; // a guard keeps its post (GDD 3.24)
  const human = !f && !isNpcSeat(room, ask.target);
  if (human) return ask.answer === true;
  const p = balance.pairing;
  const chance = p.yesChance * (moodOf(room, ask.target) === 'scared' ? p.scaredMult : 1);
  return ask.roll < chance;
}

/** The pairs' tick (inside `runLaw`): due answers, the ends, and every involved seat's private row. */
export function runPairing(room: PartyRoom): void {
  const m = memoryOf(room);
  const tick = room.state.tick;
  if (!NIGHT_PHASES.has(room.state.phase)) {
    // Dawn, a meeting, the lobby: every ask and pair ends.
    m.asks.clear();
    for (const id of [...m.pairs.keys()]) endPair(room, id);
    m.declined.clear();
  }
  for (const ask of [...m.asks.values()]) {
    if (tick < ask.dueTick) continue;
    m.asks.delete(ask.asker);
    if (decide(room, m, ask)) {
      m.pairs.set(ask.asker, ask.target);
      m.pairs.set(ask.target, ask.asker);
      emitSim(room, { tick, kind: 'pair.start', data: { a: ask.asker, b: ask.target } });
    } else m.declined.add(ask.asker);
  }
  const apartTicks = Math.round(balance.pairing.apartS * TICK_RATE);
  for (const [id, partner] of [...m.pairs]) {
    if (!m.pairs.has(id)) continue;
    const a = placeOf(room, id);
    const b = placeOf(room, partner);
    if (!a || !b) {
      endPair(room, id);
      continue;
    }
    if (a.sceneIdx === b.sceneIdx) m.apartSince.delete(id);
    else if (!m.apartSince.has(id)) m.apartSince.set(id, tick);
    else if (tick - (m.apartSince.get(id) as number) >= apartTicks) endPair(room, id);
  }
  writeRows(room, m);
}

/** Every seat's `Private.pair`: its phase and the other figure's handle in its own scene. */
function writeRows(room: PartyRoom, m: PairMemory): void {
  const sim = simOf(room);
  for (const [id, player] of room.state.players) {
    const row = player.priv?.pair;
    if (!row) continue;
    const p = sim.players.get(id);
    let state: number = PairPhase.none;
    let other = '';
    const partner = m.pairs.get(id);
    const asked = [...m.asks.values()].find((a) => a.target === id && !a.blocked);
    if (partner !== undefined) {
      state = PairPhase.paired;
      other = partner;
    } else if (m.asks.has(id)) {
      state = PairPhase.asking;
      other = m.asks.get(id)!.target;
    } else if (asked && !isNpcSeat(room, id)) {
      state = PairPhase.asked;
      other = asked.asker;
    } else if (m.declined.has(id)) state = PairPhase.declined;
    const handle = other === '' || !p ? '' : handleIn(room, other, p.sceneIdx);
    if (row.state !== state) row.state = state;
    if (row.handle !== handle) row.handle = handle;
  }
}

/** Where a partner stands, for a follower that is not the asker. */
function leaderOf(room: PartyRoom, id: string): { sceneIdx: number; x: number; y: number } | null {
  const m = memoryOf(room);
  const partner = m.pairs.get(id);
  if (partner === undefined) return null;
  // The follower is the one that was asked: a figure, or an NPC seat whose partner asked it.
  return placeOf(room, partner);
}

/**
 * A townsperson partner's act (`townsfolk/run.ts`): an idle beside its partner within `followTiles`, else the walk
 * to it (across portals, like any figure walk); null while it walks with nobody.
 */
export function followAct(room: PartyRoom, f: Figure): FigureAct | null {
  const lead = leaderOf(room, f.id);
  if (!lead) return null;
  const tick = room.state.tick;
  const scene = sceneKey(lead.sceneIdx);
  if (lead.sceneIdx === f.sceneIdx && Math.hypot(lead.x - f.x, lead.y - f.y) <= balance.pairing.followTiles * TILE_PX)
    return { kind: 'idle', untilTick: tick + 1, station: null, goal: { scene: sceneKey(f.sceneIdx), x: f.x, y: f.y } };
  return { kind: 'travel', untilTick: Number.POSITIVE_INFINITY, station: null, goal: { scene, x: lead.x, y: lead.y } };
}

/** An NPC seat's partner, when the NPC was the one asked (it follows); null otherwise. */
export function npcLeader(room: PartyRoom, id: string): { sceneIdx: number; x: number; y: number } | null {
  const m = memoryOf(room);
  const partner = m.pairs.get(id);
  if (partner === undefined || !isNpcSeat(room, id)) return null;
  // Two NPC seats never pair (NPCs do not ask); a human partner leads.
  return isNpcSeat(room, partner) ? null : placeOf(room, partner);
}
