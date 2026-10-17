import type { MeetingFeed } from '../../net/meeting';
import type { OnubFeed } from '../../net/onub';

export interface RushPanel {
  /** Re-reads both feeds; `ui/Meeting.ts` calls it with every refresh. */
  update(): void;
  destroy(): void;
}

/**
 * The quick-mode Morning Rush panel (GDD 3.11, round-5 contract 5.3): the board, the claim form and claims, the
 * Pantry vote, CRUST and the reveal lines. `ui/Meeting.ts` mounts it in quick mode (and hides Skip there).
 * Pre-seeded as a stub that renders nothing; Session 5D builds it behind this signature.
 */
export function mountRush(_root: HTMLElement, _meeting: MeetingFeed, _onub: OnubFeed): RushPanel {
  return { update: () => undefined, destroy: () => undefined };
}
