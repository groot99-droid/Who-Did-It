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

/** `act.ability` with an `onub.*` id (plate-setting at dusk, the night acts). Round 4: Session R. */
export function handleOnubAbility(
  room: PartyRoom,
  sessionId: string,
  _payload: Record<string, unknown>,
): void {
  reject(room, sessionId, ErrorCode.cannot, 'cannot do that');
}

/** Clears the quick-mode room memory at the lobby reset (`resetToLobby`). Round 4: Session R. */
export function resetOnubForLobby(_room: PartyRoom): void {}

function notYet(_room: PartyRoom): boolean {
  throw new Error('M3b: the quick-mode deal is Session R work');
}
