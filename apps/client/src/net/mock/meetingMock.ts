import mitt, { type Emitter } from 'mitt';
import balanceJson from '@wdi/content/data/balance.json';
import { TICK_RATE } from '@wdi/shared';
import {
  type ChatLine,
  type GameOver,
  type MeetingFeed,
  type MeetingFeedEvents,
  type MeetingInfo,
  type MeetingPlayer,
  type MeetingStart,
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
  reason: 'body' | 'bell';
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

  constructor(
    roster: ReadonlyArray<Pick<MeetingPlayer, 'id' | 'name' | 'traits'> & { look?: string }>,
    readonly selfId: string,
    private readonly opts: MockMeetingOptions,
  ) {
    this.players = roster.map((p) => ({ ...p, look: p.look ?? '', alive: true, hasVoted: false }));
  }

  roster(): MeetingPlayer[] {
    return this.players.map((p) => ({ ...p }));
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

  /** The mock takes a vote at once (its specs vote on open), so it never holds the buttons. */
  votesOpenTick(): number {
    return 0;
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
    const talkS = balanceJson.byCount[String(n) as keyof typeof balanceJson.byCount].discussionS;
    const voteS = balanceJson.phases.voteS;
    this.setPhase(PHASE.discussion, talkS);

    const botVotes = mockBotVotes(this.roster(), this.selfId, req.reason);
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
    this.later(() => this.setPhase(PHASE.vote, voteS), talkS * 1000);
    this.later(() => this.reveal(), (talkS + voteS) * 1000);
  }

  dispose(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    this.bus.all.clear();
  }

  private checkAllVoted(): void {
    if (this.phase !== PHASE.discussion && this.phase !== PHASE.vote) return;
    if (this.players.filter((p) => p.alive).every((p) => this.votes[p.id] !== undefined)) this.reveal();
  }

  private reveal(): void {
    if (this.phase === PHASE.reveal || this.phase === PHASE.gameOver) return;
    this.clearTimers();
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

  /** The mock ends the match at the first ejection: the village wins if the Cabal took the vote. */
  private finish(ejectedRole: string): void {
    const roles: Record<string, string> = {};
    for (const p of this.players) roles[p.id] = this.roleOf(p);
    const winner = CABAL.has(ejectedRole) ? 1 : 2;
    this.end({
      winner,
      roles,
      summary: winner === 1 ? 'The Cabal was voted out.' : 'The village voted out one of its own.',
    });
  }

  /** Game over, then the lobby after the mock's short card. */
  private end(over: GameOver): void {
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
