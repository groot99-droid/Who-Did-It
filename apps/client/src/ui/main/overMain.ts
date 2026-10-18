import type { GameOver, MeetingPlayer } from '../../net/meeting';

/**
 * The main-mode end panel (GDD 3.1, 3.8, 3.17): every seat's role and look, `over.undealt` and `over.alsoWon`.
 * `ui/GameOver.ts` mounts it under the role list in the main mode. Pre-seeded as a stub that renders nothing;
 * Session 5G builds it behind this signature (round 5, X6).
 */
export function renderMainOver(
  _root: HTMLElement,
  _over: GameOver,
  _players: (id: string) => MeetingPlayer | undefined,
): void {
  // Pre-seed: nothing.
}
