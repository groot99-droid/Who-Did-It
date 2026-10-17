import type { NightRevealEntry, OnubWakeView } from '../protocol/index';
import type { OnubCards } from './onub';
import type { Rng } from './prng';

// Quick mode rules, ONUB v2 (GDD 3.11): the night acts on the card table, the wake view, the vote and the winners.
// Pure functions over plain data; Session 5B fills them. Slots and the table are `onub.ts`. Every body throws
// until 5B fills it.

/** Where one pick of an act may come from (`balance.onub.json` `acts[id].targets`). */
export type OnubTargetKindLike =
  'anySeatCard' | 'anySeatRole' | 'otherSeatRole' | 'otherSeatLoc' | 'pantryRole' | 'pantryLoc';

/** What the rules read of a `balance.onub.json` act. */
export interface OnubActLike {
  id: string;
  targets: readonly OnubTargetKindLike[];
  picks: number;
  effect: 'cloche' | 'peek' | 'swapWithOwn' | 'swapWithPeeked' | 'swapPair';
  reveal: 'picked' | 'ownAfter' | 'ownCards' | 'none';
  then?: string | undefined;
}

/** What the rules read of a `balance.onub.json` window. */
export interface OnubWindowLike {
  order: number;
  role: string;
  seeEachOther: boolean;
  sees: readonly string[];
  acts: readonly string[];
  onlyIfAlone: boolean;
  onTimeout: 'nothing' | 'seededPick';
}

/** The table's shape: seats in the deal order, then the Pantry (`balance.onub.json` `pantry`). */
export interface TableSize {
  seats: number;
  pantryRoles: number;
  pantryLocs: number;
}

/** A reveal row before the server names the seat behind it (`of`). */
export type OnubReveal = Omit<NightRevealEntry, 'of'>;

/**
 * The slots one pick of `act` may name for the seat at deal index `actor` (GDD 3.11): every slot of the act's
 * target kinds (`other*` never the actor's own, `any*` the actor's own included, `pantry*` every Pantry
 * position), minus `cloche`. Empty when the act cannot be made at all: a `swapWithOwn` act whose own card of the
 * target's kind lies under the cloche. Empty for an act without picks. Slot order: seats in deal order, then the
 * Pantry; for `anySeatCard` each seat's Role slot before its Location slot.
 */
export function targetPool(act: OnubActLike, actor: number, size: TableSize, cloche: string): string[] {
  void act;
  void actor;
  void size;
  void cloche;
  throw new Error('targetPool: not implemented (Session 5B)');
}

/**
 * Why a pick list is refused (422), or null: `count` when it does not name exactly `act.picks` slots,
 * `duplicate` when a slot repeats, `slot` when a slot is outside `targetPool` (the cloche included), `step`
 * when a `swapWithPeeked` act has no `peeked` slot or another act arrives while one is pending.
 */
export function actTargetsProblem(
  act: OnubActLike,
  actor: number,
  size: TableSize,
  cloche: string,
  targets: readonly string[],
  peeked: string,
): 'count' | 'duplicate' | 'slot' | 'step' | null {
  void act;
  void actor;
  void size;
  void cloche;
  void targets;
  void peeked;
  throw new Error('actTargetsProblem: not implemented (Session 5B)');
}

export interface CardActResult {
  /** The table after the act: the same multiset of roles and of stations as before, whatever the act. */
  next: OnubCards;
  /** What the actor is shown, per `act.reveal`: the picks before the act, the own card after it, or both own cards. */
  reveal: OnubReveal[];
  /** The slot the act covered (`effect: cloche`), else empty. */
  cloche: string;
  /** The slots for the act log: the actor's own slot first for `swapWithOwn`, the peeked slot first for `swapWithPeeked`, both own slots for `onub.inspect`. */
  logSlots: string[];
}

/**
 * Applies one validated act (`actTargetsProblem` returned null) to the table, for the seat at deal index `actor`.
 * `peeked` is the Pantry slot the actor peeked in the first step, for `swapWithPeeked`. A `peek` or `cloche`
 * changes nothing; a swap exchanges two slots of the same kind. Never refuses: throws on a pick it cannot apply.
 */
export function applyCardAct(
  cards: OnubCards,
  act: OnubActLike,
  actor: number,
  targets: readonly string[],
  peeked: string,
): CardActResult {
  void cards;
  void act;
  void actor;
  void targets;
  void peeked;
  throw new Error('applyCardAct: not implemented (Session 5B)');
}

/**
 * The view a waker's table shows (`nightWake.view`, GDD 3.11), from the DEALT roles (`dealt[i]` is seat `i`'s,
 * `seats[i]` its id): `mates` the other seats dealt `window.role` when `seeEachOther`; `seen` the seats dealt a
 * role of `window.sees`; `alone` when `seeEachOther` and nobody else was dealt the role; `legal` empty once
 * `state.acted`, the `then` act alone while `state.peeked` is set, else the window's acts (none when
 * `onlyIfAlone` and not `alone`) whose `targetPool` holds at least `picks` slots; `must` when
 * `window.onTimeout` is `seededPick`.
 */
export function wakeView(
  window: OnubWindowLike,
  actor: number,
  dealt: readonly string[],
  seats: readonly string[],
  acts: Readonly<Record<string, OnubActLike | undefined>>,
  size: TableSize,
  cloche: string,
  state: { acted: boolean; peeked: string },
): OnubWakeView {
  void window;
  void actor;
  void dealt;
  void seats;
  void acts;
  void size;
  void cloche;
  void state;
  throw new Error('wakeView: not implemented (Session 5B)');
}

