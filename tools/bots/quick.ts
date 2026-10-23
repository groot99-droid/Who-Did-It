// Quick-mode (GDD 3.11) choices of the bot brain, ONUB v2: the prep commit, the night act from `nightWake.view`,
// one honest claim in the Rush, the vote, and the night leak monitor. A bot is a client: it reads only what a
// client receives (its role card, `state.onub`, its own `Private`, the claims on the board) and sends the
// messages a person's page sends. The planners are pure so they test without a server; `QuickPlayer` is the
// stateful part `startWalker` (walk.ts) drives each tick in quick mode. The server's NPC seats plan the same
// choices from the room (`apps/server/src/sim/npc/onub.ts`); a bot differs in that it claims the truth for
// every card and sometimes votes for the Pantry, which exercises the claim and Pantry paths of a soak.
import { onubBalance, onubRoles } from '@wdi/content';
import {
  type ClaimSawPayload,
  type NightRevealEntry,
  ONUB_PREP,
  type OnubClaimPayload,
  type OnubWakeView,
  Phase,
  TICK_RATE,
} from '@wdi/shared';

type Rand = () => number;
const indexAt = (r: number, n: number): number => Math.min(n - 1, Math.floor(r * n));
const pick = <T>(rng: Rand, list: readonly T[]): T => list[indexAt(rng(), list.length)] as T;
const lerp = (r: { min: number; max: number }, x: number): number => r.min + x * (r.max - r.min);

export interface QuickBehavior {
  /** Chance a bot whose card sabotages plays a sabotage card at prep: 0.4, 0.6 and 0.8 are the NPC levels, 1 all-in. */
  sabotage?: number;
  /** Chance the vote goes to the seat the bot has evidence against (see `planBotVote`). Default 0.3. */
  smart?: number;
  /** Chance the vote goes to the Pantry. Default 0.1: the Pantry vote is a path a soak must walk. */
  pantryVote?: number;
  /** `human` uses the NPC timing spans of `balance.onub.json`; `fast` squeezes them for tests and e2e. Default human. */
  pace?: 'human' | 'fast';
}

interface Spans {
  commitS: { min: number; max: number };
  actFrac: { min: number; max: number };
  claimFrac: { min: number; max: number };
  voteFrac: { min: number; max: number };
}

export const PACES: Record<'human' | 'fast', Spans> = {
  human: {
    commitS: onubBalance.npc.commitS,
    actFrac: onubBalance.npc.actFrac,
    claimFrac: onubBalance.npc.claimFrac,
    voteFrac: onubBalance.npc.voteFrac,
  },
  fast: {
    commitS: { min: 1, max: 3 },
    actFrac: { min: 0.05, max: 0.2 },
    claimFrac: { min: 0.01, max: 0.03 },
    voteFrac: { min: 0.02, max: 0.05 },
  },
};

// --- Pure planners ----------------------------------------------------------------------------------------------

/** The prep commit: any station, a sabotage card with chance `chance` when the card sabotages, else a good one. */
export function planCommit(
  rng: Rand,
  sabotages: boolean,
  chance: number,
  stations: typeof onubBalance.stations = onubBalance.stations,
): { station: string; card: string } {
  const station = pick(rng, stations);
  const roll = rng();
  const good = pick(rng, station.good);
  const bad = pick(rng, station.sabotage);
  return { station: station.id, card: sabotages && roll < chance ? bad : good };
}

/** A night act from the view: a flat draw over the legal acts, plus "nothing" unless the window is a must-act. */
export function planNightAct(
  view: Pick<OnubWakeView, 'legal' | 'must'>,
  rng: Rand,
): { act: string; targets: string[] } | null {
  if (view.legal.length === 0) return null;
  const i = indexAt(rng(), view.legal.length + (view.must ? 0 : 1));
  const legal = view.legal[i];
  if (!legal || legal.slots.length < legal.picks) return null;
  const pool = [...legal.slots];
  const targets: string[] = [];
  for (let k = 0; k < legal.picks; k++)
    targets.push(pool.splice(indexAt(rng(), pool.length), 1)[0] as string);
  return { act: legal.act, targets };
}

/**
 * The legal entry of the second step of a two-step act (`acts[first].then`), for a bot whose view did not change
 * after the first step: only a `then` act aimed at any seat's Role card (the Tourrier's swap) can be rebuilt from
 * the deal order and the cloche.
 */
