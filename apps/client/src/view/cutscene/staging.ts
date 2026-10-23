/**
 * Shots in other scenes (round 7, 7A, DECISIONS A101): a camera step whose `sceneId` is not the scene the seat stands
 * in is filmed on a stage, a second Phaser scene drawn over the World with that scene's ground and statics, built for
 * the shot and disposed after it. This module is the Phaser-free part: which scenes a cutscene needs staged, and what
 * a camera step does with the stage. `CutsceneStage.ts` is the stage itself.
 */

/** The stage as the player drives it; `CutsceneStage` implements it and tests pass a fake. */
export interface Stage {
  /** Starts loading these scenes' maps; a shot in a scene not yet loaded is skipped. */
  prepare(sceneIds: readonly string[]): void;
  /** Builds `sceneId` on the stage (dropping the scene shown before) and shows it; false while it is not loaded. */
  show(sceneId: string): boolean;
  /** Hides the stage, so the World shows again; what was built is disposed. */
  hide(): void;
  /** Ends the stage for good. */
  dispose(): void;
}

/** Where a camera step films: the World (`home`), the stage (`staged`), or nowhere yet (`skip`). */
export type ShotPlace = 'home' | 'staged' | 'skip';

/** The scenes of a cutscene's camera steps that are not `home`, each once, in order of first use. */
export function stagedScenes(
  steps: ReadonlyArray<{ t: string; sceneId?: unknown }>,
  home: string | undefined,
): string[] {
  const out: string[] = [];
  for (const s of steps) {
    if (s.t !== 'camera' || typeof s.sceneId !== 'string' || s.sceneId === home) continue;
    if (!out.includes(s.sceneId)) out.push(s.sceneId);
  }
  return out;
}

/** One cutscene's use of the stage: prepared at the start, switched per camera step, disposed at the end. */
export class Staging {
  private current: string | null = null;
  private ended = false;

  private readonly stage: Stage | null;

  /** `open` is called once, and only when some camera step films outside `home`. */
  constructor(
    private readonly home: string | undefined,
    open: () => Stage | null,
    steps: ReadonlyArray<{ t: string; sceneId?: unknown }>,
  ) {
    const ids = home === undefined ? [] : stagedScenes(steps, home);
    this.stage = ids.length > 0 ? open() : null;
    this.stage?.prepare(ids);
  }

  /** The scene a shot is filmed in now (`home` included), or null before the first shot. */
  get showing(): string | null {
    return this.current;
  }

  /** A camera step in `sceneId` begins; returns where it is filmed. A change of scene is a cut. */
  shot(sceneId: string): ShotPlace {
    if (this.ended) return 'skip';
    if (this.home === undefined || sceneId === this.home) {
      if (this.current !== null && this.current !== sceneId) this.stage?.hide();
      this.current = sceneId;
      return 'home';
    }
    if (this.stage === null || !this.stage.show(sceneId)) return 'skip';
    this.current = sceneId;
    return 'staged';
  }

  /** The cutscene ended (done or skipped): the stage goes away. */
  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.stage?.dispose();
  }
}
