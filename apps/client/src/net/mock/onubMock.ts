import mitt, { type Emitter } from 'mitt';
import onubBalance from '@wdi/content/data/balance.onub.json';
import onubRoles from '@wdi/content/data/roles.onub.json';
import { TICK_RATE } from '@wdi/shared/constants';
import type {
  ErrorCode,
  NightRevealEntry,
  OnubClaimPayload,
  RoleRevealPayload,
  S2CPayloads,
  TeamId,
} from '@wdi/shared/protocol';
import { MOCK_BOTS } from '../fixtures';
import type { OnubBoardView, OnubClaimView, OnubFeed, OnubFeedEvents } from '../onub';
import { ONUB_PHASE } from '../onubRouter';
import { createNightMock } from './onubNightMock';
import { createPrepMock } from './onubPrepMock';

// `?mock=1&mode=onub`: a scripted ONUB v2 match with no server (GDD 3.11, round-5 contract 5.3). This composer
// owns the deal, the shared mock clock and the phase script (dusk -> prepReveal -> night -> dawn, then the
// router's mock meeting); it hands prep to `onubPrepMock.ts` (Session 5C) and the night and the claims to
// `onubNightMock.ts` (Session 5D) through the two interfaces below. Pre-seeded and locked for round 5: a half
// that needs more from the composer says so in its PR description.

/** The mock party: you and four bots, dealt from the 5-seat deck (`balance.onub.json` `byCount`). */
const MOCK_SEATS = 5;
const SELF_ID = 'mock-me';
const BOT_SEATS = [...MOCK_BOTS.map(({ id, name }) => ({ id, name })), { id: 'mock-dee', name: 'Dee' }];
/** The Role card the self seat holds unless `?role=<roleId>` names another card of the deck. */
const SELF_ROLE = 'chef';
const SELF_TRAITS: RoleRevealPayload['traits'] = { height: 'mid', scarf: 'red', hat: 'cap' };

type RoleRow = { team: string; cardText: string };
type TeamRow = { name: string; faction: string; goal: string };
const ROLES = onubRoles.roles as Record<string, RoleRow | undefined>;
const TEAMS = onubRoles.teams as Record<string, TeamRow | undefined>;

/** The fixed mock deal, read by both halves. */
export interface MockOnubDeal {
  /** The deal order with public names: slot `seat.<i>.*` is `seats[i]`. */
  seats: { id: string; name: string }[];
  /** The deck in play: `seats.length` + `pantry.roles` Role cards. */
  deck: string[];
  /** Seat id -> the Role card dealt. */
  dealt: Record<string, string>;
  /** The Pantry's Role cards, position `k` at index `k`. */
  pantryRoles: string[];
}

/**
 * The 5-seat deal: the self seat first holding `SELF_ROLE` (or `?role=` when that card is in the deck), the bots
 * the rest of the deck in order, the Pantry what is left.
 */
export function mockOnubDeal(
  selfName = 'You',
  search = typeof location === 'undefined' ? '' : location.search,
): MockOnubDeal {
  const deck = [...onubBalance.byCount[String(MOCK_SEATS) as keyof typeof onubBalance.byCount].deck];
  const asked = new URLSearchParams(search).get('role') ?? SELF_ROLE;
  const own = [asked, SELF_ROLE].find((r) => deck.includes(r)) ?? deck[0] ?? SELF_ROLE;
  const rest = [...deck];
  rest.splice(rest.indexOf(own), 1);
  const seats = [{ id: SELF_ID, name: selfName }, ...BOT_SEATS].slice(0, MOCK_SEATS);
  const ordered = [own, ...rest];
  const dealt = Object.fromEntries(seats.map((s, i) => [s.id, ordered[i] ?? own]));
  return { seats, deck, dealt, pantryRoles: ordered.slice(seats.length) };
}

