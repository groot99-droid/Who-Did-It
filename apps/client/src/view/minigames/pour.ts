import onubBalance from '@wdi/content/data/balance.onub.json';
import { MINIGAME_COPY as C } from '../../ui/copy/minigames';
import { h } from '../../ui/dom';
import type { MiniGameFactory } from './registry';
import { ART_W, box, COLORS, createStage, loop } from './draw';

const SPEC = onubBalance.stations.find((s) => s.minigame.kind === 'pour')!.minigame as {
  steps: number;
  ratePerS: number;
  bandFrac: number;
};

export type PourResult = 'poured' | 'spilled' | 'short';

/**
 * The mixer's pour (GDD 3.11): hold to fill the bowl at `ratePerS` of the bowl a second and release with the
 * level inside the line band (`bandFrac`, at a random height); do it `steps` times (flour, then water). Filling
 * past the rim, or releasing above the band, empties the bowl; releasing below the band keeps the level.
 */
export class PourModel {
  level = 0;
  step = 0;
  holding = false;
  /** The hold of each pour that landed, in seconds (level over rate); the answer of the main-mode check. */
  readonly holdsS: number[] = [];
  bandStart: number;

  constructor(
    private readonly rng: () => number,
    readonly steps = SPEC.steps,
    readonly ratePerS = SPEC.ratePerS,
    readonly bandFrac = SPEC.bandFrac,
  ) {
    this.bandStart = this.draw();
  }

  private draw(): number {
    // Keep the band clear of the very bottom (a single quick tap) and inside the bowl.
    return 0.25 + this.rng() * (0.95 - this.bandFrac - 0.25);
  }

  get done(): boolean {
    return this.step >= this.steps;
  }

  press(): void {
    if (!this.done) this.holding = true;
  }

  /** Advances the fill; an over-pour empties the bowl at once. Returns 'spilled' when it does. */
  tick(dt: number): PourResult | null {
    if (!this.holding || this.done) return null;
    this.level += this.ratePerS * dt;
    if (this.level >= 1) {
      this.level = 0;
      this.holding = false;
      return 'spilled';
    }
    return null;
  }

  release(): PourResult | null {
    if (!this.holding) return null;
    this.holding = false;
    if (this.level >= this.bandStart && this.level <= this.bandStart + this.bandFrac) {
      this.step += 1;
      this.holdsS.push(this.level / this.ratePerS);
      this.level = 0;
      this.bandStart = this.draw();
      return 'poured';
    }
    if (this.level > this.bandStart + this.bandFrac) {
      this.level = 0;
      return 'spilled';
    }
    return 'short';
  }
}

export const pourGame: MiniGameFactory = (host) => {
  const model = new PourModel(host.rng, host.steps);
  const stage = createStage(host.root);
  const hint = h('p', { class: 'wdi-hint', 'data-testid': 'minigame-pour-hint' }, C['minigame.pour.hint']);
  const hold = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--primary', 'data-testid': 'minigame-hold' },
    C['minigame.pour.hold'],
  );
  host.root.append(hint, hold);
  const bowl = { x: 60, y: 14, w: 40, h: 76 };
  const say = (msg: string) => (hint.textContent = msg);

  const draw = () => {
    const g = stage.ctx;
    g.fillStyle = COLORS.slate;
    g.fillRect(0, 0, ART_W, 100);
    box(g, bowl, COLORS.fog);
    const fillColor = model.step === 0 ? COLORS.bone : COLORS.moon;
    g.fillStyle = fillColor;
    g.fillRect(
      bowl.x + 2,
      bowl.y + bowl.h - 2 - (bowl.h - 4) * model.level,
      bowl.w - 4,
      (bowl.h - 4) * model.level,
    );
    const bandY = bowl.y + bowl.h - 2 - (bowl.h - 4) * (model.bandStart + model.bandFrac);
    g.fillStyle = COLORS.mustard;
    g.fillRect(bowl.x - 4, bandY, bowl.w + 8, (bowl.h - 4) * model.bandFrac);
    g.fillStyle = COLORS.ink;
    g.fillText(model.step === 0 ? C['minigame.pour.flour'] : C['minigame.pour.water'], 4, 10);
  };

  const press = (e: Event) => {
    e.preventDefault();
    model.press();
  };
  const release = () => {
    const r = model.release();
    if (r === 'spilled') say(C['minigame.pour.spilled']);
    else if (r === 'poured') {
      say(C['minigame.pour.hint']);
      if (model.done) host.onDone();
    }
  };
  hold.addEventListener('keydown', (e) => {
    if (e.key === ' ' && !e.repeat) press(e);
  });
  hold.addEventListener('keyup', (e) => {
    if (e.key === ' ') release();
  });
  for (const el of [hold, stage.canvas]) {
    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointerleave', release);
  }
  const halt = loop((dt) => {
    if (model.tick(dt) === 'spilled') say(C['minigame.pour.spilled']);
    draw();
  });
  draw();
  return {
    answer: () => ({ holdsS: [...model.holdsS] }),
    destroy() {
      halt();
      stage.destroy();
      hint.remove();
      hold.remove();
    },
  };
};
