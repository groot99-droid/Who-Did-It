import balance from '@wdi/content/data/balance.json';
import { fill } from '../../ui/copy';
import { MINIGAME_COPY as C } from '../../ui/copy/minigames';
import { h } from '../../ui/dom';
import type { MiniGameFactory } from './registry';
import { ART_H, ART_W, box, COLORS, createStage, inside, loop, type Rect } from './draw';

const SPEC = balance.minigames.crates;

/** One sweep of the needle across the dial, in seconds. */
export const NEEDLE_PERIOD_S = 1.6;
export const CART: Rect = { x: 104, y: 52, w: 44, h: 30 };
export const CRATE_SIZE = { w: 22, h: 16 };

/** The needle's place on the dial (0 to 1) after `t` seconds: a triangle wave, so it sweeps back and forth. */
export function needleAt(t: number): number {
  const p = (t / NEEDLE_PERIOD_S) % 1;
  return p < 0.5 ? p * 2 : 2 - p * 2;
}

/**
 * The fridge's cold check (GDD 3.11): put `steps` crates on the cart, then stop the needle inside the cold band
 * (`bandFrac` of the dial, at a random height). A stop outside the band lets the needle run again.
 */
export class CratesModel {
  private carted = 0;
  private stopped = false;
  /** Where the needle stopped inside the band; the answer of the main-mode check. */
  stopPos = 0;
  readonly bandStart: number;

  constructor(
    rng: () => number,
    readonly steps = SPEC.steps,
    readonly bandFrac = SPEC.bandFrac,
  ) {
    this.bandStart = rng() * (1 - bandFrac);
  }

  get cartCount(): number {
    return this.carted;
  }

  /** The crates are all on the cart and the dial is live. */
  get dialLive(): boolean {
    return this.carted >= this.steps && !this.stopped;
  }

  get done(): boolean {
    return this.stopped;
  }

  /** A crate was released at `(x, y)` in art pixels; counts when it lands on the cart. */
  drop(x: number, y: number): boolean {
    if (this.carted >= this.steps || !inside(CART, x, y)) return false;
    this.carted += 1;
    return true;
  }

  /** The needle was stopped at `pos` (0 to 1): done when it is inside the band. */
  stop(pos: number): boolean {
    if (!this.dialLive) return false;
    const hit = pos >= this.bandStart && pos <= this.bandStart + this.bandFrac;
    if (hit) {
      this.stopped = true;
      this.stopPos = pos;
    }
    return hit;
  }
}

export const cratesGame: MiniGameFactory = (host) => {
  const model = new CratesModel(host.rng, host.steps);
  const stage = createStage(host.root);
  const hint = h('p', { class: 'wdi-hint', 'data-testid': 'minigame-crates-hint' });
  const stopBtn = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--primary', 'data-testid': 'minigame-stop', hidden: true },
    C['minigame.crates.stop'],
  );
  const load = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--sm', 'data-testid': 'minigame-load' },
    C['minigame.crates.load'],
  );
  host.root.append(hint, load, stopBtn);
  const shelf = (i: number): Rect => ({ x: 6, y: 8 + i * 28, w: CRATE_SIZE.w, h: CRATE_SIZE.h });
  let dragging: { i: number; x: number; y: number } | null = null;
  const onShelf = new Set(Array.from({ length: model.steps }, (_, i) => i));
  let t = 0;

  const say = () => {
    hint.textContent = model.dialLive
      ? C['minigame.crates.dial']
      : fill(C['minigame.crates.hint'], { steps: model.steps });
    stopBtn.hidden = !model.dialLive;
    load.hidden = model.cartCount >= model.steps;
  };
  say();

  const dial = { x: 70, y: 20, w: 16, h: 70 };
  const draw = () => {
    const g = stage.ctx;
    g.fillStyle = COLORS.slate;
    g.fillRect(0, 0, ART_W, ART_H);
    box(g, CART, COLORS.fog, 'cart');
    for (const i of onShelf) {
      const r = i === dragging?.i ? { ...CRATE_SIZE, x: dragging.x, y: dragging.y } : shelf(i);
      box(g, r, COLORS.mustard, 'crate');
    }
    for (let i = 0; i < model.cartCount; i++) {
      box(
        g,
        { x: CART.x + 3 + (i % 2) * 20, y: CART.y + 4 + Math.floor(i / 2) * 12, w: 18, h: 10 },
        COLORS.mustard,
      );
    }
    box(g, dial, COLORS.bone);
    g.fillStyle = COLORS.moon;
    g.fillRect(
      dial.x,
      dial.y + dial.h * (1 - model.bandStart - model.bandFrac),
      dial.w,
      dial.h * model.bandFrac,
    );
    const pos = needleAt(t);
    g.fillStyle = COLORS.ink;
    g.fillRect(dial.x - 2, dial.y + dial.h * (1 - pos) - 1, dial.w + 4, 2);
    if (!model.dialLive && !model.done) {
      g.fillStyle = 'rgba(18,20,28,0.5)';
      g.fillRect(dial.x, dial.y, dial.w, dial.h);
    }
  };

  const down = (e: PointerEvent) => {
    const p = stage.toArt(e);
    for (const i of onShelf) {
      if (inside(shelf(i), p.x, p.y)) {
        dragging = { i, x: p.x - CRATE_SIZE.w / 2, y: p.y - CRATE_SIZE.h / 2 };
        stage.canvas.setPointerCapture(e.pointerId);
        return;
      }
    }
  };
  const move = (e: PointerEvent) => {
    if (dragging === null) return;
    const p = stage.toArt(e);
    dragging = { ...dragging, x: p.x - CRATE_SIZE.w / 2, y: p.y - CRATE_SIZE.h / 2 };
  };
  const up = (e: PointerEvent) => {
    if (dragging === null) return;
    const p = stage.toArt(e);
    if (model.drop(p.x, p.y)) onShelf.delete(dragging.i);
    dragging = null;
    say();
  };
  const stopNeedle = () => {
    if (model.stop(needleAt(t))) host.onDone();
  };
  stage.canvas.addEventListener('pointerdown', down);
  stage.canvas.addEventListener('pointermove', move);
  stage.canvas.addEventListener('pointerup', up);
  stopBtn.addEventListener('click', stopNeedle);
  // The keyboard and tap route: load the next crate without dragging it.
  load.addEventListener('click', () => {
    const next = [...onShelf][0];
    if (next !== undefined && model.drop(CART.x + 4, CART.y + 4)) onShelf.delete(next);
    say();
  });
  const halt = loop((dt) => {
    t += dt;
    draw();
  });
  draw();
  return {
    answer: () => ({ placed: model.cartCount, stop: model.stopPos }),
    destroy() {
      halt();
      stage.destroy();
      hint.remove();
      stopBtn.remove();
      load.remove();
    },
  };
};
