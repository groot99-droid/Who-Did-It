import type { PartyRoom } from '../rooms/PartyRoom';

// The main-mode deal from the deck (GDD 3.1, round-5 `deck/wire.md` 4.4). Session 5G owns this file; the round-5
// pre-seed holds the hook below with a stub body, called from its locked site in `rooms/handlers/lobby.ts`.

/**
 * `startMatch` (main mode), before the roster deal: deals `deckFor(n).cards` with `dealDeck` (`rules/deck.ts`) on
 * `room.seeds.get('deal')`, every Killer card always dealt, keeps `flow.deck` and `flow.undealt` and returns seat
 * -> card role id (honouring `debug.deal`). Pre-seed stub: returns null, so the roster deal runs as today.
 */
export function dealMainDeck(room: PartyRoom, ids: readonly string[]): Map<string, string> | null {
  void room;
  void ids;
  return null;
}
