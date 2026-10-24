import { type SceneId, balance, isDarkScene, scenes } from '@wdi/content';
import { type SolidQuery, TILE_PX, segmentBlocked } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { avatarMemory, avatarOf } from './Avatars';
import { burningLights, lightBurns } from './mobs/light';
import { dayPartOf } from './mobs/spawn';
import { type PlayerSim, simOf } from './RoomSim';
import { navGrid, sceneKey } from './World';

/**
 * Dark visibility (round 6, M5b, GDD 3.7 and 3.15; docs/round6/m5b-data.md 2.2). In a dark scene, and since round 8
 * (8L, A170) in every scene at night and in the Final Night (`dayPartOf` 'night'), a living viewer sees another
 * avatar only along a clear line of sight over the scene's grid (walls, and the `u` material that is walkable but
 * blocks sight), and only when it stands within the night radius, `vision.nightTiles`, plus `vision.lanternTiles`
 * for each of the two whose light burns, or inside the pool of a scene light burning now. Any other scene and phase
 * is seen whole, as before. `reconcileAvatars` (sim/Visibility.ts) filters a living viewer's wanted set through it
 * and only ever removes; ghosts and the admin view never come here.
 */
export function canSee(room: PartyRoom, viewer: PlayerSim, target: PlayerSim): boolean {
  if (viewer === target) return true;
  const sceneId = sceneKey(viewer.sceneIdx);
  const scene = scenes[sceneId];
  const part = dayPartOf(room.state.phase);
  if (!isDarkScene(scene) && part !== 'night') return true;
  const seats = seatsOf(room, viewer, target);
  // A seat that just left stands at the door of this scene as a transit tail: that is where it is seen.
  const at = target.sceneIdx === viewer.sceneIdx ? target : tailIn(room, sceneId, seats.target);
  if (at === null) return true;
  const v = balance.vision;
  const lit = (seat: string | null) => (seat !== null && lightBurns(room, seat) ? v.lanternTiles : 0);
  const radius = (v.nightTiles + lit(seats.viewer) + lit(seats.target)) * TILE_PX;
  const inPool = () =>
    burningLights(scene, part ?? 'night', TILE_PX, false).some(
      (l) => Math.hypot(at.x - l.x, at.y - l.y) <= l.r,
    );
  if (Math.hypot(at.x - viewer.x, at.y - viewer.y) > radius && !inPool()) return false;
  return !segmentBlocked(sightGrid(room, sceneId), viewer.x, viewer.y, at.x, at.y);
}

/** The seat ids of two sims (at most ten seats, read once each). */
function seatsOf(room: PartyRoom, viewer: PlayerSim, target: PlayerSim) {
  let v: string | null = null;
  let t: string | null = null;
  for (const [seat, p] of simOf(room).players) {
    if (p === viewer) v = seat;
    else if (p === target) t = seat;
  }
  return { viewer: v, target: t };
}

/** Where a seat's transit tail stands in a scene, or null when it has none there. */
function tailIn(room: PartyRoom, sceneId: SceneId, seat: string | null): { x: number; y: number } | null {
  if (seat === null) return null;
  for (const [handle, tail] of avatarMemory(room).leaving) {
    if (tail.seat !== seat || tail.scene !== sceneId) continue;
    const avatar = avatarOf(room, handle);
    if (avatar) return { x: avatar.x, y: avatar.y };
  }
  return null;
}

/** The grid sight is blocked by: the nav grid's solids at the party's size, and the `u` material (GDD 3.13). */
const sightGrids = new Map<string, SolidQuery>();
function sightGrid(room: PartyRoom, sceneId: SceneId): SolidQuery {
  const profile = simOf(room).profile;
  const key = `${sceneId}:${profile}`;
  let grid = sightGrids.get(key);
  if (!grid) {
    const nav = navGrid(sceneId, profile);
    const material = scenes[sceneId].material;
    grid = {
      tile: nav.tile,
      w: nav.w,
      h: nav.h,
      solidAt: (x, y) => nav.solidAt(x, y) || material?.[y]?.[x] === 'u',
    };
    sightGrids.set(key, grid);
  }
  return grid;
}