/** The self seat's quick-mode Role card for `net/mock.ts`'s Start (bugs.md: never a main-mode card here). */
export function onubMockRoleCard(selfName?: string, search?: string): RoleRevealPayload {
  const roleId = mockOnubDeal(selfName, search).dealt[SELF_ID] ?? SELF_ROLE;
  const role = ROLES[roleId];
  const team = TEAMS[role?.team ?? ''];
  const faction = team?.faction;
  return {
    roleId,
    team: (faction === 'cabal' || faction === 'neutral' ? faction : 'village') satisfies TeamId,
    goal: team?.goal ?? '',
    abilities: [],
    inventory: [],
    cardText: role?.cardText ?? '',
    beware: onubRoles.cardLine,
    teammates: [],
    traits: SELF_TRAITS,
    teamName: team?.name ?? '',
  };
}

/** What the composer lends each half: the deal, the shared clock, the bus and a way to refuse. */
export interface MockOnubContext {
  readonly selfId: string;
  readonly deal: MockOnubDeal;
  /** The feed's bus: a half emits `nightWake`, `nightReveal`, `nightSleep` and `claims` on it. */
  readonly bus: Emitter<OnubFeedEvents>;
  /** The shared mock clock, in ticks (`?speed=N` runs it N times faster). */
  clock(): { phase: number; phaseEndsTick: number; tick: number };
  /** Seconds as ticks of the shared clock. */
  ticks(seconds: number): number;
  /** Runs `fn` after `seconds` of the shared clock; cleared on dispose. */
  later(fn: () => void, seconds: number): void;
  /** Ends the current phase now (prep once every seat has committed, the night once its script is done). */
  endPhase(): void;
  /** Emits `board` with the composed board. */
  boardChanged(): void;
  /** Refuses a call the way the server's `error` would (425 wrong phase, 422 cannot). */
  refuse(code: ErrorCode, msg: string): void;
}

/** Session 5C's half (`onubPrepMock.ts`): Evening Prep and the public board. */
export interface MockOnubPrepHalf {
  prep(stationId: string, cardId: string): void;
  myPrep(): { station: string; card: string } | null;
  /** The board; the composer puts the night half's `cloche` on it. */
  board(): OnubBoardView;
  /** Dusk is over: the half completes missing commits and resolves the piles for prepReveal. */
  endPrep(): void;
  dispose(): void;
}

/** Session 5D's half (`onubNightMock.ts`): the windows, what a seat learns and the claims. */
export interface MockOnubNightHalf {
  act(abilityId: string, targets: readonly string[]): void;
  wake(): S2CPayloads['nightWake'] | null;
  reveals(): readonly NightRevealEntry[];
  claims(): readonly OnubClaimView[];
  claim(c: OnubClaimPayload): void;
  /**
   * The night began: the half schedules its windows with `later` (it emits nothing before returning) and
   * returns the night's length in seconds; the composer then announces the night.
   */
  beginNight(): number;
  /** The Iron Cloche's slot from dawn on, else empty. */
  cloche(): string;
  dispose(): void;
}

export interface MockOnubOptions {
  selfName?: string | undefined;
  /** A refusal, as the network's `error` event. */
  onRefuse?(code: ErrorCode, msg: string): void;
  /** Dawn is over: the caller opens the mock Morning Rush (`meetingStart`, reason `dawn`). */
  onDawnEnd?(): void;
  /** The query string the deal and the speed read (defaults to `location.search`). */
  search?: string;
}

const PHASE_ROLE_REVEAL = 1;

export class MockOnubFeed implements OnubFeed {
  readonly bus: Emitter<OnubFeedEvents> = mitt<OnubFeedEvents>();
  readonly selfId = SELF_ID;
  private readonly deal: MockOnubDeal;
  private readonly speed: number;
  private readonly prepHalf: MockOnubPrepHalf;
  private readonly nightHalf: MockOnubNightHalf;
  private readonly startedAt = performance.now();
  private phase: number = PHASE_ROLE_REVEAL;
  private phaseEndsTick = 0;
  private phaseTimer: number | null = null;
  private timers: number[] = [];

