// The pure side of an admin viewport: the zoom and centre that fit a scene into a cell, and the roster rows and
// avatars the world views read, made from the god view's seats. No Phaser, so it is tested.
import { TILE_PX } from '@wdi/shared/constants';
import type { AdminSeat } from '@wdi/shared/protocol';
import type { AvatarSnap, PlayerSnap } from '../net/world';
import { AnimId, StatusBit } from '../view/animIds';
import { sceneDiamond } from '../view/iso';
import { yawOfStep } from './model';

/** A seat that moved less than this many px since the last snapshot stands still. */
export const STILL_PX = 0.5;
/** Hard cap of the zoom: a small interior is not blown up past real size. */
const MAX_ZOOM = 1;

/** The zoom at which a scene's whole diamond fits a cell, never past 1. */
export function fitZoom(map: { w: number; h: number }, cell: { w: number; h: number }): number {
  const d = sceneDiamond(map.w, map.h);
  const xs = d.map((p) => p.x);
  const ys = d.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return Math.min(MAX_ZOOM, cell.w / (w + TILE_PX), cell.h / (h + TILE_PX));
}

/** The centre of a scene's diamond in screen px. */
export function diamondCentre(map: { w: number; h: number }): { x: number; y: number } {
  const d = sceneDiamond(map.w, map.h);
  const xs = d.map((p) => p.x);
  const ys = d.map((p) => p.y);
  return { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 };
}

/** Roster rows and avatars the world views read, made from the god view's seats of one scene. */
export function snapsOf(
  seats: readonly AdminSeat[],
  last: ReadonlyMap<string, { x: number; y: number; yaw: number }>,
): {
  players: PlayerSnap[];
  avatars: AvatarSnap[];
  poses: Map<string, { x: number; y: number; yaw: number }>;
} {
  const players: PlayerSnap[] = [];
  const avatars: AvatarSnap[] = [];
  const poses = new Map<string, { x: number; y: number; yaw: number }>();
  for (const s of seats) {
    const before = last.get(s.id);
    const dx = before ? s.x - before.x : 0;
    const dy = before ? s.y - before.y : 0;
    const moving = Math.hypot(dx, dy) > STILL_PX;
    const yaw = moving ? yawOfStep(dx, dy) : (before?.yaw ?? 0);
    poses.set(s.id, { x: s.x, y: s.y, yaw });
    players.push({
      id: s.id,
      name: s.name,
      traits: { height: 1, scarf: 0, hat: 2 },
      alive: !s.dead,
      look: s.look,
      presence: null,
    });
    avatars.push({
      handle: s.id,
      lookOf: s.id,
      height: 1,
      x: s.x,
      y: s.y,
      yaw,
      animId: s.dead ? AnimId.idle : moving ? AnimId.walk : AnimId.idle,
      statusBits: s.dead ? StatusBit.ghost : 0,
      transitUntilTick: 0,
    });
  }
  return { players, avatars, poses };
}
