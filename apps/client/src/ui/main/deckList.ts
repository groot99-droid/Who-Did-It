import type { LobbySnapshot, NetworkService } from '../../net/NetworkService';

export interface DeckList {
  /** Re-reads the lobby: the mode and the party size. */
  update(s: LobbySnapshot): void;
  destroy(): void;
}

/**
 * The main-mode deck for the current party size, in the lobby under the settings (GDD 3.1: the deck list is public
 * by design). `ui/Lobby.ts` mounts it in its own slot and hides that slot in the quick mode. Pre-seeded as a stub
 * that renders nothing; Session 5G builds it behind this signature (round 5, X6).
 */
export function mountDeckList(_root: HTMLElement, _net: NetworkService): DeckList {
  return { update: () => undefined, destroy: () => undefined };
}
