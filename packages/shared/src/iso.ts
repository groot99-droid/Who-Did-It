// SPRITES 10 and GDD 3.13: the isometric projection, the one copy every package uses. The server never imports it:
// the world, the wire and the rules stay on the square 64 px grid; this only turns world px into screen px and back.
import { TILE_PX } from './constants';
import { type Direction, dirFromVector } from './direction';

/** A tile is a 128 x 64 px diamond on screen (metrics.json `iso.tileW` and `iso.tileH`). */
export const ISO_TILE_W = 128;
export const ISO_TILE_H = 64;

export interface Vec {
  x: number;
  y: number;
}

/** World px (x east, y south) to screen px: sx = x - y, sy = (x + y) / 2. Linear, determinant 1 (area kept). */
export function toScreen(wx: number, wy: number): Vec {
  return { x: wx - wy, y: (wx + wy) / 2 };
}

/** Screen px back to world px: x = sy + sx / 2, y = sy - sx / 2. */
export function toWorld(sx: number, sy: number): Vec {
  return { x: sy + sx / 2, y: sy - sx / 2 };
}

/** Screen y of a world ground point: the depth key of every y-sorted sprite (SPRITES 10.6). */
export function isoDepth(wx: number, wy: number): number {
  return (wx + wy) / 2;
}

/** Screen position of the top vertex of tile (tx, ty). */
export function tileTop(tx: number, ty: number): Vec {
  return toScreen(tx * TILE_PX, ty * TILE_PX);
}

/** Screen position of the centre of tile (tx, ty): the anchor of a one-tile prop or solid piece. */
export function tileCentre(tx: number, ty: number): Vec {
  return toScreen((tx + 0.5) * TILE_PX, (ty + 0.5) * TILE_PX);
}

/** Screen-space bounding box of a w x h tile scene's diamond. */
export function sceneBounds(w: number, h: number): { x: number; y: number; width: number; height: number } {
  return { x: -h * TILE_PX, y: 0, width: (w + h) * TILE_PX, height: ((w + h) * TILE_PX) / 2 };
}

/** Atlas direction (screen frame) of a facing given in the world frame (data, wire, `facing`, clue `dir`). */
export function screenDir(fx: number, fy: number, fallback: Direction = 's'): Direction {
  const s = toScreen(fx, fy);
  return dirFromVector(s.x, s.y, fallback);
}

/** Atlas direction of `Presence.yaw` (radians clockwise from world north, which is -y). */
export function screenDirOfYaw(yaw: number): Direction {
  return screenDir(Math.sin(yaw), -Math.cos(yaw));
}

/** World unit vector of a direction index or name given in the world frame (spawn `facing`, clue `dir`). */
export function worldVectorOf(dir: number): Vec {
  const a = (dir * Math.PI) / 4;
  return { x: Math.sin(a), y: -Math.cos(a) };
}

/**
 * Keyboard (SPRITES 10.8): the key vector in screen axes (W up, D right) turned by -45 degrees into the world, so a
 * single key walks straight along a screen axis and two keys walk along the grid. The server normalises the length.
 */
export function keysToWorld(kx: number, ky: number): Vec {
  const r = Math.SQRT1_2;
  return { x: (kx + ky) * r, y: (ky - kx) * r };
}

/** Touch stick: the exact inverse projection of the thumb's screen offset, at the offset's own length. */
export function stickToWorld(sx: number, sy: number): Vec {
  const len = Math.hypot(sx, sy);
  if (len === 0) return { x: 0, y: 0 };
  const w = toWorld(sx, sy);
  const k = len / Math.hypot(w.x, w.y);
  return { x: w.x * k, y: w.y * k };
}

/** Screen half-axes of a world circle of `rTiles` tiles: an ellipse twice as wide as it is tall. */
export function radiusEllipse(rTiles: number): { rx: number; ry: number } {
  const r = rTiles * TILE_PX;
  return { rx: Math.SQRT2 * r, ry: r / Math.SQRT2 };
}
