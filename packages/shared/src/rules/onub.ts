import type { Rng } from './prng';

// Quick mode rules, ONUB v2 (GDD 3.11, ARCHITECTURE 5.14): pure functions over plain data. The decks, stations,
// cards, windows, vote rule and winners table are `balance.onub.json`, the roles `roles.onub.json`; the caller
// passes in what a function needs, since `@wdi/shared` cannot import `@wdi/content`. This file is the table
// (slots), the deal, the deck check, Evening Prep and the night script: Session 5A fills it. The night acts, the
// wake view, the vote and the winners are `onubNight.ts` (Session 5B). The slot helpers, `tableAtNight` and
// `nightScript` are implemented in the pre-seed; every other body throws until 5A fills it.

// --- Slots ----------------------------------------------------------------------------------------------

/** A card's kind: a Role card or a Location card. */
export type SlotKind = 'role' | 'loc';

/**
 * A parsed slot id. Card slots are `seat.<i>.role`, `seat.<i>.loc`, `pantry.role.<k>` and `pantry.loc.<k>`, where
 * `i` is the seat's index in the deal order (`OnubBoard.seats`) and `k` the Pantry position; `seat.<i>` (kind
 * `seat`) names a seat itself, for a `mate` reveal.
 */
export interface ParsedSlot {
  owner: 'seat' | 'pantry';
  index: number;
  kind: SlotKind | 'seat';
}

export const seatSlot = (index: number, kind: SlotKind): string => `seat.${index}.${kind}`;
export const pantrySlot = (kind: SlotKind, k: number): string => `pantry.${kind}.${k}`;
export const mateSlot = (index: number): string => `seat.${index}`;

const SLOT_RE = /^(?:seat\.(\d+)(?:\.(role|loc))?|pantry\.(role|loc)\.(\d+))$/;

/** The parts of a slot id, or null for anything that is not one. */
export function parseSlot(slot: string): ParsedSlot | null {
  const m = SLOT_RE.exec(slot);
  if (!m) return null;
  if (m[1] !== undefined) {
    return { owner: 'seat', index: Number(m[1]), kind: (m[2] as SlotKind | undefined) ?? 'seat' };
  }
  return { owner: 'pantry', index: Number(m[4]), kind: m[3] as SlotKind };
}

/** The table at night: slot -> role id for every Role card, slot -> station id for every Location card. */
export interface OnubCards {
  roles: Map<string, string>;
  locs: Map<string, string>;
}

/**
 * The table as the night starts: seat `i` holds `seatRoles[i]` and `seatLocs[i]`, Pantry position `k` holds
 * `pantryRoles[k]` and `pantryLocs[k]`. Throws when the two seat lists differ in length.
 */
export function tableAtNight(
  seatRoles: readonly string[],
  seatLocs: readonly string[],
  pantryRoles: readonly string[],
  pantryLocs: readonly string[],
): OnubCards {
  if (seatRoles.length !== seatLocs.length) {
    throw new Error(`${seatRoles.length} seat roles for ${seatLocs.length} seat locations`);
  }
  const roles = new Map<string, string>();
  const locs = new Map<string, string>();
  seatRoles.forEach((r, i) => roles.set(seatSlot(i, 'role'), r));
  seatLocs.forEach((l, i) => locs.set(seatSlot(i, 'loc'), l));
  pantryRoles.forEach((r, k) => roles.set(pantrySlot('role', k), r));
  pantryLocs.forEach((l, k) => locs.set(pantrySlot('loc', k), l));
  return { roles, locs };
}

// --- The deal and the deck --------------------------------------------------------------------------------

/**
 * Deals `deck` to `seats` (the deal order): seat `i` gets the `i`-th card of a shuffle, the rest go to the Pantry
 * in order. The deck is the party size plus `pantry.roles` cards (`onubDeckProblem` with a size has checked it);
 * throws when it does not leave at least one card for the Pantry. Draws only from `rng` (the `deal` stream).
 */
