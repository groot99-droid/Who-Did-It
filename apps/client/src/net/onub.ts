import type { Emitter } from 'mitt';
import type { NightRevealEntry, OnubClaimPayload, S2CPayloads } from '@wdi/shared/protocol';

// What the ONUB v2 screens (Kitchen, Night, the Rush panel, the end panel, the deck editor) read from the network
// (GDD 3.11). `ColyseusOnubFeed` (`net/onubColyseus.ts`, 5D) reads the room; `MockOnubFeed`
// (`net/mock/onubMock.ts`, pre-seeded composer of 5C's prep mock and 5D's night mock) plays a scripted match on
// `?mock=1&mode=onub`. Votes and chat stay on the MeetingFeed. Pre-seeded and locked for round 5.

/** One pile on the public board (`OnubBoard.piles[station]`). */
export interface OnubPileView {
  cards: string[];
  lost: number;
  net: number;
  underMixed: boolean;
}

/** `GameState.onub` as plain data; empty arrays and an empty `piles` before they are filled. */
export interface OnubBoardView {
  seats: string[];
  deck: string[];
  piles: Record<string, OnubPileView>;
  ruinWeight: number;
  ruined: boolean;
  perk: boolean;
  cloche: string;
}

/** One seat's latest claim (`MeetingState.claims`); empty strings are parts left out. */
export interface OnubClaimView {
  from: string;
  roleId: string;
  stationId: string;
  cardId: string;
  saw: { targetId: string; roleId: string; stationId: string }[];
}

export type OnubFeedEvents = {
  nightWake: S2CPayloads['nightWake'];
  nightReveal: S2CPayloads['nightReveal'];
  nightSleep: S2CPayloads['nightSleep'];
  phaseChange: S2CPayloads['phaseChange'];
  /** Any change of `GameState.onub` (the board). */
  board: OnubBoardView;
  /** Any change of `MeetingState.claims`. */
  claims: readonly OnubClaimView[];
};

export interface OnubFeed {
  readonly bus: Emitter<OnubFeedEvents>;
  readonly selfId: string;
  /** `state.phase`, `state.phaseEndsTick` and `state.tick`. */
  clock(): { phase: number; phaseEndsTick: number; tick: number };
  /** Every seat in the deal order with its public name (empty before the role card). */
  seats(): { id: string; name: string }[];
  board(): OnubBoardView;
  /** The Role card this seat was dealt (`Private.role.roleId`); the client never knows the current one. */
  dealtRole(): string;
  /** This seat's prep once committed, by itself or by the server (`Private.onubLoc`, `Private.onubCard`). */
  myPrep(): { station: string; card: string } | null;
  /** Everything this seat learned, oldest first (`Private.nightReveal`). */
  reveals(): readonly NightRevealEntry[];
  /** This seat's open window (the latest `nightWake`), or null while it sleeps and outside the night. */
  wake(): S2CPayloads['nightWake'] | null;
  /** Every seat's latest claim. */
  claims(): readonly OnubClaimView[];
  /** `act.ability {abilityId: 'onub.prep', targets: [stationId, cardId]}`. */
  prep(stationId: string, cardId: string): void;
  /** `act.ability {abilityId, targets}` for a night act. */
  act(abilityId: string, targets: readonly string[]): void;
  /** `meeting.claim`. */
  claim(c: OnubClaimPayload): void;
  dispose(): void;
}

/** Phaser registry key under which the router publishes the active ONUB feed. */
export const REG_ONUB = 'onubFeed';
