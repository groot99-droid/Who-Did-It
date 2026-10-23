import Phaser from 'phaser';
import cutscenesJson from '@wdi/content/data/cutscenes/cutscenes.json';
import type { Cutscene, CutscenesFile } from '@wdi/content';
import { TILE_PX } from '@wdi/shared/constants';
import { toScreen } from '@wdi/shared/iso';
import { REG_INPUT } from '../../net/world';
import { REG_CUTSCENE } from '../../scenes/registry';
import { CUTSCENE_COPY, cutsceneLine } from '../../ui/copy/cutscenes';
import { h } from '../../ui/dom';
import type { AudioBus, AudioKey } from '../AudioBus';
import { readDevFlags } from '../devFlags';
import { isoZoom } from '../iso';
import { Captions } from './Captions';
import {
  CUTSCENE_END,
  type CameraLeg,
  type CutsceneEnd,
  type TimelineEntry,
  advance,
  cameraPose,
  planTimeline,
} from './sequencer';
import { CutsceneVideo } from './video';

/**
 * Plays a cutscene in-engine (round 6, docs/round6/cutscene-music.md 1.3): camera pans and zooms on the scene's
 * ground, DOM captions by copy id, sounds on the `AudioBus`, Skip on Esc or a tap when the cutscene allows it.
 * Reduce-motion turns pans into cuts; `?cutscene=0` disables every cutscene. The HUD and the move input are held
 * back while one plays (`body.wdi-cutscene`, the input controller's `stop`); the camera goes back to the own figure
 * through `followOf` when it ends. Both World.ts call sites are locked (docs/round6/seams.md 1.4).
 *
 * Round 7 (7A, DECISIONS A101): a `video` step plays a full-frame video from the video manifest under the captions and
 * Skip (`video.ts`); the cutscene ends with it.
 */
export type CutsceneOutcome = 'done' | 'skipped' | 'none';

const FILE = cutscenesJson as unknown as CutscenesFile;
/** Audio keys that loop under the cutscene and stop with it. */
const loops = (key: string) => key === 'storm' || key.startsWith('narr_bed');
/** Cutscene-local effects of a `vfx` step, in camera terms; an unknown kind is logged and skipped. */
const FX: Record<string, (cam: Phaser.Cameras.Scene2D.Camera) => void> = {
  flash: (cam) => cam.flash(300, 255, 255, 255),
  shake: (cam) => cam.shake(400, 0.006),
  fade: (cam) => cam.fadeOut(900, 0, 0, 0),
};

interface Run {
  skip(): void;
  finished: Promise<CutsceneOutcome>;
}

