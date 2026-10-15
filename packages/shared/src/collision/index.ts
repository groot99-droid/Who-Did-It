import type { SolidQuery } from '../nav/index';

// Axis-separated swept AABB against a tile grid. The box is centred on (x, y) in pixels with half
// extents hw, hh. Each axis is swept to the first solid tile column or row in its way, so a step of any
// length stops at the wall instead of tunnelling, and the other axis keeps sliding.

/** Gap left between a resting box and the wall so the next sweep never starts inside it. */
const BACKOFF = 0.001;
/** Box edges closer than this to a tile boundary do not count as overlapping the next tile. */
const SKIN = 0.0001;

export interface MoveResult {
  x: number;
  y: number;
  hitX: boolean;
  hitY: boolean;
}

function rowSolid(g: SolidQuery, c: number, y: number, hh: number): boolean {
  const r0 = Math.floor((y - hh + SKIN) / g.tile);
  const r1 = Math.floor((y + hh - SKIN) / g.tile);
  for (let r = r0; r <= r1; r++) if (g.solidAt(c, r)) return true;
  return false;
}

function colSolid(g: SolidQuery, r: number, x: number, hw: number): boolean {
  const c0 = Math.floor((x - hw + SKIN) / g.tile);
  const c1 = Math.floor((x + hw - SKIN) / g.tile);
  for (let c = c0; c <= c1; c++) if (g.solidAt(c, r)) return true;
  return false;
}

/** Moves along x by dx; returns the new x and whether a wall stopped it. */
function sweepX(g: SolidQuery, x: number, y: number, dx: number, hw: number, hh: number): [number, boolean] {
  if (dx === 0) return [x, false];
  const T = g.tile;
  if (dx > 0) {
    const edge = x + hw;
    for (let c = Math.floor(edge / T) + 1; c <= Math.floor((edge + dx) / T); c++)
      if (rowSolid(g, c, y, hh)) return [c * T - hw - BACKOFF, true];
  } else {
    const edge = x - hw;
    for (let c = Math.ceil(edge / T) - 1; c >= Math.floor((edge + dx) / T); c--)
      if (rowSolid(g, c, y, hh)) return [(c + 1) * T + hw + BACKOFF, true];
  }
  return [x + dx, false];
}

function sweepY(g: SolidQuery, x: number, y: number, dy: number, hw: number, hh: number): [number, boolean] {
  if (dy === 0) return [y, false];
  const T = g.tile;
  if (dy > 0) {
    const edge = y + hh;
    for (let r = Math.floor(edge / T) + 1; r <= Math.floor((edge + dy) / T); r++)
      if (colSolid(g, r, x, hw)) return [r * T - hh - BACKOFF, true];
  } else {
    const edge = y - hh;
    for (let r = Math.ceil(edge / T) - 1; r >= Math.floor((edge + dy) / T); r--)
      if (colSolid(g, r, x, hw)) return [(r + 1) * T + hh + BACKOFF, true];
  }
  return [y + dy, false];
}

export function moveAabb(
  g: SolidQuery,
  x: number,
  y: number,
  dx: number,
  dy: number,
  hw: number,
  hh: number,
): MoveResult {
  const [nx, hitX] = sweepX(g, x, y, dx, hw, hh);
  const [ny, hitY] = sweepY(g, nx, y, dy, hw, hh);
  return { x: nx, y: ny, hitX, hitY };
}

/** True when the box overlaps a solid tile (used to validate spawn points and teleports). */
export function overlapsSolid(g: SolidQuery, x: number, y: number, hw: number, hh: number): boolean {
  const T = g.tile;
  for (let r = Math.floor((y - hh + SKIN) / T); r <= Math.floor((y + hh - SKIN) / T); r++)
    for (let c = Math.floor((x - hw + SKIN) / T); c <= Math.floor((x + hw - SKIN) / T); c++)
      if (g.solidAt(c, r)) return true;
  return false;
}
