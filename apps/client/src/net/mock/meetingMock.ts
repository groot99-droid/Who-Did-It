import mitt, { type Emitter } from 'mitt';
import balanceJson from '@wdi/content/data/balance.json';
import onubBalance from '@wdi/content/data/balance.onub.json';
import onubRoles from '@wdi/content/data/roles.onub.json';
import { TICK_RATE } from '@wdi/shared';
import {
  type ChatLine,
  type ClaimRow,
  type GameOver,
  type MatchMode,
  type MeetingFeed,
  type MeetingFeedEvents,
  type MeetingInfo,
  type MeetingPlayer,
  type MeetingStart,
  type OnubGameOver,
  SKIP,
  type VoteResult,
} from '../meeting';

// A local stand-in for the server's meeting stage behind ?mock=1: discussion -> vote -> reveal with six
// bots, the same message shapes and phase ids as K's server. Lengths come from balance.json; the pacing
// constants below only decide when the bots speak and vote, and how long the mock game-over card shows
// before the lobby (a mock-only shortcut, the real length is `phases.gameOverS`).

/** `Phase` ids of the schema (mirrored, as the server mirrors them in constants). */
const PHASE = { lobby: 0, discussion: 7, vote: 8, reveal: 9, gameOver: 12 } as const;
const BOT_VOTE_STEP_MS = 450;
const BOT_VOTE_FIRST_MS = 900;
const MOCK_GAME_OVER_MS = 4000;
const MOCK_SEED = 4242;

/** Mock-only role table, keyed by display name (the mock world and the mock lobby use different ids). */
const MOCK_ROLES: Record<string, string> = {
  Ada: 'accomplice',
  Bo: 'detective',
  Cy: 'doctor',
};
const SELF_ROLE = 'killer';
const CABAL = new Set(['killer', 'accomplice']);

export interface MockMeetingRequest {
  /** `dawn` is the quick-mode meeting; the mock plays quick mode on it (round 4, U). */
  reason: 'body' | 'bell' | 'dawn';
  callerId: string;
  bodyOf?: string;
}

export type MockMeetingOutcome = 'resume' | 'gameOver';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * The bots' votes. After a body the village piles on one suspect (all but one bot, so the plurality holds
 * whatever the player picks); after a bell there is nothing to go on and they Skip. Pure and seeded.
 */
export function mockBotVotes(
  roster: readonly MeetingPlayer[],
  selfId: string,
  reason: MeetingStart['reason'],
  seed = MOCK_SEED,
): Record<string, string> {
  const rand = rng(seed);
  const living = roster.filter((p) => p.alive);
  const bots = living.filter((p) => p.id !== selfId);
  const out: Record<string, string> = {};
  if (reason === 'bell') {
    for (const b of bots) out[b.id] = SKIP;
    return out;
  }
  // The suspect Skips, the first bot (if it is not the suspect) votes for someone else, the rest pile on.
  // At most two votes can then land anywhere else (that bot and the player), so the plurality holds.
  const suspect = bots[Math.floor(rand() * bots.length)];
  bots.forEach((b, i) => {
    if (b.id === suspect?.id) out[b.id] = SKIP;
    else if (i === 0) {
      const others = bots.filter((o) => o.id !== b.id);
      out[b.id] = others[Math.floor(rand() * others.length)]?.id ?? SKIP;
    } else out[b.id] = suspect?.id ?? SKIP;
  });
  return out;
}

/** Plurality; a tie or a Skip plurality ejects nobody (GDD 3.8, DECISIONS A30). */
export function tallyVotes(votes: Record<string, string>): {
  tally: Record<string, number>;
  ejectedId?: string;
} {
  const tally: Record<string, number> = {};
  for (const target of Object.values(votes)) tally[target] = (tally[target] ?? 0) + 1;
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const [top, runnerUp] = ranked;
  if (top === undefined || top[0] === SKIP || runnerUp?.[1] === top[1]) return { tally };
  return { tally, ejectedId: top[0] };
}

// --- quick mode (reason `dawn`), a stand-in for R's rules until they land -----------------------------------