  constructor(private readonly opts: MockOnubOptions = {}) {
    const search = opts.search ?? (typeof location === 'undefined' ? '' : location.search);
    this.deal = mockOnubDeal(opts.selfName, search);
    this.speed = Math.max(0.05, Number(new URLSearchParams(search).get('speed') ?? 1) || 1);
    const ctx: MockOnubContext = {
      selfId: this.selfId,
      deal: this.deal,
      bus: this.bus,
      clock: () => this.clock(),
      ticks: (s) => this.ticks(s),
      later: (fn, s) => {
        this.timers.push(window.setTimeout(fn, this.ms(s)));
      },
      endPhase: () => this.advance(),
      boardChanged: () => this.bus.emit('board', this.board()),
      refuse: (code, msg) => this.opts.onRefuse?.(code, msg),
    };
    this.prepHalf = createPrepMock(ctx);
    this.nightHalf = createNightMock(ctx);
  }

  /** The role card is done: Evening Prep begins. */
  start(): void {
    if (this.phase === PHASE_ROLE_REVEAL) this.enter(ONUB_PHASE.dusk, onubBalance.timers.prepS);
  }

  clock() {
    return { phase: this.phase, phaseEndsTick: this.phaseEndsTick, tick: this.nowTick() };
  }

  seats(): { id: string; name: string }[] {
    return this.deal.seats.map((s) => ({ ...s }));
  }

  board(): OnubBoardView {
    return { ...this.prepHalf.board(), cloche: this.nightHalf.cloche() };
  }

  dealtRole(): string {
    return this.deal.dealt[this.selfId] ?? '';
  }

  myPrep(): { station: string; card: string } | null {
    return this.prepHalf.myPrep();
  }

  reveals(): readonly NightRevealEntry[] {
    return this.nightHalf.reveals();
  }

  wake(): S2CPayloads['nightWake'] | null {
    return this.nightHalf.wake();
  }

  claims(): readonly OnubClaimView[] {
    return this.nightHalf.claims();
  }

  prep(stationId: string, cardId: string): void {
    this.prepHalf.prep(stationId, cardId);
  }

  act(abilityId: string, targets: readonly string[]): void {
    this.nightHalf.act(abilityId, targets);
  }

  claim(c: OnubClaimPayload): void {
    this.nightHalf.claim(c);
  }

  dispose(): void {
    if (this.phaseTimer !== null) window.clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    this.prepHalf.dispose();
    this.nightHalf.dispose();
    this.bus.all.clear();
  }

  /** The phase script: dusk -> prepReveal -> night -> dawn -> the caller's meeting. */
  private advance(): void {
    if (this.phaseTimer !== null) window.clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
    switch (this.phase) {
      case ONUB_PHASE.dusk:
        this.prepHalf.endPrep();
        this.enter(ONUB_PHASE.prepReveal, onubBalance.timers.prepRevealS);
        this.bus.emit('board', this.board());
        break;
      case ONUB_PHASE.prepReveal:
        // `beginNight` only schedules: the Night scene is up before the half's first window opens.
        this.enter(ONUB_PHASE.night, Math.max(onubBalance.timers.fadeS, this.nightHalf.beginNight()));
        break;
      case ONUB_PHASE.night:
        this.enter(ONUB_PHASE.dawn, onubBalance.timers.dawnS);
        this.bus.emit('board', this.board());
        break;
      case ONUB_PHASE.dawn:
        this.phaseEndsTick = 0;
        this.opts.onDawnEnd?.();
        break;
    }
  }

  /** Sets the phase and its end, schedules the next step and announces it. */
  private enter(phase: number, seconds: number): void {
    this.phase = phase;
    this.phaseEndsTick = this.nowTick() + this.ticks(seconds);
    this.phaseTimer = window.setTimeout(() => this.advance(), this.ms(seconds));
    this.bus.emit('phaseChange', { phase, endsTick: this.phaseEndsTick });
  }

  private ticks(seconds: number): number {
    return Math.max(1, Math.round(seconds * TICK_RATE));
  }

  private ms(seconds: number): number {
    return (seconds * 1000) / this.speed;
  }

  private nowTick(): number {
    return Math.round(((performance.now() - this.startedAt) * this.speed * TICK_RATE) / 1000);
  }
}
