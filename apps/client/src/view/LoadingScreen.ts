import type Phaser from 'phaser';

/**
 * The loading screen (round 6, docs/round6/cutscene-music.md 2): a DOM overlay with a progress bar bound to the
 * loader, shown only once a load has run past 300 ms, with a tip every 4 s from `ui/copy/tips.ts` (no role tells).
 * Mounted by `Preload` and the match preloads (locked call sites). Pre-seeded by 6Z as a no-op; Session 6K fills it.
 */
export function mountLoadingScreen(_scene: Phaser.Scene, _root: HTMLElement): { destroy(): void } {
  return { destroy: () => undefined }; // 6K
}
