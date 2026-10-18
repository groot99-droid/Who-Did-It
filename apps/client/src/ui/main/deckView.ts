import { DECK_COPY as C, fill } from '../copy';
import { h } from '../dom';
import { cardCounts, cardName } from './cards';

/** The deck as a list of card names, a repeated card with its count (shared by the lobby list and the HUD chip). */
export function deckItems(cards: readonly string[]): HTMLElement[] {
  return cardCounts(cards).map(({ id, count }) =>
    h(
      'li',
      { class: 'wdi-deck__card', 'data-testid': `deck-card-${id}` },
      count > 1 ? fill(C['deck.twice'], { name: cardName(id) }) : cardName(id),
    ),
  );
}
