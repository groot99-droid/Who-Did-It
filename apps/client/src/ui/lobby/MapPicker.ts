import type { LobbySnapshot, NetworkService } from '../../net/NetworkService';

export interface MapPicker {
  /** Re-reads the lobby: the mode, the leader and `settings.map`. */
  update(s: LobbySnapshot): void;
  destroy(): void;
}

/**
 * The lobby's map row (GDD 3.13, round-5 world schemas 9.2): the name, the blurb and the thumbnail of every map
 * whose `modes` holds the chosen mode, under the frozen test id `map-select`. The leader picks with `net.setMap`;
 * everyone else reads one line. `ui/Lobby.ts` mounts it in its own slot under the settings and hides that slot in
 * the quick mode. Pre-seeded as a stub that renders nothing; Session 5J builds it behind this signature.
 */
export function mountMapPicker(_root: HTMLElement, _net: NetworkService): MapPicker {
  return { update: () => undefined, destroy: () => undefined };
}
