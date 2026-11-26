// The cut-away (round 11, R4; sprite-world.md 1): a wall that stands between the camera and the ground point it looks
// at (the player, whom the camera follows) drops to a sill, so the room behind it shows. Pure: no Three.js import.
// Only kit walls are cut (`BoxNode.wall`); a building in front of the player keeps its height.
import { TILE_PX } from '@wdi/shared/constants';
import { unitsOfRise } from './frame';

/** How high a cut wall still stands, in scene units: a sill, the height of a 12 px rise. */
export const SILL = unitsOfRise(12);
/** How far in front of the focus, on the ground, a wall may stand and still be cut. */
export const CUT_REACH = 4 * TILE_PX;
/** Half the width, across the screen, of the window kept clear around the focus (a figure and a little room). */
export const CUT_HALF_WIDTH = 1.5 * TILE_PX;

/** A wall's footprint (centre and size in world px) and height in scene units, as `BoxNode` gives them. */
export interface WallBox {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
}

/**
 * Whether `box` hides the ground point `focus` (world px) from a camera at `yaw`: the box stands on the camera's
 * side of the focus, within `CUT_REACH`, it stands taller than the sill, and across the screen it reaches
 * into the window `CUT_HALF_WIDTH` either side of it.
 */
export function cutsView(box: WallBox, focus: { x: number; y: number }, yaw: number): boolean {
  // On the ground: `toward` points from the target toward the camera, `across` along the screen's x.
  const tx = Math.sin(yaw);
  const tz = Math.cos(yaw);
  const ax = Math.cos(yaw);
  const az = -Math.sin(yaw);
  let nearest = Infinity;
  let left = Infinity;
  let right = -Infinity;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const dx = box.x + (sx * box.w) / 2 - focus.x;
      const dz = box.y + (sz * box.d) / 2 - focus.y;
      const t = dx * tx + dz * tz;
      const a = dx * ax + dz * az;
      nearest = Math.min(nearest, t);
      left = Math.min(left, a);
      right = Math.max(right, a);
    }
  // The footprint's centre stands on the camera's side: a wall the focus stands in front of is never cut. A long
  // wall may still run past the focus at one end (the south wall's west end at heading 0), so corners may not.
  const centre = (box.x - focus.x) * tx + (box.y - focus.y) * tz;
  if (centre <= 0 || nearest > CUT_REACH) return false;
  if (right < -CUT_HALF_WIDTH || left > CUT_HALF_WIDTH) return false;
  // Within that reach a wall taller than the sill hides the figure or the floor round it; one no taller is left.
  return box.h > SILL;
}
