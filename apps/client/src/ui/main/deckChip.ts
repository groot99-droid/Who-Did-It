import { DECK_COPY as C, fill } from '../copy';
import { h } from '../dom';
import { deckItems } from './deckView';

export interface DeckChip {
  destroy(): void;
}

/**
 * The HUD deck chip (GDD 3.1, 3.17): the match's deck from `roleReveal.deck`, so every seat can check a claim
 * against the cards in play. A button opens the list; `view/Hud.ts` mounts it once the card's deck is known (main
 * mode only). The list is the same for every seat: it holds no deal, only the cards.
 */
export function mountDeckChip(root: HTMLElement, deck: readonly string[]): DeckChip {
  const list = h(
    'ul',
    { class: 'wdi-deck__cards', 'data-testid': 'hud-deck-list', hidden: true },
    ...deckItems(deck),
  );
  const button = h(
    'button',
    {
      type: 'button',
      class: 'wdi-btn wdi-btn--ghost wdi-deck__toggle',
      'aria-expanded': 'false',
      'aria-label': C['deck.chip.open'],
      'data-testid': 'hud-deck-toggle',
    },
    fill(C['deck.chip.label'], { cards: deck.length }),
  );
  const onClick = (): void => {
    const open = list.hidden;
    list.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? C['deck.chip.close'] : C['deck.chip.open']);
  };
  button.addEventListener('click', onClick);
  const el = h('div', { class: 'wdi-deck wdi-deck--chip', 'data-testid': 'hud-deck-chip' }, button, list);
  root.append(el);
  return {
    destroy: () => {
      button.removeEventListener('click', onClick);
      el.remove();
    },
  };
}
