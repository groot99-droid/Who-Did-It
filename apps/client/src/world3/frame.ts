// The sprite world's frame (round 11, R1; sprite-world.md 1). Pure: no Three.js import, so tests and the hook read it
// without the renderer. One scene unit is one world px: world x is the scene's X, world y its Z, height its Y. At
// heading 0 the orthographic camera reproduces `@wdi/shared/iso` `toScreen` exactly (sx = x - y, sy = (x + y) / 2),
// so a ground point lands on the screen pixel the Phaser path puts it on.
import { toWorld } from '@wdi/shared/iso';

/** Camera elevation above the ground plane: 30 degrees gives the 2:1 diamond of a 128 x 64 tile. */
export const PITCH = Math.PI / 6;
/** Screen px per scene unit at zoom 1, across the screen: a world tile edge (64) spans half a 128 px diamond. */
export const PX_PER_UNIT = Math.SQRT2;
/** Screen px that one unit of height rises (the vertical extent of an upright face). */
export const RISE_PX_PER_UNIT = PX_PER_UNIT * Math.cos(PITCH);

/** Scene units of height for a rise of `px` screen px (a wall, a prop's greybox block). */
export const unitsOfRise = (px: number): number => px / RISE_PX_PER_UNIT;

/** Scene units across for `px` screen px of a billboard's width. */
export const unitsOfWidth = (px: number): number => px / PX_PER_UNIT;

/**
 * The camera heading in quarter turns, 0 to 3 (R2 turns it). At 0 the camera looks from world south-east to
 * north-west, the view of today's isometric screens.
 */
export type Heading = 0 | 1 | 2 | 3;

/** The rotation about Y that turns a billboard (a plane facing +Z) toward the camera at a heading. */
export const billboardYaw = (heading: Heading): number => Math.PI / 4 + (heading * Math.PI) / 2;

/** Unit vector from the target toward the camera, in scene axes, for a yaw (mid-turn included). */
export function cameraDirectionAt(yaw: number): { x: number; y: number; z: number } {
  const flat = Math.cos(PITCH);
  return { x: flat * Math.sin(yaw), y: Math.sin(PITCH), z: flat * Math.cos(yaw) };
}

/** Unit vector from the target toward the camera, in scene axes, for a heading. */
export const cameraDirection = (heading: Heading): { x: number; y: number; z: number } =>
  cameraDirectionAt(billboardYaw(heading));

/** How long a quarter turn of the camera takes (round 11, R2; Q5: a quick animated turn). */
export const TURN_SECONDS = 0.25;

/** The heading one quarter turn on from `heading` (`step` +1 or -1). */
export const turnHeading = (heading: Heading, step: 1 | -1): Heading => ((heading + step + 4) % 4) as Heading;

/**
 * The yaw `dt` seconds on from `yaw` toward `target`, at a quarter turn per `TURN_SECONDS`, eased out; it lands on
 * `target` exactly. With `instant` (reduced motion) it lands at once.
 */
export function stepYaw(yaw: number, target: number, dt: number, instant = false): number {
  const left = target - yaw;
  if (instant || Math.abs(left) < 1e-4) return target;
  const speed = (Math.PI / 2 / TURN_SECONDS) * Math.max(0.35, Math.min(1, Math.abs(left) / (Math.PI / 4)));
  const step = speed * dt;
  return Math.abs(left) <= step ? target : yaw + Math.sign(left) * step;
}

/**
 * The screen angle, in degrees clockwise from screen up, at which world north (world -y) points on the ground at a
 * camera `yaw`: the compass needle. At heading 0 north lies up and to the right, along a diamond edge.
 */
export function northAngle(yaw: number): number {
  const t = yaw - Math.PI / 4;
  const sx = Math.sin(t) + Math.cos(t);
  const sy = (Math.sin(t) - Math.cos(t)) / 2;
  return (Math.atan2(sx, -sy) * 180) / Math.PI;
}

/**
 * The orthographic frustum that matches a Phaser camera: `view` is its world view (screen px), `zoom` its zoom and
 * `width` x `height` the canvas in CSS px. Returns the ground point under the view's centre (world px) and the
 * half-extents of the frustum in scene units.
 */
export function matchView(
  view: { x: number; y: number; width: number; height: number },
  zoom: number,
  width: number,
  height: number,
): { target: { x: number; y: number }; halfW: number; halfH: number } {
  const target = toWorld(view.x + view.width / 2, view.y + view.height / 2);
  const k = 2 * PX_PER_UNIT * zoom;
  return { target, halfW: width / k, halfH: height / k };
}
