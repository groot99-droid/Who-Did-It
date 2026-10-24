import balance from '@wdi/content/data/balance.json';
import { tapMarkerAt } from '@wdi/shared/rules';
import { fill } from '../../ui/copy';
import { MINIGAME_COPY as C } from '../../ui/copy/minigames';
import { h } from '../../ui/dom';
import type { MiniGameFactory } from './registry';
import { ART_H, ART_W, box, COLORS, createStage, loop, type Rect } from './draw';

const SPEC = balance.minigames.tap;

/**
 * The tap (round 7, 7M; GDD 3.16): a marker sweeps the track back and forth once per `periodS`; tap while it crosses
 * the band, `steps` times in a row. A miss starts the run again from the first band. Each hit draws the next band from
 * `rng`, which `board.ts` feeds the server's bands, so the two boards agree; the answer is every tap's time.
 */
export class TapModel {
  hits = 0;
  misses = 0;
  /** Seconds since the first tick, and the moment of each tap; the answer of the main-mode check. */
  elapsed = 0;
  readonly taps: number[] = [];
  readonly bands: number[];

  constructor(
    rng: () => number,
    readonly steps = SPEC.steps,
    readonly periodS = SPEC.periodS,
    readonly bandFrac = SPEC.bandFrac,
  ) {
    this.bands = Array.from({ length: steps }, () => rng() * (1 - bandFrac));
  }

  /** The marker's place on the track now, 0 to 1. */
  get marker(): number {
    return tapMarkerAt(this.elapsed, this.periodS);
  }

  /** The band the next tap has to land in. */
  get band(): number {
    return this.bands[Math.min(this.hits, this.steps - 1)]!;
  }

  get done(): boolean {
    return this.hits >= this.steps;
  }

  /** A tap now: true for a hit. */
  tap(): boolean {
    if (this.done) return false;
    this.taps.push(Math.round(this.elapsed * 1000) / 1000);
    const m = this.marker;
    const hit = m >= this.band && m <= this.band + this.bandFrac;
    if (hit) this.hits += 1;
    else {
      this.hits = 0;
      this.misses += 1;
    }
    return hit;
  }

  tick(dt: number): void {
    if (this.done) return;
    this.elapsed += dt;
  }
}

export const tapGame: MiniGameFactory = (host) => {
  const model = new TapModel(host.rng, host.steps);
  const stage = createStage(host.root);
  const hint = h(
    'p',
    { class: 'wdi-hint', 'data-testid': 'minigame-tap-hint' },
    fill(C['minigame.tap.hint'], { steps: model.steps }),
  );
  const progress = h('p', { class: 'wdi-hint', 'data-testid': 'minigame-tap-progress', role: 'status' });
  const tap = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--primary', 'data-testid': 'minigame-tap-tap' },
    C['minigame.tap.tap'],
  );
  host.root.append(hint, progress, tap);
  const track: Rect = { x: 16, y: 44, w: ART_W - 32, h: 12 };
  let missedAt = -1;

  const say = () => {
    progress.textContent =
      missedAt >= 0 && model.elapsed - missedAt < 1
        ? C['minigame.tap.miss']
        : fill(C['minigame.tap.progress'], { hits: model.hits, steps: model.steps });
  };
  const draw = () => {
    const g = stage.ctx;
    g.fillStyle = COLORS.slate;
    g.fillRect(0, 0, ART_W, ART_H);
    box(g, { x: 60, y: 8, w: 40, h: 28 }, COLORS.fog, 'station');
    box(g, track, COLORS.bone);
    g.fillStyle = COLORS.teal;
    g.fillRect(track.x + track.w * model.band, track.y, track.w * model.bandFrac, track.h);
    g.fillStyle = COLORS.ink;
    g.fillRect(track.x + track.w * model.marker - 1, track.y - 3, 2, track.h + 6);
    for (let i = 0; i < model.steps; i++) {
      box(g, { x: 16 + i * 14, y: 70, w: 10, h: 10 }, i < model.hits ? COLORS.teal : COLORS.fog);
    }
    say();
  };
  const press = (e: Event) => {
    e.preventDefault();
    if (!model.tap()) missedAt = model.elapsed;
  };
  tap.addEventListener('pointerdown', press);
  tap.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) press(e);
  });
  stage.canvas.addEventListener('pointerdown', press);
  const halt = loop((dt) => {
    model.tick(dt);
    draw();
    if (model.done) host.onDone();
  });
  draw();
  return {
    answer: () => ({ taps: [...model.taps] }),
    destroy() {
      halt();
      stage.destroy();
      hint.remove();
      progress.remove();
      tap.remove();
    },
  };
};