export function followUp(
  first: string,
  seats: readonly string[],
  cloche: string,
): OnubWakeView['legal'][number] | null {
  const then = onubBalance.acts[first]?.then;
  const act = then ? onubBalance.acts[then] : undefined;
  if (!then || !act || act.targets.length !== 1 || act.targets[0] !== 'anySeatRole') return null;
  return {
    act: then,
    picks: act.picks,
    slots: seats.map((_, i) => `seat.${i}.role`).filter((s) => s !== cloche),
  };
}

const sawOf = (r: NightRevealEntry): ClaimSawPayload => {
  const targetId = r.of === '' ? 'pantry' : r.of;
  return r.kind === 'loc' ? { targetId, stationId: r.value } : { targetId, roleId: r.value };
};

/** The honest claim: dealt role, station and card, and up to `claims.maxSaw` sightings, other seats first, latest first. */
export function planClaimOf(
  self: string,
  role: string,
  prep: { station: string; card: string } | null,
  rows: readonly NightRevealEntry[],
): OnubClaimPayload {
  const latest = [...rows].reverse();
  const saw = [...latest.filter((r) => r.of !== self), ...latest.filter((r) => r.of === self)]
    .slice(0, onubBalance.claims.maxSaw)
    .map(sawOf);
  return {
    roleId: role,
    ...(prep ? { stationId: prep.station, cardId: prep.card } : {}),
    ...(saw.length ? { saw } : {}),
  };
}

export interface BotVoteFacts {
  self: string;
  /** Seats in play other than `self`. */
  others: readonly string[];
  /** The bot's own reveal rows. */
  rows: readonly NightRevealEntry[];
  claims: readonly { from: string; stationId: string }[];
  piles: Readonly<Record<string, { net: number }>>;
}

/**
 * The vote: the Pantry with chance `pantry`; else with chance `smart` a seat the bot's own peek showed holding a Team
 * Mold card, else a claimed station with net sabotage; else a random other seat. Never itself, never Skip. Null
 * when no seat is left to name. Draws four values every time.
 */
export function planBotVote(f: BotVoteFacts, rng: Rand, smart: number, pantry: number): string | null {
  const pantryRoll = rng();
  const smartRoll = rng();
  const evidenceRoll = rng();
  const randomRoll = rng();
  if (pantryRoll < pantry) return 'pantry';
  if (f.others.length === 0) return null;
  if (smartRoll < smart) {
    const mates = new Set(f.rows.filter((r) => r.kind === 'mate').map((r) => r.of));
    const strong = [
      ...new Set(
        f.rows
          .filter((r) => r.kind === 'role' && r.of !== '' && f.others.includes(r.of) && !mates.has(r.of))
          .filter((r) => onubRoles.roles[r.value]?.team === 'mold')
          .map((r) => r.of),
      ),
    ];
    const weak = [
      ...new Set(
        f.claims
          .filter(
            (c) => f.others.includes(c.from) && !mates.has(c.from) && (f.piles[c.stationId]?.net ?? 0) > 0,
          )
          .map((c) => c.from),
      ),
    ];
    const pool = strong.length ? strong : weak;
    if (pool.length) return pool[indexAt(evidenceRoll, pool.length)] as string;
  }
  return f.others[indexAt(randomRoll, f.others.length)] as string;
}

// --- The leak monitor (bugs.md: a sleeper must learn nothing) --------------------------------------------------------

/** The roles that have a night window in the deck in play. */
export function windowRoles(deck: readonly string[]): Set<string> {
  const present = new Set(deck);
  return new Set(onubBalance.windows.filter((w) => present.has(w.role)).map((w) => w.role));
}

/** A `nightWake` reaches a seat whose dealt role does not own that window. */
export const wakeLeak = (dealtRole: string, windowRole: string): boolean => dealtRole !== windowRole;

/**
 * A `nightReveal` reaches a seat that has nothing to learn: a sleeper (its dealt role has no window), unless it is
 * the proofing perk (one Pantry Location entry for a seat that worked the proofing station).
 */
