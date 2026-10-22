/**
 * Scene transitions (round 6, docs/round6/cutscene-music.md 2): a full-screen DOM layer that fades, irises or
 * wipes, then runs `then`. With `ms` 0 (the pre-seeded `balance.ui.transitionS`, and every duration under
 * `prefers-reduced-motion`) `then` runs synchronously, so the router's scene starts keep their timing until 6K sets
 * the seconds. The three call sites in `net/worldRouter.ts` are locked. Pre-seeded by 6Z; Session 6K fills it.
 */
export type TransitionKind = 'fade' | 'iris' | 'wipe';

export function transition(_kind: TransitionKind, ms: number, then: () => void): void {
  if (ms <= 0) {
    then();
    return;
  }
  then(); // 6K: play the layer, run `then` on `transitionend` or the timeout fallback
}
