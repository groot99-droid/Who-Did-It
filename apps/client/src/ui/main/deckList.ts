import type { LobbySnapshot, NetworkService } from '../../net/NetworkService';
import { DECK_COPY as C, fill } from '../copy';
import { h } from '../dom';
import { deckOfParty } from './cards';
import { deckItems } from './deckView';

export interface DeckList {
  /** Re-reads the lobby: the party size. */
  update(s: LobbySnapshot): void;
  destroy(): void;
}

/**
 * The main-mode deck for the current party size, in the lobby under the settings (GDD 3.1: the deck list is public
 * by design). `ui/Lobby.ts` mounts it in its own slot. The party fills to the minimum with NPC seats at Start, so the list
 * is the deck of at least four seats.
 */
export function mountDeckList(root: HTMLElement, _net: NetworkService): DeckList {
  let shown = '';
  const update = (s: LobbySnapshot): void => {
    const deck = deckOfParty(s.players.length);
    const key = deck === null ? '' : `${deck.seats}:${deck.cards.join(',')}`;
    if (key === shown) return;
    shown = key;
    root.replaceChildren();
    if (deck === null) return;
    root.append(
      h(
        'section',
        { class: 'wdi-deck wdi-lobby__stack', 'aria-label': C['deck.title'], 'data-testid': 'lobby-deck' },
        h('h3', { class: 'wdi-glass-panel__title' }, C['deck.title']),
        h(
          'p',
          { class: 'wdi-glass-panel__hint', 'data-testid': 'lobby-deck-size' },
          fill(C['deck.size'], { cards: deck.cards.length, players: deck.seats }),
        ),
        h('ul', { class: 'wdi-deck__cards' }, ...deckItems(deck.cards)),
        h('p', { class: 'wdi-glass-panel__hint' }, C['deck.note']),
        deck.practice &&
          h(
            'p',
            { class: 'wdi-glass-panel__hint', 'data-testid': 'lobby-deck-practice' },
            C['deck.practice'],
          ),
      ),
    );
  };
  return {
    update,
    destroy: () => root.replaceChildren(),
  };
}