export function revealLeak(
  entries: readonly NightRevealEntry[],
  dealtRole: string,
  station: string,
  windows: ReadonlySet<string>,
): boolean {
  if (windows.has(dealtRole)) return false;
  const perk =
    station === 'proofing' && entries.length === 1 && entries[0]?.slot.startsWith('pantry.loc.') === true;
  return entries.length > 0 && !perk;
}

// --- The stateful player -----------------------------------------------------------------------------------------

export interface QuickStats {
  preps: number;
  wakes: number;
  acts: number;
  claims: number;
  votes: number;
  pantryVotes: number;
  /** Sleepers that learned something, and presences seen in quick mode. Must stay 0. */
  nightLeaks: number;
}

export const newQuickStats = (): QuickStats => ({
  preps: 0,
  wakes: 0,
  acts: 0,
  claims: 0,
  votes: 0,
  pantryVotes: 0,
  nightLeaks: 0,
});

interface ClaimLike {
  from: string;
  stationId: string;
}
interface PlayerLike {
  id: string;
  connected: boolean;
  hasVoted: boolean;
  presence?: unknown;
  priv?: {
    onubLoc: string;
    onubCard: string;
    nightReveal: { forEach(cb: (r: NightRevealEntry) => void): void };
  };
}
/** The part of the synced state a quick-mode bot reads. */
export interface QuickState {
  phase: number;
  tick: number;
  phaseEndsTick: number;
  players: {
    forEach(cb: (p: PlayerLike, id: string) => void): void;
    get(id: string): PlayerLike | undefined;
  };
  onub?: {
    seats: { forEach(cb: (id: string) => void): void };
    deck: { forEach(cb: (id: string) => void): void };
    piles: { forEach(cb: (pile: { net: number }, station: string) => void): void };
  };
  meeting?: { claims: { forEach(cb: (c: ClaimLike) => void): void } };
}

export interface QuickSender {
  send(type: string, payload: unknown): void;
}

const listOf = <T>(c: { forEach(cb: (v: T) => void): void } | undefined): T[] => {
  const out: T[] = [];
  c?.forEach((v) => out.push(v));
  return out;
};

/** What a quick-mode bot remembers of one match. */
interface MatchMemory {
  role: string;
  /** The ticks the bot picked, -1 until drawn. */
  commitAt: number;
  committed: boolean;
  wake: { view: OnubWakeView; openedTick: number; endsTick: number; role: string } | null;
  actAt: number;
  stepAt: number;
  steps: number;
  lastAct: string;
  claimAt: number;
  claimed: boolean;
  /** The claim was resent without its sightings after the board still lacked it (a refused sighting). */
  bareClaim: boolean;
  voteAt: number;
  votedAt: number;
  voteSends: number;
}

const MAX_ACT_SENDS = 3;
const VOTE_RETRY_TICKS = 2 * TICK_RATE;
/** A claim the board still lacks after this long is resent without its sightings. */
const CLAIM_RETRY_TICKS = 2 * TICK_RATE;
/** A bot gives a vote up after this many sends in one match (an abstention is legal in quick mode). */
const MAX_VOTE_SENDS = 6;

export class QuickPlayer {
  readonly stats = newQuickStats();
  private m: MatchMemory = QuickPlayer.fresh();
  private readonly spans: Spans;

  constructor(
    private readonly room: QuickSender,
    private readonly selfId: () => string,
    private readonly rng: Rand,
    private readonly behavior: QuickBehavior = {},
  ) {
    this.spans = PACES[behavior.pace ?? 'human'];
  }

  private static fresh(): MatchMemory {
    return {
      role: '',
      commitAt: -1,
      committed: false,
      wake: null,
      actAt: -1,
      stepAt: -1,
      steps: 0,
      lastAct: '',
      claimAt: -1,
      claimed: false,
      bareClaim: false,
      voteAt: -1,
      votedAt: -1,
      voteSends: 0,
    };
  }

  /** The role card arrived: a new match. */
  onCard(roleId: string): void {
    this.m = QuickPlayer.fresh();
    this.m.role = roleId;
  }

  private deck: string[] = [];
  private station = '';
  private rows: NightRevealEntry[] = [];

