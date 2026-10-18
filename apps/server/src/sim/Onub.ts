import { ErrorCode, ONUB_PREP, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { refuse } from './Flow';
import { handleOnubAct } from './onub/Acts';
import { handlePrep } from './onub/Prep';
import { clearOnub, isOnub } from './onub/state';

// Quick mode, ONUB v2 (GDD 3.11, ARCHITECTURE 5.14): the deal, the role cards and the hooks the lobby flow and
// the verbs call. Session 5A owns this file; the pre-seed holds the hooks of contract 4.3 with stub bodies, except
// the `handleOnubAbility` dispatcher, which is locked. The match memory is `sim/onub/state.ts`; every random draw
// comes from the match's streams (`room.seeds`, `sim/seeds.ts`), never from a shared rng.

/**
 * The quick-mode deal and role cards (GDD 3.11): called by `startMatch` before the main deal; returns false
 * outside quick mode so the main deal runs. 5A deals from `room.seeds` (`deal`, then `traits`) and honours
 * `debug.deal`.
 */
export function startOnubMatch(room: PartyRoom, ids: readonly string[]): boolean {
  if (!isOnub(room)) return false;
  void ids;
  // Stub until 5A lands: Start is refused to every seat, so no quick-mode match begins.
  room.state.players.forEach((_p: PlayerState, id: string) =>
    refuse(room, id, ErrorCode.cannot, 'cannot start'),
  );
  return true;
}

/** roleReveal -> dusk in quick mode (GDD 3.11): called by `beginPlay` first; false lets the main grace start. */
export function beginOnubPlay(room: PartyRoom): boolean {
  void room;
  return false; // stub until 5A lands
}

/**
 * `act.ability` with an `onub.*` id (`handleAbility`, `sim/Actions.ts`): the prep commit goes to `handlePrep`,
 * every other id to `handleOnubAct`. Locked for round 5.
 */
export function handleOnubAbility(
  room: PartyRoom,
  sessionId: string,
  payload: Record<string, unknown>,
): void {
  if (!isOnub(room)) return refuse(room, sessionId, ErrorCode.cannot, 'cannot do that');
  if (payload.abilityId === ONUB_PREP) return handlePrep(room, sessionId, payload);
  handleOnubAct(room, sessionId, payload);
}

/**
 * `lobby.settings {onubDeck}`: the deck to store, or null when it is not an array of strings or
 * `onubDeckProblem` (without the size) finds a problem. `[]` stores the default (`onubFor(n).deck`).
 */
export function onubDeckSetting(deck: unknown): string[] | null {
  if (!Array.isArray(deck) || !deck.every((id): id is string => typeof id === 'string')) return null;
  return deck.length === 0 ? [] : null; // stub until 5A lands: every custom deck is refused
}

/**
 * Called by `resetToLobby`: clears the match memory and every field of `GameState.onub`, never
 * `Settings.onubDeck`.
 */
export function resetOnubForLobby(room: PartyRoom): void {
  clearOnub(room);
  const board = room.state.onub;
  board.seats.clear();
  board.deck.clear();
  board.piles.clear();
  board.ruinWeight = 0;
  board.ruined = false;
  board.perk = false;
  board.cloche = '';
  board.window = '';
}