/** The mock deal: dealt role per seat index (the first six seats of the 6-seat deck, GDD 3.11) and the dead's loaves. */
const MOCK_DEALT = ['cutpurse', 'poisoner', 'busybody', 'mourner', 'sinEater', 'debtor'];
const MOCK_CENTER = ['poisoner', 'hireling', 'mourner'];
/** The mock night: the Cutpurse (seat 0) takes seat 1's loaf, then the Busybody (seat 2) swaps seats 3 and 5. */
const MOCK_SWAPS: Array<{ roleId: string; act: string; seats: [number, number] }> = [
  { roleId: 'cutpurse', act: 'onub.take', seats: [0, 1] },
  { roleId: 'busybody', act: 'onub.swapPlates', seats: [3, 5] },
];
/** The first seat index that never votes (it and any seat after it), so the reveal names abstainers. */
const MOCK_ABSTAINER = 5;

export interface MockDeal {
  dealt: string[];
  final: string[];
  center: string[];
  swapLog: OnubGameOver['swapLog'];
}

/** Replays the mock night from the dealt loaves; the log's slots are plate ids (`bk.plate_<slot>`). */
export function mockOnubDeal(seats: number): MockDeal {
  const dealt = Array.from({ length: seats }, (_, i) => MOCK_DEALT[i] ?? 'mourner');
  const final = [...dealt];
  const swapLog: OnubGameOver['swapLog'] = [];
  MOCK_SWAPS.forEach((sw, i) => {
    const [a, b] = sw.seats;
    if (a >= seats || b >= seats) return;
    [final[a], final[b]] = [final[b] ?? '', final[a] ?? ''];
    swapLog.push({ order: i + 1, roleId: sw.roleId, act: sw.act, slots: [`bk.plate_${a}`, `bk.plate_${b}`] });
  });
  return { dealt, final, center: MOCK_CENTER, swapLog };
}

/**
 * The dawn bots' votes: two seats end in a tie whatever the player does about the rest, the last seat
 * abstains, nobody votes Skip or themselves.
 */
export function mockDawnVotes(roster: readonly MeetingPlayer[]): Record<string, string> {
  const ids = roster.map((p) => p.id);
  const at = (i: number) => ids[i % ids.length] ?? '';
  const out: Record<string, string> = {};
  out[at(1)] = at(2);
  out[at(2)] = at(1);
  out[at(3)] = at(1);
  out[at(4)] = at(2);
  return out;
}

/** Quick-mode resolution: everyone holding the most votes, if that is at least the minimum; ties included. */
export function tallyDawn(votes: Record<string, string>): { tally: Record<string, number>; outs: string[] } {
  const tally: Record<string, number> = {};
  for (const target of Object.values(votes)) tally[target] = (tally[target] ?? 0) + 1;
  const top = Math.max(0, ...Object.values(tally));
  const outs =
    top >= onubBalance.vote.minVotesToTurnOut ? Object.keys(tally).filter((id) => tally[id] === top) : [];
  return { tally, outs };
}

/** The winners table of `balance.onub.json`, judged on the final loaves (a mock stand-in for `onubWinners`). */
export function mockWinners(
  outsRoles: readonly string[],
  finals: readonly string[],
  center: readonly string[],
): { rowId: string; winnerSeats: number[] } {
  const flags = {
    debtorOut: outsRoles.includes('debtor'),
    poisonerOut: outsRoles.includes('poisoner'),
    poisonerAmongMourners: finals.includes('poisoner'),
    anyoneOut: outsRoles.length > 0,
  };
  const row =
    onubBalance.winners.find((w) =>
      Object.entries(w.when).every(([k, v]) => flags[k as keyof typeof flags] === v),
    ) ?? onubBalance.winners[0];
  const faction = (r: string) => (onubRoles.roles as Record<string, { faction: string }>)[r]?.faction;
  const seats = finals.map((_, i) => i);
  const winnerSeats = new Set<number>();
  for (const token of row?.winners ?? []) {
    for (const i of seats) {
      const r = finals[i] ?? '';
      if (token === 'village' && faction(r) !== 'cabal' && r !== 'debtor') winnerSeats.add(i);
      if (token === 'cabal' && faction(r) === 'cabal') winnerSeats.add(i);
      if (token === 'debtor' && r === 'debtor') winnerSeats.add(i);
      if (token === 'hirelingIfMourner' && r === 'hireling' && !center.includes(r)) winnerSeats.add(i);
    }
  }
  return { rowId: row?.id ?? '', winnerSeats: [...winnerSeats] };
}