  onWake(m: { windowRole: string; endsTick: number; view: OnubWakeView }, nowTick: number): void {
    if (wakeLeak(this.m.role, m.windowRole)) this.stats.nightLeaks++;
    else this.stats.wakes++;
    const reopened = this.m.wake?.role !== m.windowRole;
    this.m.wake = {
      view: m.view,
      openedTick: reopened ? nowTick : (this.m.wake?.openedTick ?? nowTick),
      endsTick: m.endsTick,
      role: m.windowRole,
    };
    if (reopened) Object.assign(this.m, { actAt: -1, stepAt: -1, steps: 0, lastAct: '' });
  }

  onReveal(entries: readonly NightRevealEntry[]): void {
    if (revealLeak(entries, this.m.role, this.station, windowRoles(this.deck))) this.stats.nightLeaks++;
  }

  onSleep(): void {
    this.m.wake = null;
  }

  /** Called every tick in quick mode; sends at most one message. */
  tick(state: QuickState): void {
    const me = state.players.get(this.selfId());
    if (!me) return;
    if (state.phase === Phase.lobby) {
      this.m = QuickPlayer.fresh();
      return;
    }
    // Quick mode sends no presence to anyone (every seat is in the loft); the seat's own Player carries an
    // all-zero default `presence` object (the own view, `sim/Visibility.ts`), which is not a leak.
    state.players.forEach((p, id) => {
      if (id !== this.selfId() && p.presence) this.stats.nightLeaks++;
    });
    this.deck = listOf(state.onub?.deck);
    this.station = me.priv?.onubLoc ?? '';
    this.rows = listOf(me.priv?.nightReveal);
    if (state.phase === Phase.dusk) this.prep(state, me);
    else if (state.phase === Phase.night) this.night(state);
    else if (state.phase === Phase.meetingDiscussion || state.phase === Phase.meetingVote)
      this.morning(state, me);
  }

  private prep(state: QuickState, me: PlayerLike): void {
    if (this.m.committed || (me.priv?.onubLoc ?? '') !== '') return;
    if (this.m.commitAt < 0) {
      const { min, max } = this.spans.commitS;
      this.m.commitAt = state.tick + Math.round(lerp({ min, max }, this.rng()) * TICK_RATE);
    }
    if (state.tick < this.m.commitAt) return;
    const c = planCommit(
      this.rng,
      onubRoles.roles[this.m.role]?.sabotages ?? false,
      this.behavior.sabotage ?? onubBalance.npc.sabotageChance.normal,
    );
    this.m.committed = true;
    this.stats.preps++;
    this.room.send('act.ability', { abilityId: ONUB_PREP, targets: [c.station, c.card] });
  }

  private night(state: QuickState): void {
    const w = this.m.wake;
    if (!w) return;
    const view = w.view;
    if (this.m.actAt < 0) {
      this.m.actAt =
        w.openedTick +
        Math.round(Math.max(0, w.endsTick - w.openedTick) * lerp(this.spans.actFrac, this.rng()));
    }
    if (this.m.steps === 0 ? state.tick < this.m.actAt : state.tick < this.m.stepAt) return;
    if (this.m.steps >= MAX_ACT_SENDS) return;
    let legal = view.legal;
    if (this.m.steps > 0) {
      // After a first step the next `legal` is the `then` act alone; rebuild it when the view did not change.
      const then = onubBalance.acts[this.m.lastAct]?.then;
      const own = view.legal.filter((l) => l.act === then);
      const rebuilt = followUp(this.m.lastAct, listOf(state.onub?.seats), view.cloche);
      legal = own.length ? own : rebuilt ? [rebuilt] : [];
    }
    const plan = planNightAct({ legal, must: view.must }, this.rng);
    if (!plan) {
      this.m.steps = MAX_ACT_SENDS;
      return;
    }
    this.m.steps++;
    this.m.lastAct = plan.act;
    this.stats.acts++;
    this.room.send('act.ability', { abilityId: plan.act, targets: plan.targets });
    // A second step follows the first within a second or two.
    if (onubBalance.acts[plan.act]?.then) {
      this.m.stepAt = Math.min(state.tick + Math.round((0.5 + this.rng()) * TICK_RATE), w.endsTick - 1);
    } else this.m.steps = MAX_ACT_SENDS;
  }

