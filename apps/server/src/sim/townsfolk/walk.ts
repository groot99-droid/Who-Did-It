import { balance } from '@wdi/content';
import { TICK_RATE, TILE_PX, tilePath } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { simOf } from '../RoomSim';
import { navGrid, sceneKey, tileCentre } from '../World';
import type { Figure } from './figures';

export type WalkResult = 'arrived' | 'walking' | 'stuck';

/**
 * One tick of walking toward a point of the figure's scene along a tile path (the creature walker's rule without
 * the leash): the figure moves `townsfolk.walkTilesPerS` and is never collided, it is not a seat. `mug.ts` walks a
 * mugger with it too.
 */
export function walkFigure(room: PartyRoom, f: Figure, tx: number, ty: number, reachPx: number): WalkResult {
  if (Math.hypot(f.x - tx, f.y - ty) <= reachPx) return 'arrived';
  const tick = room.state.tick;
  const grid = navGrid(sceneKey(f.sceneIdx), simOf(room).profile);
  const here = { x: Math.floor(f.x / TILE_PX), y: Math.floor(f.y / TILE_PX) };
  const key = `${f.sceneIdx}:${Math.round(tx)}:${Math.round(ty)}`;
  let plan = f.brain.path;
  let at = plan?.tiles.findIndex((t) => t.x === here.x && t.y === here.y) ?? -1;
  // A figure is never collided and its scene's grid never changes: a path holds until its goal changes or the
  // figure steps off it.
  if (!plan || plan.key !== key || at < 0) {
    const tiles = tilePath(
      grid.w,
      grid.h,
      (x, y) => grid.solidAt(x, y),
      here,
      (x, y) =>
        !grid.solidAt(x, y) &&
        Math.hypot(tileCentre(x, TILE_PX) - tx, tileCentre(y, TILE_PX) - ty) <= reachPx,
    );
    plan = tiles ? { key, scene: f.sceneIdx, bornTick: tick, tiles } : null;
    f.brain.path = plan;
    at = Math.max(0, plan?.tiles.findIndex((t) => t.x === here.x && t.y === here.y) ?? 0);
  }
  if (!plan) return 'stuck';
  const next = plan.tiles[at + 1];
  const aim = next ? { x: tileCentre(next.x, TILE_PX), y: tileCentre(next.y, TILE_PX) } : { x: tx, y: ty };
  const dx = aim.x - f.x;
  const dy = aim.y - f.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return 'arrived';
  const step = Math.min(len, (balance.townsfolk.walkTilesPerS * TILE_PX) / TICK_RATE);
  f.x += (dx / len) * step;
  f.y += (dy / len) * step;
  f.yaw = Math.atan2(dx, -dy);
  f.moving = true;
  return 'walking';
}
