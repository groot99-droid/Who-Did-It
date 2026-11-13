// Viewer constants for the walk-through. They are not game balance (balance.json owns those) and live only here.

/** Where the world GLB comes from when neither `?glb=` nor a dropped file gives one. Hosting is still open
 * (see the PR that added this app); until it is answered there is no default and the page asks for a file. */
export const DEFAULT_GLB_URL: string | null = null;

export const WALK = {
  /** Camera height above the feet, metres. */
  eyeHeight: 1.6,
  /** Top of the capsule above the feet, metres. */
  bodyHeight: 1.75,
  /** Capsule radius, metres. */
  radius: 0.3,
  /** Highest ledge the player steps onto without jumping, metres (stairs, kerbs). */
  stepHeight: 0.35,
  /** How far below the feet the ground is still followed when walking down, metres. */
  snapDown: 0.35,
  walkSpeed: 1.4,
  runSpeed: 3.5,
  /** m/s^2 */
  gravity: 9.81,
  /** Fastest fall, m/s. */
  maxFall: 30,
  /** How quickly the velocity reaches the wished one, per second (ground and air). */
  accelGround: 12,
  accelAir: 2,
  /** Physics sub-step, seconds; a frame's delta is clamped to `maxFrame`. */
  subStep: 1 / 120,
  maxFrame: 0.1,
  /** Below the world's lowest point by this much, the player returns to the spawn. */
  killDepth: 25,
} as const;

export const LOOK = {
  /** Radians per pixel of mouse movement. */
  mouse: 0.0022,
  /** Radians per pixel of touch drag. */
  touch: 0.005,
  /** Radians per second at full right-stick deflection. */
  stick: 2.6,
  /** Pitch limit, radians. */
  maxPitch: 1.45,
  deadzone: 0.15,
} as const;

export const RENDER = {
  maxPixelRatio: 2,
  fov: 70,
  near: 0.05,
  far: 2000,
} as const;
