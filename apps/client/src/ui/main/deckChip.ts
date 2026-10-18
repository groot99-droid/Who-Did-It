export interface DeckChip {
  destroy(): void;
}

/**
 * The HUD deck chip (GDD 3.1, 3.17): the match's deck from `roleReveal.deck`, so every seat can check a claim
 * against the cards in play. `view/Hud.ts` mounts it once the card's deck is known (main mode only). Pre-seeded as a
 * stub that renders nothing; Session 5G builds it behind this signature (round 5, X6).
 */
export function mountDeckChip(_root: HTMLElement, _deck: readonly string[]): DeckChip {
  return { destroy: () => undefined };
}
