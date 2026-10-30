import { balance, deckFor, roles } from '@wdi/content';
import { dealDeck } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { flowOf } from './Flow';
import { initBodies } from './body/state';
import { beginPaintTown, humansOf, paintDeal, paintsTown } from './paintTown';
import { drawArrival } from './vendettas/arrival';
import { drawVendettas } from './vendettas/state';

// The main-mode deal from the deck (GDD 3.1, round-5 `deck/wire.md` 4.4 and 5). Round 10, 10C owns this file; the hook
// below is called from its locked site in `rooms/handlers/lobby.ts`.

/** The deck for a party of `seats`: the party size is clamped to the rows `roles.json` holds (4 to 10). */
export function deckCardsFor(seats: number): string[] {
  const n = Math.min(balance.players.max, Math.max(balance.players.min, seats));
  return [...deckFor(n).cards];
}

const holdsKnife = (card: string): boolean => roles.roles[card]?.abilities.includes('kill') === true;

/**
 * Whether `fixed` (a `debug.deal` request, seat id -> card) can be dealt from the deck of a party of `seats`: only
 * cards of the deck, each as often as the deck holds it (`deck/wire.md` 5).
 */
export function fixedDealFits(fixed: Record<string, string>, seats: number): boolean {
  const left = deckCardsFor(seats);
  for (const card of Object.values(fixed)) {
    const at = left.indexOf(card);
    if (at < 0) return false;
    left.splice(at, 1);
  }
  // Every Killer card left must still find a seat (`dealDeck` throws otherwise).
  return left.filter(holdsKnife).length <= Math.max(balance.players.min, seats) - Object.keys(fixed).length;
}

/**
 * `startMatch`, before the roster deal: deals `deckFor(n).cards` with `dealDeck` (`rules/deck.ts`) on
 * `room.seeds.get('deal')`, every Killer card always dealt, keeps `flow.deck` and `flow.undealt` and returns seat
 * -> card role id. A pending `debug.deal` places its fixed cards first and deals the rest from what remains, the
 * remaining Killer cards still always dealt.
 */
export function dealMainDeck(room: PartyRoom, ids: readonly string[]): Map<string, string> {
  const flow = flowOf(room);
  if (paintsTown(room, ids)) return dealPaintTown(room, ids); // round 10, C5 (GDD 3.8)
  const cards = deckCardsFor(ids.length);
  const fixed = flow.fixedDeal;
  flow.fixedDeal = null;

  const dealt = new Map<string, string>();
  const left = [...cards];
  for (const id of ids) {
    const card = fixed?.[id];
    if (card === undefined) continue;
    const at = left.indexOf(card);
    if (at < 0) continue; // the party changed size since the request; the seat is dealt like any other
    left.splice(at, 1);
    dealt.set(id, card);
  }
  const open = ids.filter((id) => !dealt.has(id));
  const deal = dealDeck(open, left, holdsKnife, room.seeds.get('deal'));
  for (const [id, card] of deal.dealt) dealt.set(id, card);

  flow.deck = cards;
  flow.undealt = deal.undealt;
  drawVendettas(room, dealt); // round 7, 7H: one vendetta per Killer seat, on its own stream (GDD 3.20)
  drawArrival(room, ids); // round 10, C4: the Hitman's arrival, on the secret `hitman` stream (GDD 3.33)
  initBodies(room); // round 8, 8A: every seat whole at the deal (GDD 3.22, locked call site)
  return dealt;
}

/**
 * Paint The Town Red's deal (round 10, C5; world-mode.md 1.6): the deck gains a second Killer (`paintDeck`), both
 * humans take the Killer cards, and the NPC seats are dealt the rest on the same stream, the Vicar always
 * (`paintDeal`). No vendetta, and a pending
 * `debug.deal` is dropped.
 */
function dealPaintTown(room: PartyRoom, ids: readonly string[]): Map<string, string> {
  const flow = flowOf(room);
  flow.fixedDeal = null;
  const humans = humansOf(room, ids);
  const npcs = ids.filter((id) => !humans.includes(id));
  const { cards, dealt, undealt } = paintDeal(humans, npcs, deckCardsFor(ids.length), room.seeds.get('deal'));
  flow.deck = cards;
  flow.undealt = undealt;
  beginPaintTown(room, humans, npcs.length);
  initBodies(room); // round 8, 8A: every seat whole at the deal (GDD 3.22, locked call site)
  return dealt;
}

/** The card that wins alone when the vote ejects it (GDD 3.1, 3.8). */
const EJECTION_WINNER = 'drifter';

/**
 * Main mode's end-screen facts beside the winner (GDD 3.1, 3.8; `gameOver.undealt`, `.alsoWon`): the cards nobody
 * held, and every seat the vote ejected as the Drifter, who wins whichever faction ends the match.
 */
export function gameOverExtras(room: PartyRoom): { undealt: string[]; alsoWon?: string[] } {
  const flow = flowOf(room);
  const alsoWon = flow.meetings
    .filter((m) => m.ejectedRole === EJECTION_WINNER)
    .flatMap((m) => (m.ejectedId === undefined ? [] : [m.ejectedId]));
  return { undealt: [...flow.undealt], ...(alsoWon.length > 0 && { alsoWon }) };
}
