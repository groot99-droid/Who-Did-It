import onubBalance from '@wdi/content/data/balance.onub.json';
import { fill } from '../../../ui/copy';
import { ONUB_PREP_COPY as C } from '../../../ui/copy/onubPrep';
import { h } from '../../../ui/dom';
import type { MiniGameFactory } from '../StationView';
import { box, COLORS, createStage, inside, loop, type Rect } from './draw';

const SPEC = onubBalance.stations.find((s) => s.minigame.kind === 'slide')!.minigame as { steps: number };

export const CABINET: Rect = { x: 84, y: 6, w: 60, h: 88 };
export const BANNETON = { w: 28, h: 16 };
/** The cabinet's slot `i`, top to bottom. */
export const slotRect = (i: number): Rect => ({ x: CABINET.x + 16, y: CABINET.y + 6 + i * 21, w: 28, h: 14 });

/**
 * The proofing drawer's slide (GDD 3.11): `steps` bannetons go into the cabinet, one glowing slot at a time, the
 * slots lit in a random order. A banneton released anywhere but the glowing slot goes back to the rack.
 */
export class SlideModel {
  private readonly order: number[];
  private filled = 0;
  /** The slots in the order they were filled; the answer of the main-mode check. */
  readonly slots: number[] = [];

  constructor(
    rng: () => number,
    readonly steps = SPEC.steps,
  ) {
    this.order = Array.from({ length: steps }, (_, i) => i);
    for (let i = this.order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [this.order[i], this.order[j]] = [this.order[j]!, this.order[i]!];
    }
  }

  get done(): boolean {
    return this.filled >= this.steps;
  }

  get placed(): number {
    return this.filled;
  }

  /** The slot lit now, or -1 once every banneton is in. */
  get glowing(): number {
    return this.done ? -1 : (this.order[this.filled] ?? -1);
  }

  /** Slots already filled. */
  isFilled(slot: number): boolean {
    return this.order.slice(0, this.filled).includes(slot);
  }

  /** A banneton was released at `(x, y)` in art pixels; true when it went into the glowing slot. */
  drop(x: number, y: number): boolean {
    if (this.done || !inside(slotRect(this.glowing), x, y)) return false;
    this.slots.push(this.glowing);
    this.filled += 1;
    return true;
  }
}

export const slideGame: MiniGameFactory = (host) => {
  const model = new SlideModel(host.rng, host.steps);
  const stage = createStage(host.root);
  const hint = h(
    'p',
    { class: 'wdi-hint', 'data-testid': 'minigame-slide-hint' },
    fill(C['onub.mini.slide.hint'], { steps: model.steps }),
  );
  const load = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--sm', 'data-testid': 'minigame-slide-next' },
    C['onub.mini.slide.next'],
  );
  host.root.append(hint, load);
  const rack: Rect = { x: 8, y: 36, w: BANNETON.w, h: BANNETON.h };
  let dragging: { x: number; y: number } | null = null;

  const place = (x: number, y: number) => {
    if (model.drop(x, y) && model.done) host.onDone();
  };
  const draw = () => {
    const g = stage.ctx;
    g.fillStyle = COLORS.slate;
    g.fillRect(0, 0, 160, 100);
    box(g, CABINET, COLORS.lantern);
    for (let i = 0; i < model.steps; i++) {
      const r = slotRect(i);
      box(
        g,
        r,
        model.isFilled(i) ? COLORS.bone : i === model.glowing ? COLORS.mustard : COLORS.ink,
        model.isFilled(i) ? 'banneton' : '',
      );
    }
    if (!model.done) {
      const r = dragging === null ? rack : { ...BANNETON, ...dragging };
      box(g, r, COLORS.bone, 'banneton');
    }
  };
  const down = (e: PointerEvent) => {
    const p = stage.toArt(e);
    if (!inside(rack, p.x, p.y)) return;
    dragging = { x: p.x - BANNETON.w / 2, y: p.y - BANNETON.h / 2 };
    stage.canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (dragging === null) return;
    const p = stage.toArt(e);
    dragging = { x: p.x - BANNETON.w / 2, y: p.y - BANNETON.h / 2 };
  };
  const up = (e: PointerEvent) => {
    if (dragging === null) return;
    const p = stage.toArt(e);
    dragging = null;
    place(p.x, p.y);
  };
  stage.canvas.addEventListener('pointerdown', down);
  stage.canvas.addEventListener('pointermove', move);
  stage.canvas.addEventListener('pointerup', up);
  // The keyboard and tap route: slide the next banneton into the glowing slot.
  load.addEventListener('click', () => {
    const r = slotRect(Math.max(0, model.glowing));
    place(r.x + 2, r.y + 2);
  });
  const halt = loop(draw);
  draw();
  return {
    answer: () => ({ slots: [...model.slots] }),
    destroy() {
      halt();
      stage.destroy();
      hint.remove();
      load.remove();
    },
  };
};