  private morning(state: QuickState, me: PlayerLike): void {
    const m = this.m;
    if (m.claimAt < 0) {
      const rush = Math.max(0, state.phaseEndsTick - state.tick);
      const span = rush + Math.round(onubBalance.timers.voteS * TICK_RATE);
      m.claimAt = state.tick + Math.round(rush * lerp(this.spans.claimFrac, this.rng()));
      m.voteAt = state.tick + Math.round(span * lerp(this.spans.voteFrac, this.rng()));
    }
    if (!m.claimed && state.tick >= m.claimAt) {
      m.claimed = true;
      const prep = me.priv?.onubLoc ? { station: me.priv.onubLoc, card: me.priv.onubCard } : null;
      this.stats.claims++;
      this.room.send('meeting.claim', planClaimOf(this.selfId(), m.role, prep, this.rows));
    } else if (
      m.claimed &&
      !m.bareClaim &&
      state.tick >= m.claimAt + CLAIM_RETRY_TICKS &&
      !listOf(state.meeting?.claims).some((c) => c.from === this.selfId())
    ) {
      m.bareClaim = true;
      const prep = me.priv?.onubLoc ? { station: me.priv.onubLoc, card: me.priv.onubCard } : null;
      this.room.send('meeting.claim', planClaimOf(this.selfId(), m.role, prep, []));
    }
    if (me.hasVoted || state.tick < m.voteAt || m.voteSends >= MAX_VOTE_SENDS) return;
    if (m.votedAt >= 0 && state.tick - m.votedAt < VOTE_RETRY_TICKS) return;
    const seats = listOf(state.onub?.seats);
    const others = seats.filter((id) => id !== this.selfId() && state.players.get(id)?.connected === true);
    const piles: Record<string, { net: number }> = {};
    state.onub?.piles.forEach((pile, station) => (piles[station] = { net: pile.net }));
    const target = planBotVote(
      { self: this.selfId(), others, rows: this.rows, claims: listOf(state.meeting?.claims), piles },
      this.rng,
      this.behavior.smart ?? onubBalance.npc.smartVoteChance.easy,
      this.behavior.pantryVote ?? 0.1,
    );
    if (target === null) return;
    m.votedAt = state.tick;
    m.voteSends++;
    this.stats.votes++;
    if (target === 'pantry') this.stats.pantryVotes++;
    this.room.send('meeting.vote', { targetId: target });
  }
}

// --- The ruin report (GDD 3.11 "Balance and length": the target is 20-30% of matches with a Team Mold card) ---------

/** One finished match as the soak counts it, from `gameOver.onub`. */
export interface RuinSample {
  size: number;
  ruined: boolean;
  /** A seat's dealt Role card is of Team Mold. */
  mold: boolean;
}

/** What a `gameOver.onub` payload says of the match. */
export function ruinSample(over: { dealt: Record<string, string>; ruined: boolean }): RuinSample {
  const dealt = Object.values(over.dealt);
  return {
    size: dealt.length,
    ruined: over.ruined,
    mold: dealt.some((r) => onubRoles.roles[r]?.team === 'mold'),
  };
}

export const RUIN_TARGET = { min: 0.2, max: 0.3 } as const;

/** The ruin rate per party size against the target, as lines of text. */
export function ruinReport(samples: readonly RuinSample[]): string[] {
  const sizes = [...new Set(samples.map((s) => s.size))].sort((a, b) => a - b);
  const pct = (n: number, d: number) => (d === 0 ? '   -' : `${Math.round((100 * n) / d)}%`.padStart(4));
  const lines = ['players  matches  ruined  with Mold  ruin rate (all / with Mold)  vs target 20-30%'];
  for (const size of sizes) {
    const mine = samples.filter((s) => s.size === size);
    const withMold = mine.filter((s) => s.mold);
    const ruined = mine.filter((s) => s.ruined).length;
    const moldRuined = withMold.filter((s) => s.ruined).length;
    const rate = withMold.length === 0 ? NaN : moldRuined / withMold.length;
    const verdict = Number.isNaN(rate)
      ? 'no Mold card dealt'
      : rate < RUIN_TARGET.min
        ? 'below'
        : rate > RUIN_TARGET.max
          ? 'above'
          : 'in range';
    lines.push(
      `${String(size).padStart(7)}  ${String(mine.length).padStart(7)}  ${String(ruined).padStart(6)}  ${String(withMold.length).padStart(9)}  ` +
        `${pct(ruined, mine.length)} / ${pct(moldRuined, withMold.length)}                   ${verdict}`,
    );
  }
  return lines;
}
