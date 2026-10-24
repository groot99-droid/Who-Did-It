import palette from '@wdi/content/data/palette.json';

// The mini-games draw at the room's own pixel size and scale up with `nearest` (art plan 5.7). With no mini-game
// atlas they draw labelled greybox rectangles of the art-box sizes.

/** The stage in art pixels; the canvas shows it at `SCALE` (`style.pixel.illustrationScale`). */
export const ART_W = 160;
export const ART_H = 100;
export const SCALE = 3;

export interface Stage {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** A pointer event in art pixels. */
  toArt(e: PointerEvent): { x: number; y: number };
  destroy(): void;
}

export function createStage(root: HTMLElement): Stage {
  const canvas = document.createElement('canvas');
  canvas.width = ART_W;
  canvas.height = ART_H;
  canvas.style.width = `${ART_W * SCALE}px`;
  canvas.style.maxWidth = '100%';
  canvas.style.imageRendering = 'pixelated';
  // Touch (UI.md 14.19.6, the teardown's phone check): a drag on the board never scrolls or zooms the page, and a
  // long press neither selects nor opens the callout.
  canvas.style.touchAction = 'none';
  canvas.style.userSelect = 'none';
  canvas.style.setProperty('-webkit-touch-callout', 'none');
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('2d canvas unavailable');
  root.append(canvas);
  return {
    canvas,
    ctx,
    toArt(e) {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * ART_W, y: ((e.clientY - r.top) / r.height) * ART_H };
    },
    destroy: () => canvas.remove(),
  };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const inside = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** A labelled greybox rectangle standing in for an atlas frame. */
export function box(ctx: CanvasRenderingContext2D, r: Rect, fill: string, label = ''): void {
  ctx.fillStyle = fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = palette.colors.ink;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  if (label !== '') {
    ctx.fillStyle = palette.colors.ink;
    ctx.font = '6px sans-serif';
    ctx.fillText(label, r.x + 2, r.y + 8, r.w - 4);
  }
}

export const COLORS = palette.colors;

/** Runs `frame(dtSeconds)` every animation frame until the returned stop is called. */
export function loop(frame: (dt: number) => void): () => void {
  let last = performance.now();
  let id = requestAnimationFrame(function tick(now) {
    frame(Math.min(0.1, (now - last) / 1000));
    last = now;
    id = requestAnimationFrame(tick);
  });
  return () => cancelAnimationFrame(id);
}
