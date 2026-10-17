import type { OnubGameOver } from '../../net/meeting';

/**
 * The quick-mode end panel under the role list (GDD 3.11, round-5 contract 5.3): every seat's final Role and
 * Location card, the Pantry, the piles and the night's act log. `ui/GameOver.ts` calls it when `over.onub` is
 * set. Pre-seeded as a stub that renders nothing; Session 5D builds it behind this signature.
 */
export function renderOnubOver(
  _root: HTMLElement,
  _over: OnubGameOver,
  _names: (id: string) => string,
): void {
  return undefined;
}