export interface MockMeetingOptions {
  /** Called when the mock meeting is over and the world should carry on (`resume`) or the match ended. */
  onDone(outcome: MockMeetingOutcome): void;
}

export class MockMeetingFeed implements MeetingFeed {
  readonly bus: Emitter<MeetingFeedEvents> = mitt<MeetingFeedEvents>();
  private readonly players: MeetingPlayer[];
  private info: MeetingInfo = { phase: 0, reason: '', callerId: '', bodyOf: '', endsTick: 0 };
  private begun: MeetingStart | null = null;
  private tally: VoteResult | null = null;
  private final: GameOver | null = null;
  private log: ChatLine[] = [];
  private votes: Record<string, string> = {};
  private mine = '';
  private timers: number[] = [];
  private startedAt = performance.now();
  private phase: number = PHASE.lobby;
  private endsAt = 0;
  private quick = false;
  private claimRows = new Map<string, ClaimRow>();
  private dealt: MockDeal = mockOnubDeal(0);

  constructor(
    roster: ReadonlyArray<Pick<MeetingPlayer, 'id' | 'name' | 'traits'>>,
    readonly selfId: string,
    private readonly opts: MockMeetingOptions,
  ) {
    this.players = roster.map((p) => ({ ...p, alive: true, hasVoted: false }));
  }

  mode(): MatchMode {
    return this.quick ? 'onub' : 'main';
  }

  roster(): MeetingPlayer[] {
    return this.players.map((p) => ({ ...p }));
  }

  claims(): readonly ClaimRow[] {
    return [...this.claimRows.values()];
  }

  traces(): readonly string[] {
    if (!this.quick) return [];
    return [...new Set(onubBalance.windows.map((w) => w.traceText).filter((t) => t !== ''))];
  }

  claim(roleId: string, targetId = '', sawRoleId = ''): void {
    const me = this.players.find((p) => p.id === this.selfId);
    if (!this.quick || !me?.alive || (this.phase !== PHASE.discussion && this.phase !== PHASE.vote)) return;
    if (!(roleId in onubRoles.roles)) return;
    this.claimRows.set(this.selfId, { from: this.selfId, roleId, targetId, sawRoleId });
  }

  meeting(): MeetingInfo {
    return { ...this.info };
  }

  clock() {
    return { tick: this.nowTick(), phase: this.phase, phaseEndsTick: this.msToTick(this.endsAt) };
  }

  myVote(): string {
    return this.mine;
  }

  started(): MeetingStart | null {
    return this.begun;
  }

  result(): VoteResult | null {
    return this.tally;
  }

  over(): GameOver | null {
    return this.final;
  }

  lines(): readonly ChatLine[] {
    return this.log;
  }

  vote(targetId: string): void {
    const me = this.players.find((p) => p.id === this.selfId);
    if (!me?.alive || (this.phase !== PHASE.discussion && this.phase !== PHASE.vote)) return;
    const living = this.players.some((p) => p.alive && p.id === targetId);
    if (targetId !== SKIP && !living) return;
    // Quick mode has no Skip and no vote for yourself (GDD 3.11).
    if (this.quick && (targetId === SKIP || targetId === this.selfId)) return;
    this.mine = targetId;
    this.votes[this.selfId] = targetId;
    me.hasVoted = true;
    this.checkAllVoted();
  }

  say(text: string): void {
    const me = this.players.find((p) => p.id === this.selfId);
    const trimmed = text.trim().slice(0, balanceJson.chat.maxChars);
    if (trimmed === '') return;
    const line: ChatLine = { from: this.selfId, text: trimmed, channel: me?.alive ? 'meeting' : 'ghost' };
    this.log.push(line);
    this.bus.emit('chat.msg', line);
  }