export class CutscenePlayer {
  private run: Run | null = null;
  private destroyed = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly overlay: HTMLElement,
    private readonly audio: AudioBus,
    /** The own figure the camera follows again when a cutscene ends. */
    private readonly followOf: () => Phaser.GameObjects.GameObject | null = () => null,
  ) {}

  /** True while a cutscene plays (a seat's ghost handoff can wait on it). */
  get playing(): boolean {
    return this.run !== null;
  }

  /** Plays the opening the router left under `REG_CUTSCENE`, if any, and clears it. */
  playPending(registry: Phaser.Data.DataManager, key: string): Promise<CutsceneOutcome> {
    const pending = registry.get(key) as string | undefined;
    if (pending !== undefined) registry.remove(key);
    return this.playId(pending);
  }

  /** Plays the death cutscene of a `killed`; resolves at once when it names none. */
  playDeath(cutsceneId: string | undefined): Promise<CutsceneOutcome> {
    if (cutsceneId !== undefined && !this.scene.scene.isActive()) {
      // A seat voted out is told while the meeting has the World asleep: the cutscene waits for the rebuilt World.
      this.scene.registry.set(REG_CUTSCENE, cutsceneId);
      return Promise.resolve('none');
    }
    return this.playId(cutsceneId);
  }

  /** Plays a cutscene by id; an unknown id, `?cutscene=0` and a destroyed player resolve `'none'`. */
  async playId(id: string | undefined): Promise<CutsceneOutcome> {
    if (id === undefined || this.destroyed || readDevFlags(location.search).noCutscene) return 'none';
    const cutscene = Object.hasOwn(FILE.cutscenes, id) ? FILE.cutscenes[id] : undefined;
    if (!cutscene) {
      console.warn(`cutscene ${id}: not in cutscenes.json`);
      return 'none';
    }
    if (this.run) {
      // A death while the opening plays: the opening ends first.
      this.run.skip();
      await this.run.finished;
    }
    if (this.destroyed) return 'none';
    return this.play(cutscene);
  }

  play(cutscene: Cutscene): Promise<CutsceneOutcome> {
    const run = this.start(cutscene);
    this.run = run;
    void run.finished.then(() => {
      if (this.run === run) this.run = null;
    });
    return run.finished;
  }

  destroy(): void {
    this.destroyed = true;
    this.run?.skip();
  }

  private start(cutscene: Cutscene): Run {
    const { scene, audio } = this;
    const cam = scene.cameras.main;
    const sceneId = (scene.scene.settings.data as { sceneId?: string } | undefined)?.sceneId;
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timeline = planTimeline(cutscene.steps, cutscene.maxS);
    const input = scene.registry.get(REG_INPUT) as { stop(): void; start(): void } | undefined;

    const captions = new Captions(this.overlay);
    const layer = h(
      'div',
      { class: 'wdi-cutscene', 'data-testid': 'cutscene', 'data-cutscene': cutscene.id },
      captions.el,
    );
    this.overlay.append(layer);
    const skipBtn = cutscene.skippable
      ? h(
          'button',
          {
            type: 'button',
            class: 'wdi-glass-btn wdi-glass-btn--sm wdi-cutscene__skip',
            'data-testid': 'cutscene-skip',
            'aria-label': CUTSCENE_COPY['cutscene.skip.label'],
            onClick: () => finish('skipped'),
          },
          CUTSCENE_COPY['cutscene.skip'],
        )
      : null;
    if (skipBtn) layer.append(skipBtn);
    document.body.classList.add('wdi-cutscene-on');
    input?.stop();

    const videos: CutsceneVideo[] = [];

    const startedAt = performance.now();
    const looping: AudioKey[] = [];
    let leg: { entry: TimelineEntry; leg: CameraLeg } | null = null;
    let lastLeg: CameraLeg | null = null;
    let prevMs = -1;
    let ended = false;
    let resolve!: (o: CutsceneOutcome) => void;
    const finished = new Promise<CutsceneOutcome>((r) => (resolve = r));

    const pose = (l: CameraLeg, elapsedMs: number): void => {
      const p = cameraPose(l, elapsedMs);
      const at = toScreen((p.tx + 0.5) * TILE_PX, (p.ty + 0.5) * TILE_PX);
      cam.stopFollow();
      cam.setZoom(Math.min(3, Math.max(0.5, isoZoom(scene.scale.height) * p.zoom)));
      cam.centerOn(at.x, at.y);
    };

    const begin = (e: TimelineEntry): void => {
      const s = e.step as Cutscene['steps'][number];
      switch (s.t) {
        case 'camera':
          if (sceneId !== undefined && s.sceneId !== sceneId) break;
          lastLeg = s;
          if (reduced) pose(s, s.durationS * 1000);
          else leg = { entry: e, leg: s };
          break;
        case 'caption': {
          const text = cutsceneLine(s.copyId);
          if (text === null) console.warn(`cutscene ${cutscene.id}: no copy for ${s.copyId}`);
          else captions.show(text, s.style, s.durationS * 1000);
          break;
        }
        case 'audio': {
          const key = s.key as AudioKey;
          if (!audio.has(key)) console.debug(`cutscene ${cutscene.id}: no sound ${s.key}`);
          else if (loops(s.key)) {
            audio.playLoop(key);
            looping.push(key);
          } else audio.play(key);
          break;
        }
        case 'vfx': {
          const fx = FX[s.kind];
          if (fx) fx(cam);
          else console.debug(`cutscene ${cutscene.id}: unknown vfx ${s.kind}`);
          break;
        }
        case 'cardSlam':
          document.body.classList.add('wdi-cutscene-slam');
          break;
        case 'video': {
          const video = new CutsceneVideo(layer, () => finish('done'));
          videos.push(video);
          void video.play(s.key, import.meta.env.BASE_URL);
          break;
        }
        default:
          break;
      }
    };

    const frame = (): void => {
      if (ended) return;
      const now = performance.now() - startedAt;
      const step = advance(timeline, now, prevMs);
      prevMs = now;
      for (const e of step.starting) begin(e);
      if (leg) {
        const elapsed = now - leg.entry.startMs;
        pose(leg.leg, elapsed);
        if (elapsed >= leg.leg.durationS * 1000) leg = null;
      } else if (lastLeg) pose(lastLeg, Infinity);
      if (step.done) finish('done');
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && cutscene.skippable) finish('skipped');
    };

    const finish = (outcome: 'done' | 'skipped'): void => {
      if (ended) return;
      ended = true;
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, frame);
      window.clearInterval(guard);
      window.removeEventListener('keydown', onKey);
      for (const key of looping) audio.stopLoop(key);
      for (const v of videos) v.destroy();
      captions.destroy();
      layer.remove();
      document.body.classList.remove('wdi-cutscene-on', 'wdi-cutscene-slam');
      cam.resetFX();
      cam.setZoom(isoZoom(scene.scale.height));
      const self = this.followOf();
      if (self) cam.startFollow(self, true, 0.1, 0.1);
      input?.start();
      scene.game.events.emit(CUTSCENE_END, { id: cutscene.id, outcome } satisfies CutsceneEnd);
      resolve(outcome);
    };

    window.addEventListener('keydown', onKey);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, frame);
    // The scene stops updating in a hidden tab; the guard keeps the timeline, and so the handoff, on the clock.
    const guard = window.setInterval(frame, 100);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => finish('skipped'));
    frame();
    return { skip: () => finish('skipped'), finished };
  }
}
