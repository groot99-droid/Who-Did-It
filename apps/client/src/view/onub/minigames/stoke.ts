import onubBalance from '@wdi/content/data/balance.onub.json';
import { fill } from '../../../ui/copy';
import { ONUB_PREP_COPY as C } from '../../../ui/copy/onubPrep';
import { h } from '../../../ui/dom';
import type { MiniGameFactory } from '../StationView';
import { box, COLORS, createStage, loop, type Rect } from './draw';

const SPEC = onubBalance.stations.find((s) => s.minigame.kind === 'stoke')!.minigame as {
  stokePerTap: number;
  ratePerS: number;
  bandFrac: number;
  holdS: number;
};

/**
 * The oven's stoke (GDD 3.11): each tap feeds `stokePerTap` of the heat, the fire cools `ratePerS` a second, and
 * the needle must stay inside the band (`bandFrac`, at a random height) for `holdS` seconds in a row. Leaving the
 * band starts the count again.
 */
export class StokeModel {
  heat = 0;
  held = 0;
  readonly bandStart: number;

  constructor(
    rng: () => number,
    readonly stokePerTap = SPEC.stokePerTap,
    readonly ratePerS = SPEC.ratePerS,
    readonly bandFrac = SPEC.bandFrac,
    readonly holdS = SPEC.holdS,
  ) {
    this.bandStart = 0.3 + rng() * (0.9 - bandFrac - 0.3);
  }

  get inBand(): boolean {
    return this.heat >= this.bandStart && this.heat <= this.bandStart + this.bandFrac;
  }

  get done(): boolean {
    return this.held >= this.holdS;
  }

  tap(): void {
    if (!this.done) this.heat = Math.min(1, this.heat + this.stokePerTap);
  }

  tick(dt: number): void {
    if (this.done) return;
    this.heat = Math.max(0, this.heat - this.ratePerS * dt);
    this.held = this.inBand ? this.held + dt : 0;
  }
}

export const stokeGame: MiniGameFactory = (host) => {
  const model = new StokeModel(host.rng);
  const stage = createStage(host.root);
  const hint = h(
    'p',
    { class: 'wdi-hint', 'data-testid': 'minigame-stoke-hint' },
    fill(C['onub.mini.stoke.hint'], { holdS: model.holdS }),
  );
  const progress = h('p', { class: 'wdi-hint', 'data-testid': 'minigame-stoke-progress', role: 'status' });
  const tap = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--primary', 'data-testid': 'minigame-stoke-tap' },
    C['onub.mini.stoke.tap'],
  );
  host.root.append(hint, progress, tap);
  const gauge: Rect = { x: 70, y: 10, w: 20, h: 80 };

  const draw = () => {
    const g = stage.ctx;
    g.fillStyle = COLORS.slate;
    g.fillRect(0, 0, 160, 100);
    box(g, { x: 8, y: 30, w: 50, h: 50 }, COLORS.blood, 'oven');
    box(g, gauge, COLORS.bone);
    g.fillStyle = model.inBand ? COLORS.teal : COLORS.mustard;
    g.fillRect(
      gauge.x,
      gauge.y + gauge.h * (1 - model.bandStart - model.bandFrac),
      gauge.w,
      gauge.h * model.bandFrac,
    );
    g.fillStyle = COLORS.ink;
    g.fillRect(gauge.x - 3, gauge.y + gauge.h * (1 - model.heat) - 1, gauge.w + 6, 2);
    progress.textContent = fill(C['onub.mini.stoke.progress'], { s: model.held.toFixed(1) });
  };
  const feed = (e: Event) => {
    e.preventDefault();
    model.tap();
  };
  tap.addEventListener('pointerdown', feed);
  tap.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) feed(e);
  });
  stage.canvas.addEventListener('pointerdown', feed);
  const halt = loop((dt) => {
    model.tick(dt);
    draw();
    if (model.done) host.onDone();
  });
  draw();
  return {
    destroy() {
      halt();
      stage.destroy();
      hint.remove();
      progress.remove();
      tap.remove();
    },
  };
};
