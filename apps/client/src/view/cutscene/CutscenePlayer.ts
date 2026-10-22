import type Phaser from 'phaser';
import type { AudioBus } from '../AudioBus';

/**
 * Plays a cutscene in-engine (round 6, docs/round6/cutscene-music.md 1.3): camera pans and zooms on the scene's
 * ground, DOM captions by copy id, sounds on the `AudioBus`, Skip on Esc or a tap when the cutscene allows it.
 * Reduce-motion turns pans into cuts; `?cutscene=0` disables every cutscene. Pre-seeded by 6Z as a player that
 * finishes at once; Session 6J fills it. Both World.ts call sites are locked (docs/round6/seams.md 1.4).
 */
export type CutsceneOutcome = 'done' | 'skipped' | 'none';

export class CutscenePlayer {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly overlay: HTMLElement,
    private readonly audio: AudioBus,
  ) {}

  /** Plays the opening the router left under `REG_CUTSCENE`, if any, and clears it. */
  playPending(registry: Phaser.Data.DataManager, key: string): Promise<CutsceneOutcome> {
    const pending = registry.get(key) as string | undefined;
    if (pending !== undefined) registry.remove(key);
    return Promise.resolve('none'); // 6J: this.play(cutscenes.cutscenes[pending])
  }

  /** Plays the death cutscene of a `killed`; resolves at once when it names none. */
  playDeath(_cutsceneId: string | undefined): Promise<CutsceneOutcome> {
    return Promise.resolve('none'); // 6J
  }

  destroy(): void {
    void this.scene;
    void this.overlay;
    void this.audio;
  }
}
