import type { LobbySnapshot, NetworkService } from '../../net/NetworkService';

export interface DeckEditor {
  /** Re-reads the lobby: the mode, the leader, the party size and `settings.onubDeck`. */
  update(s: LobbySnapshot): void;
  destroy(): void;
}

/**
 * The quick-mode deck editor under the lobby settings (GDD 3.11, round-5 contract 5.3): the leader toggles the
 * roles of `roles.onub.json` and sends the deck with `net.setOnubDeck`. Pre-seeded as a stub that renders
 * nothing; Session 5C builds it behind this signature.
 */
export function mountDeckEditor(_root: HTMLElement, _net: NetworkService): DeckEditor {
  return { update: () => undefined, destroy: () => undefined };
}
