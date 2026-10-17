import {
  type DawnOutcome,
  GameMode,
  type NightWindow,
  type OnubActLogEntry,
  type OnubCards,
  type OnubCommit,
  type PrepOutcome,
  type TableSize,
} from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';

// Room memory of one quick-mode match (GDD 3.11, ARCHITECTURE 5.14): never on the wire. Pre-seeded and locked
// for round 5: 5A writes the deal and prep fields, 5B the night and morning fields, 5E reads. A field another
// session needs goes in the PR description; the orchestrator adds it.

/** Where the Conductor is inside the night. */
export type NightStage = 'idle' | 'fade' | 'window' | 'done';

export interface OnubState {
  // --- The deal (5A, `startOnubMatch`) ---------------------------------------------------------------
  /** The deal order: slot `seat.<i>.*` is `seats[i]`; mirrored to `OnubBoard.seats`. */
  seats: string[];
  /** The deck in play (`Settings.onubDeck`, or `onubFor(n).deck`); mirrored to `OnubBoard.deck`. */
  deck: string[];
  /** Seat id -> the Role card dealt: the role card, and the window the seat wakes for all night. */
  dealt: Map<string, string>;
  /** The Pantry as dealt, position `k` at index `k`. */
  pantryRolesDealt: string[];
  pantryLocsDealt: string[];
  // --- Evening Prep (5A, `sim/onub/Prep.ts`) -----------------------------------------------------------
  /** Seat id -> its prep, human or server-made. */
  commits: Map<string, OnubCommit>;
  /** Seats whose prep the server made when the timer ran out. */
  prepAuto: Set<string>;
  /** The resolved piles, from the end of prep. */
  prep: PrepOutcome | null;
  /** The table: set by 5A with `tableAtNight` when prep ends, changed only by 5B's acts; final at dawn. */
  cards: OnubCards;
  // --- The night (5B, `sim/Conductor.ts`, `sim/onub/Acts.ts`) ------------------------------------------
  script: NightWindow[];
  stage: NightStage;
  windowIdx: number;
  /** When the current stage ends: the window's close, or the end of its fade. */
  stageEndsTick: number;
  /** Seats woken for the open window (dealt its role). */
  wakers: string[];
  /** Seats that have finished their act this window. */
  acted: Set<string>;
  /** Seat id -> the Pantry slot it peeked in a first step (the Tourrier), until its second step. */
  peeked: Map<string, string>;
  /** The Iron Cloche's slot, or empty. */
  cloche: string;
  actLog: OnubActLogEntry[];
  // --- The morning (5B, quick branches of `sim/Meeting.ts` and `sim/Win.ts`) ---------------------------
  /** Voter -> seat id or `"pantry"`, as counted at the reveal. */
  votes: Record<string, string>;
  dawn: DawnOutcome | null;
}

const states = new WeakMap<PartyRoom, OnubState>();

/** Quick mode is on for this party (`Settings.mode`, ARCHITECTURE 5.14). */
export const isOnub = (room: PartyRoom): boolean => room.state.settings.mode === GameMode.onub;
export const onubOf = (room: PartyRoom): OnubState | undefined => states.get(room);
export const setOnub = (room: PartyRoom, s: OnubState): void => {
  states.set(room, s);
};
export const clearOnub = (room: PartyRoom): void => {
  states.delete(room);
};

/** A fresh match memory after the deal: prep, night and morning fields empty, the table empty until prep ends. */
export function createOnubState(
  seats: readonly string[],
  deck: readonly string[],
  dealt: ReadonlyMap<string, string>,
  pantryRolesDealt: readonly string[],
  pantryLocsDealt: readonly string[],
): OnubState {
  return {
    seats: [...seats],
    deck: [...deck],
    dealt: new Map(dealt),
    pantryRolesDealt: [...pantryRolesDealt],
    pantryLocsDealt: [...pantryLocsDealt],
    commits: new Map(),
    prepAuto: new Set(),
    prep: null,
    cards: { roles: new Map(), locs: new Map() },
    script: [],
    stage: 'idle',
    windowIdx: -1,
    stageEndsTick: 0,
    wakers: [],
    acted: new Set(),
    peeked: new Map(),
    cloche: '',
    actLog: [],
    votes: {},
    dawn: null,
  };
}

/** A seat's index in the deal order (-1 for a non-seat). */
export const seatIndexOf = (o: OnubState, seatId: string): number => o.seats.indexOf(seatId);

/** The table's shape, for the rules. */
export const tableSizeOf = (o: OnubState): TableSize => ({
  seats: o.seats.length,
  pantryRoles: o.pantryRolesDealt.length,
  pantryLocs: o.pantryLocsDealt.length,
});