/**
 * The picks the server makes for a must-act left undone (the `nightTimeout` stream): `act.picks` distinct slots
 * uniform over `targetPool`, or null when the pool is too small (the act is then skipped).
 */
export function seededTargets(
  act: OnubActLike,
  actor: number,
  size: TableSize,
  cloche: string,
  rng: Rng,
): string[] | null {
  void act;
  void actor;
  void size;
  void cloche;
  void rng;
  throw new Error('seededTargets: not implemented (Session 5B)');
}

// --- The vote and the winners -----------------------------------------------------------------------------

/** What the vote and the winners read of a `roles.onub.json` role. */
export interface OnubRoleInfo {
  team: 'baker' | 'mold' | 'croissant';
  spore: boolean;
  onOut: 'none' | 'dragVote';
}

/** `balance.onub.json` `vote`, as `resolveDawn` reads it. */
export interface OnubVoteRule {
  minVotesToTurnOut: number;
  tiesTurnOutAll: boolean;
  pantryTarget: boolean;
  critiqueHops: number;
}

export interface DawnOutcome {
  /** Votes per seat id, and per `"pantry"`. */
  tally: Record<string, number>;
  /** Seats in the oven, in `seats` order, the Critique's drag included. */
  outs: string[];
  /** The seat a `dragVote` card pulled in, or empty. */
  hop: string;
  /** The Pantry was among the top with at least `minVotesToTurnOut` votes. */
  pantryOut: boolean;
  /** Seats in play whose vote was not counted (none cast, or one for a non-target or for themselves). */
  abstained: string[];
}

/**
 * The CRUST vote (GDD 3.11). `seats` are the seats in play (a leaver is neither a voter nor a target); `votes`
 * maps a voter to a seat id or `"pantry"` (when `pantryTarget`); a vote from or for anyone else, or for oneself,
 * is an abstention. Everyone at the top goes in, ties included (`tiesTurnOutAll`), when the top count reaches
 * `minVotesToTurnOut`; the Pantry at the top only sets `pantryOut`. Then, `critiqueHops` times at most, a seat in
 * `outs` whose final card `onOut` is `dragVote` pulls in the seat it voted for, if that seat is not out yet.
 * `finals` maps every seat to its final Role card.
 */
export function resolveDawn(
  votes: Readonly<Record<string, string>>,
  seats: readonly string[],
  finals: ReadonlyMap<string, string>,
  roleInfo: (roleId: string) => OnubRoleInfo,
  rule: OnubVoteRule,
): DawnOutcome {
  void votes;
  void seats;
  void finals;
  void roleInfo;
  void rule;
  throw new Error('resolveDawn: not implemented (Session 5B)');
}

/** One row of `balance.onub.json` `winners`: every `when` flag that is present must match. */
export interface OnubWinnerRowLike {
  id: string;
  when: {
    ruined?: boolean | undefined;
    croissantOut?: boolean | undefined;
    sporeOut?: boolean | undefined;
    sporeAmongPlayers?: boolean | undefined;
    moldOut?: boolean | undefined;
    anyoneOut?: boolean | undefined;
  };
  winners: readonly ('baker' | 'mold' | 'croissant' | 'nobody')[];
}

/** The facts the winners table is judged on (GDD 3.11), over the final cards. */
export interface OnubWinFlags {
  ruined: boolean;
  /** A seat in `outs` holds a `croissant`-team card. */
  croissantOut: boolean;
  /** A seat in `outs` holds a `spore` card. */
  sporeOut: boolean;
  /** Some seat (in play or not) holds a `spore` card. */
  sporeAmongPlayers: boolean;
  /** A seat in `outs` holds a `mold`-team card. */
  moldOut: boolean;
  anyoneOut: boolean;
}

/** The flags for a dawn: `outs` from `resolveDawn`, `finals` every seat's final Role card, `ruined` from prep. */
export function onubWinFlags(
  outs: readonly string[],
  finals: ReadonlyMap<string, string>,
  ruined: boolean,
  roleInfo: (roleId: string) => OnubRoleInfo,
): OnubWinFlags {
  void outs;
  void finals;
  void ruined;
  void roleInfo;
  throw new Error('onubWinFlags: not implemented (Session 5B)');
}

/**
 * The winners table, first row whose `when` holds (GDD 3.11). The tokens resolve to seats by final card: `baker`,
 * `mold` and `croissant` every seat whose final card is of that team (seats in the oven included), `nobody` no
 * seat. Throws when no row holds (the table's last row must catch every dawn).
 */
export function onubWinners(
  flags: OnubWinFlags,
  finals: ReadonlyMap<string, string>,
  roleInfo: (roleId: string) => OnubRoleInfo,
  rows: readonly OnubWinnerRowLike[],
): { rowId: string; winnerIds: string[] } {
  void flags;
  void finals;
  void roleInfo;
  void rows;
  throw new Error('onubWinners: not implemented (Session 5B)');
}

/**
 * `GameState.winner` for a quick-mode result (GDD 3.11): `croissant` when the row's winners include `croissant`
 * and a seat won with it, else `nobody` when no seat won, else `cabal` for a `mold` row, else `village`.
 */
export function onubWinnerName(
  row: OnubWinnerRowLike,
  winnerIds: readonly string[],
): 'croissant' | 'village' | 'cabal' | 'nobody' {
  void row;
  void winnerIds;
  throw new Error('onubWinnerName: not implemented (Session 5B)');
}
