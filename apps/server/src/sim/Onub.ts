import { GameMode } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { ErrorCode } from '@wdi/shared';
import { reject } from './World';

/** Quick mode is on for this party (`Settings.mode`, ARCHITECTURE 5.14). */
export const isOnub = (room: PartyRoom): boolean => room.state.settings.mode === GameMode.onub;

/**
 * The quick-mode deal and role cards (GDD 3.11): called by `startMatch` before the main deal. Returns
 * false when the party is not in quick mode so the main deal runs. Round 4: Session R.
 */
export function startOnubMatch(room: PartyRoom, _ids: readonly string[], _rng: () => number): boolean {
  return isOnub(room) ? notYet(room) : false;
}

/**
 * roleReveal -> dusk in quick mode (GDD 3.11): called by `beginPlay` first; returns false outside quick
 * mode so the main grace phase starts. Round 4: Session R.
 */
export function beginOnubPlay(room: PartyRoom): boolean {
  return isOnub(room) ? notYet(room) : false;
}

/** `act.ability` with an `onub.*` id (plate-setting at dusk, the night acts). Round 4: Session R. */
export function handleOnubAbility(
  room: PartyRoom,
  sessionId: string,
  _payload: Record<string, unknown>,
): void {
  reject(room, sessionId, ErrorCode.cannot, 'cannot do that');
}

/** The `bk.plate_<slot>` prop of a seat (its index in the deal order, A39), or null outside quick mode. Round 4: R. */
export function plateOf(_room: PartyRoom, _seatId: string): string | null {
  return null;
}

/**
 * For an NPC seat awake in the bakery: the act it means to make and its targets, chosen by the Conductor at
 * the window's start, so the NPC brain (S) can walk there and send it; null otherwise. Round 4: R.
 */
export function onubNpcPlan(
  _room: PartyRoom,
  _seatId: string,
): { abilityId: string; targetId: string; targetId2?: string } | null {
  return null;
}

/** Clears the quick-mode room memory at the lobby reset (`resetToLobby`). Round 4: Session R. */
export function resetOnubForLobby(_room: PartyRoom): void {}

function notYet(_room: PartyRoom): boolean {
  throw new Error('M3b: the quick-mode deal is Session R work');
}