  /** Opens the meeting: the mirror of the server's `meetingStart` followed by the discussion phase. */
  begin(req: MockMeetingRequest): void {
    this.startedAt = performance.now();
    this.log = [];
    this.votes = {};
    this.mine = '';
    this.tally = null;
    this.quick = req.reason === 'dawn';
    this.claimRows = new Map();
    this.dealt = mockOnubDeal(this.players.length);
    for (const p of this.players) p.hasVoted = false;
    const dead = req.bodyOf === undefined ? undefined : this.players.find((p) => p.id === req.bodyOf);
    if (dead) dead.alive = false;
    const start: MeetingStart = {
      reason: req.reason,
      callerId: req.callerId,
      ...(req.bodyOf === undefined ? {} : { bodyOf: req.bodyOf }),
      missing: [],
    };
    this.begun = start;
    this.info = {
      phase: PHASE.discussion,
      reason: req.reason,
      callerId: req.callerId,
      bodyOf: req.bodyOf ?? '',
      endsTick: 0,
    };
    this.bus.emit('meetingStart', start);
    const n = Math.min(10, Math.max(4, this.players.length));
    const row = this.quick
      ? onubBalance.byCount[String(n) as keyof typeof onubBalance.byCount]
      : balanceJson.byCount[String(n) as keyof typeof balanceJson.byCount];
    const voteS = this.quick ? onubBalance.timers.voteS : balanceJson.phases.voteS;
    this.setPhase(PHASE.discussion, row.discussionS);

    if (this.quick) this.scheduleClaims();
    const botVotes = this.quick
      ? mockDawnVotes(this.roster())
      : mockBotVotes(this.roster(), this.selfId, req.reason as MeetingStart['reason']);
    Object.entries(botVotes).forEach(([id, target], i) =>
      this.later(
        () => {
          if (this.phase !== PHASE.discussion && this.phase !== PHASE.vote) return;
          this.votes[id] = target;
          const bot = this.players.find((p) => p.id === id);
          if (bot) bot.hasVoted = true;
          this.checkAllVoted();
        },
        BOT_VOTE_FIRST_MS + BOT_VOTE_STEP_MS * i,
      ),
    );
    this.later(() => this.setPhase(PHASE.vote, voteS), row.discussionS * 1000);
    this.later(() => this.reveal(), (row.discussionS + voteS) * 1000);
  }

  dispose(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    this.bus.all.clear();
  }

  private checkAllVoted(): void {
    if (this.phase !== PHASE.discussion && this.phase !== PHASE.vote) return;
    // The mock abstainer never votes, so quick mode ends once everyone else has (a mock-only shortcut: the
    // real server waits out the vote timer for a seat that does not vote).
    const voters = this.players.filter((p, i) => p.alive && !(this.quick && i >= MOCK_ABSTAINER));
    if (voters.every((p) => this.votes[p.id] !== undefined)) this.reveal();
  }

  /** The bots speak up a few seconds into the discussion; one of them lies. */
  private scheduleClaims(): void {
    const seat = (i: number) => this.players[i]?.id ?? '';
    const post = (i: number, row: Omit<ClaimRow, 'from'>, ms: number) =>
      this.later(() => this.claimRows.set(seat(i), { from: seat(i), ...row }), ms);
    post(2, { roleId: 'busybody', targetId: '', sawRoleId: '' }, 1500);
    post(4, { roleId: 'sinEater', targetId: seat(1), sawRoleId: 'cutpurse' }, 2500);
    post(1, { roleId: 'mourner', targetId: '', sawRoleId: '' }, 3500);
  }

  private reveal(): void {
    if (this.phase === PHASE.reveal || this.phase === PHASE.gameOver) return;
    this.clearTimers();
    if (this.quick) return this.revealDawn();
    const { tally, ejectedId } = tallyVotes(this.votes);
    const ejected = ejectedId === undefined ? undefined : this.players.find((p) => p.id === ejectedId);
    const role = ejected === undefined ? undefined : this.roleOf(ejected);
    this.setPhase(PHASE.reveal, balanceJson.phases.revealS);
    const result: VoteResult = {
      tally,
      ...(ejectedId === undefined ? {} : { ejectedId }),
      ...(role === undefined ? {} : { role }),
    };
    this.tally = result;
    if (ejected) ejected.alive = false;
    this.bus.emit('voteResult', result);
    this.later(
      () => (ejected ? this.finish(role ?? '') : this.opts.onDone('resume')),
      balanceJson.phases.revealS * 1000,
    );
  }