export function dealOnub(
  seats: readonly string[],
  deck: readonly string[],
  rng: Rng,
): { dealt: Map<string, string>; pantry: string[] } {
  void seats;
  void deck;
  void rng;
  throw new Error('dealOnub: not implemented (Session 5A)');
}

/**
 * The Pantry's Location cards: `count` draws, each uniform over `stationIds`, repeats allowed (GDD 3.11). Called
 * on the `deal` stream right after `dealOnub`.
 */
export function dealPantryLocs(stationIds: readonly string[], count: number, rng: Rng): string[] {
  void stationIds;
  void count;
  void rng;
  throw new Error('dealPantryLocs: not implemented (Session 5A)');
}

/** What the deck check reads of a `roles.onub.json` role. */
export interface OnubDeckRole {
  ships: string;
  /** Allowed non-zero copy counts. */
  copies: readonly number[];
  required: boolean;
}

/** Why a deck is refused, in the order the checks run; each has an `onub.deck.problem.<id>` line (UI 14.12). */
export type OnubDeckProblem = 'unknownRole' | 'notShipped' | 'copies' | 'missingRequired' | 'size';

/**
 * The first problem with a quick-mode deck, or null (GDD 3.11): every id a role of `roles`, every role shipping
 * in `V1`, each role's count one of its `copies`, every `required` role present, and, when `size` is given (at
 * Start: seats after the NPC fill plus `pantry.roles`), exactly `size` cards. `lobby.settings` checks without
 * the size, since the party may still grow or shrink.
 */
export function onubDeckProblem(
  deck: readonly string[],
  roles: Readonly<Record<string, OnubDeckRole | undefined>>,
  size?: number,
): OnubDeckProblem | null {
  void deck;
  void roles;
  void size;
  throw new Error('onubDeckProblem: not implemented (Session 5A)');
}

// --- Evening Prep -----------------------------------------------------------------------------------------

/** What prep reads of a `balance.onub.json` station. */
export interface OnubStationLike {
  id: string;
  good: readonly string[];
  sabotage: readonly string[];
  weight: number;
  underMixBelow?: number | undefined;
  underMixWeight?: number | undefined;
  perk?: 'peekPantryLoc' | undefined;
}

/** What prep reads of a `balance.onub.json` ingredient card. */
export interface OnubCardLike {
  kind: 'good' | 'sabotage';
  effect: 'none' | 'discardRandomOther';
}

/** One seat's prep: the station it worked and the Ingredient card it played there. */
export interface OnubCommit {
  station: string;
  card: string;
}

/**
 * Why `onub.prep` is refused (422): `station` not a station id; `card` not in that station's good cards, nor in
 * its sabotage cards for a seat whose dealt role `sabotages`. Null when the commit is legal.
 */
export function prepCommitProblem(
  commit: OnubCommit,
  stations: readonly OnubStationLike[],
  sabotages: boolean,
): 'station' | 'card' | null {
  void commit;
  void stations;
  void sabotages;
  throw new Error('prepCommitProblem: not implemented (Session 5A)');
}

/**
 * The commit the server makes for a seat that did not commit by the end of prep: a station uniform over
 * `stations`, then a good card uniform over that station's `good` (the `prepTimeout` stream).
 */
export function timeoutCommit(stations: readonly OnubStationLike[], rng: Rng): OnubCommit {
  void stations;
  void rng;
  throw new Error('timeoutCommit: not implemented (Session 5A)');
}

/** One resolved pile: the cards left face up in seeded order, the cards the thaw discarded, the net and the flag. */
export interface PrepPile {
  cards: string[];
  lost: string[];
  net: number;
  underMixed: boolean;
}

export interface PrepOutcome {
  /** Station id -> pile, every station present (an empty pile when nobody worked there). */
  piles: Record<string, PrepPile>;
  ruinWeight: number;
  ruined: boolean;
  /** The proofing perk: the station whose visitors peek and the Pantry Location slot they all see; null if it did not fire. */
  perk: { station: string; slot: string } | null;
}