  /** Quick mode: the plural reveal (ties turn out everyone), the abstainers named, then the match ends. */
  private revealDawn(): void {
    const { tally, outs } = tallyDawn(this.votes);
    const idx = (id: string) => this.players.findIndex((p) => p.id === id);
    const roles: Record<string, string> = {};
    for (const id of outs) roles[id] = this.dealt.final[idx(id)] ?? '';
    const abstained = this.players.filter((p) => p.alive && this.votes[p.id] === undefined).map((p) => p.id);
    this.setPhase(PHASE.reveal, onubBalance.timers.revealS);
    const result: VoteResult = { tally, outs, roles, abstained };
    this.tally = result;
    for (const p of this.players) if (outs.includes(p.id)) p.alive = false;
    this.bus.emit('voteResult', result);
    this.later(() => this.finishDawn(outs), onubBalance.timers.revealS * 1000);
  }

  private finishDawn(outs: string[]): void {
    const { dealt, final, center, swapLog } = this.dealt;
    const outsRoles = outs.map((id) => final[this.players.findIndex((p) => p.id === id)] ?? '');
    const { rowId, winnerSeats } = mockWinners(outsRoles, final, center);
    const row = onubBalance.winners.find((w) => w.id === rowId);
    const seatMap = <T>(values: T[]): Record<string, T> =>
      Object.fromEntries(this.players.map((p, i) => [p.id, values[i] as T]));
    const onub: OnubGameOver = {
      dealt: seatMap(dealt),
      final: seatMap(final),
      center: [...center],
      swapLog,
      votes: { ...this.votes },
      outs,
      plates: Object.fromEntries(this.players.map((p, i) => [`bk.plate_${i}`, p.id])),
      rowId,
      winnerIds: winnerSeats.map((i) => this.players[i]?.id ?? ''),
    };
    const winner = outsRoles.includes('debtor')
      ? 4
      : rowId.startsWith('cabal')
        ? 2
        : rowId === 'storm'
          ? 5
          : 1;
    const over: GameOver = { winner, roles: seatMap(final), summary: row?.text ?? '', onub };
    this.final = over;
    this.setPhase(PHASE.gameOver, MOCK_GAME_OVER_MS / 1000);
    this.bus.emit('gameOver', over);
    this.opts.onDone('gameOver');
    this.later(() => this.setPhase(PHASE.lobby, 0), MOCK_GAME_OVER_MS);
  }

  /** The mock ends the match at the first ejection: the village wins if the Cabal took the vote. */
  private finish(ejectedRole: string): void {
    const roles: Record<string, string> = {};
    for (const p of this.players) roles[p.id] = this.roleOf(p);
    const winner = CABAL.has(ejectedRole) ? 1 : 2;
    const over: GameOver = {
      winner,
      roles,
      summary: winner === 1 ? 'The Cabal was voted out.' : 'The village voted out one of its own.',
    };
    this.final = over;
    this.setPhase(PHASE.gameOver, MOCK_GAME_OVER_MS / 1000);
    this.bus.emit('gameOver', over);
    this.opts.onDone('gameOver');
    this.later(() => {
      this.setPhase(PHASE.lobby, 0);
    }, MOCK_GAME_OVER_MS);
  }

  private roleOf(p: MeetingPlayer): string {
    return p.id === this.selfId ? SELF_ROLE : (MOCK_ROLES[p.name] ?? 'townsfolk');
  }

  private setPhase(phase: number, seconds: number): void {
    this.phase = phase;
    this.endsAt = seconds > 0 ? performance.now() + seconds * 1000 : 0;
    this.info = { ...this.info, phase, endsTick: this.msToTick(this.endsAt) };
    this.bus.emit('phaseChange', { phase, endsTick: this.msToTick(this.endsAt) });
  }

  private nowTick(): number {
    return this.msToTick(performance.now());
  }

  private msToTick(ms: number): number {
    return ms <= 0 ? 0 : Math.round(((ms - this.startedAt) * TICK_RATE) / 1000) + 1;
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
  }
}