/** `balance.onub.json` `ruin`, as `resolvePrep` reads it. */
export interface OnubRuinRule {
  /** The ruin threshold for a party size `weightByCount` does not list. */
  weight: number;
  /** Party size (a `PLAYER_COUNTS` key) -> the ruin threshold at that size (GDD 3.11). */
  weightByCount?: Readonly<Record<string, number>> | undefined;
  /** What one good card takes off its station's net. */
  goodCancels: number;
}

/**
 * The streams `resolvePrep` draws from (`sim/seeds.ts`), one per kind of draw, so nothing secret shares a stream
 * with anything public: `piles` the public order of each pile, `thaw` which card a Thermostat Flip discards (never
 * shown before game over), `perk` the Pantry Location card the proofing visitors see (private to them).
 */
export interface OnubPrepStreams {
  piles: Rng;
  thaw: Rng;
  perk: Rng;
}

/**
 * Resolves every pile (GDD 3.11 "The crime scenes"), drawing in this order:
 * 1. per station in `stations` order: the pile is the card ids committed there, sorted by id, then `shuffle`d
 *    (`rngs.piles`), so its order says nothing about who committed which card or when;
 * 2. per station, for each `discardRandomOther` card in pile order that is still in the pile while another card
 *    is: one other card, uniform over the rest of the pile (`rngs.thaw`), moves to `lost`;
 * 3. per station: net = max(0, sabotage cards x `weight` - good cards x `rule.goodCancels`) over the cards left;
 *    `underMixed` when the station has `underMixBelow` and 0 < its visitors < `underMixBelow`;
 * 4. ruinWeight = the nets plus `underMixWeight` per flag; ruined when ruinWeight >=
 *    `rule.weightByCount[seats.length] ?? rule.weight`;
 * 5. for the first station with `perk`: when it had a visitor and no sabotage card was committed there, one
 *    Pantry Location position `k` uniform over `pantryLocs` (`rngs.perk`), and `perk.slot` is `pantry.loc.<k>`.
 * `seats` is every seat of the match (the party size is `seats.length`). Throws on a commit naming an unknown
 * station or card (the handler refused those).
 */
export function resolvePrep(
  commits: ReadonlyMap<string, OnubCommit>,
  seats: readonly string[],
  stations: readonly OnubStationLike[],
  cards: Readonly<Record<string, OnubCardLike | undefined>>,
  rule: OnubRuinRule,
  pantryLocs: number,
  rngs: OnubPrepStreams,
): PrepOutcome {
  void commits;
  void seats;
  void stations;
  void cards;
  void rule;
  void pantryLocs;
  void rngs;
  throw new Error('resolvePrep: not implemented (Session 5A)');
}

// --- The night script ---------------------------------------------------------------------------------------

/** One night window as the Conductor runs it: `role` wakes for `seconds`, jitter included, before the fade. */
export interface NightWindow {
  order: number;
  role: string;
  /** Window length in seconds including its seeded jitter, before the fade. */
  seconds: number;
}

/**
 * Every window whose role is in the deck (dealt or in the Pantry), in `order`, each with a seeded jitter in
 * [0, jitterMaxS] (the `script` stream). It reads the deck and the rng only, never who holds what, so the night's
 * shape leaks nothing about the deal. Unchanged from round 4.
 */
export function nightScript(
  deck: readonly string[],
  windows: readonly { order: number; role: string; seconds: number }[],
  rng: Rng,
  jitterMaxS: number,
): NightWindow[] {
  const present = new Set(deck);
  return windows
    .filter((w) => present.has(w.role))
    .sort((a, b) => a.order - b.order)
    .map((w) => ({
      order: w.order,
      role: w.role,
      seconds: Math.round((w.seconds + rng() * jitterMaxS) * 10) / 10,
    }));
}
