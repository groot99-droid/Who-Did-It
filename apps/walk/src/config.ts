// Viewer constants for the walk-through. They are not game balance (balance.json owns those) and live only here.

/** Where the world GLB comes from when neither `?glb=` nor a dropped file gives one. The Pages deploy downloads
 * `hollowmere_walk.glb` from the `walk-glb` release into the walk's folder and sets `VITE_WALK_GLB` to its name, so
 * it loads from the same origin. Without that (a local build, CI, no release yet) there is no default and the page
 * asks for a file. */
const WALK_GLB_FILE: string | undefined = import.meta.env.VITE_WALK_GLB;
export const DEFAULT_GLB_URL: string | null = WALK_GLB_FILE
  ? `${import.meta.env.BASE_URL}${WALK_GLB_FILE}`
  : null;

/** The index a build opens when the address names no world (docs/walk-areas.md, section 2): `VITE_WALK_INDEX`, a
 * `walk-index.json` beside the page or a full address. It wins over `DEFAULT_GLB_URL`; `?glb=` wins over both. No
 * deploy sets it yet, so it is null in every build today. */
const WALK_INDEX_FILE: string | undefined = import.meta.env.VITE_WALK_INDEX;
export const DEFAULT_INDEX_URL: string | null = WALK_INDEX_FILE
  ? /^[a-z]+:/i.test(WALK_INDEX_FILE)
    ? WALK_INDEX_FILE
    : `${import.meta.env.BASE_URL}${WALK_INDEX_FILE}`
  : null;

/** Crossings between area files (an index world): the ink fade and the loading hint. */
export const CROSSING = {
  /** Each way of the fade to ink and back, milliseconds: about 0.4 s in all. */
  fadeMs: 200,
  /** The loading hint shows above the ink once a crossing has taken this long, milliseconds. */
  hintAfterMs: 400,
  /** The ink, `#12141C`: the fade, the indoor background, the page and the canvas before a world shows. */
  ink: '#12141C',
} as const;

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
  /** Physics sub-step, seconds; a frame's delta is clamped to `maxFrame`, which is long enough that a slow device
   * (4 fps and up; software WebGL in CI runs about 6) keeps real-time speed, and short enough that a frame after a
   * stall or a hidden tab doesn't jump the player. */
  subStep: 1 / 120,
  maxFrame: 0.25,
  /** Below the world's lowest point by this much, the player returns to the spawn. */
  killDepth: 25,
} as const;

// The traversal modes (src/traverse.ts): a cave file's `Trav_<id>` zones put the walker into them by themselves; the
// WALK values hold everywhere else.

export const TRAVERSE = {
  /** A crawl or sidle box counts this much longer at both ends of its X axis (the passage), metres: the walking
   * body (radius 0.3 m) stops that far from a low or narrow mouth, and its feet must still reach the box. */
  endMargin: 0.3,
  /** Feet this close outside a box still count as inside it, metres (feet resting exactly on one of its faces). */
  edge: 0.01,
  /** Time for the eye to move between the walking and the crawling height, seconds. */
  eyeSeconds: 0.3,
} as const;

export const CRAWL = {
  /** Top of the body above the feet, metres. The solid part runs from the step height (0.35 m) to here: a sphere of
   * radius 0.275 m, so a passage 1 m high is crawled and not walked. */
  bodyHeight: 0.9,
  /** Camera height above the feet, metres. */
  eyeHeight: 0.55,
  /** m/s; there is no running. */
  speed: 0.6,
  /** Standing up needs nothing within this height above the feet, metres. */
  standRoom: 1.8,
} as const;

export const SIDLE = {
  /** Body radius while walking sideways, metres; the height stays the walking one. */
  radius: 0.18,
  /** m/s along the passage; there is no running. */
  speed: 0.5,
  /** The view is held within this angle of the wall it faces, radians (60 degrees). */
  viewHold: Math.PI / 3,
  /** How fast the view turns to face that wall, radians per second (a quarter turn in about 0.3 s). */
  turnRate: 5,
  /** After walking into a sidle box through one of its sides (between its X ends), input across the passage moves
   * the walker only outwards, away from the box's middle plane, and only once the feet are this far off it, metres:
   * it backs out the way it came. Entered through an X end (or arriving), movement is only along the passage. */
  sideOut: 0.001,
  /** Hysteresis at a sidle box's X ends. A walker who sidled out through an end walks, and walks on in that box (its
   * end margins included) unless it heads back into the passage through that end within this angle of its axis,
   * radians (30 degrees): where a fissure opens at an angle into walking space, the way on leaves it beside the box,
   * and a walker on that way no longer sidles and walks by turns (route 1, the Ice Curtain: 26 changes). */
  reentryAngle: Math.PI / 6,
  /** ... and on a line that stays within the box's width until it is this far in from that end, metres (the whole
   * box if it is shorter): a heading inside the angle that leaves the box's side sooner goes to an opening beside the
   * passage, not into it (route 2, the East Holing, where the way on leaves the fissure through its open side 1 m
   * before the box's end: 62 changes). */
  reentryDepth: 1,
  /** ... until the feet are this far clear of the box with its end margins, metres; from there it is entered as
   * always, through an end or a side. */
  reentryClear: 0.15,
} as const;

export const CLIMB = {
  /** Speed on the face, up, down and sideways, m/s. */
  speed: 0.6,
  /** The feet are held this far out from the face plane, metres. */
  hold: 0.35,
  /** How far in front of the face plane a walker at the foot attaches, and a walker stepping off the ledge is caught,
   * metres. */
  reach: 0.6,
  /** How far the feet may be from the foot of the face (the bottom of its box) to attach, metres. Going down, a floor
   * under the feet lets the walker go only within this far of the foot (rock higher up the face does not), and a
   * walker with no floor under it lets go and falls this far below the foot. */
  footBand: 0.5,
  /** A walker falling past the face within this depth below its top is caught, metres. */
  catchBand: 0.5,
  /** The input must point within this angle of the face to attach, radians (60 degrees). */
  attachAngle: Math.PI / 3,
  /** The mantle at the top: how long it takes, seconds, and how far beyond the face plane it sets the feet down,
   * metres. */
  mantleSeconds: 0.5,
  mantleReach: 0.8,
  /** Rock on the ledge, or a drop behind a narrow ridge, shortens the mantle: the body is tested every `mantleStep`
   * metres out from the edge, and the feet land as far out as it fits with ground under them, but no nearer the face
   * plane than `mantleMinReach`. With no such room even for the crawling body the walker hangs at the top. */
  mantleStep: 0.05,
  mantleMinReach: 0.2,
  /** The ledge is looked for down to this far below the top of the box, metres. */
  ledgeDrop: 1,
} as const;

/**
 * The carried lantern (src/lantern.ts): on in cave areas, off in the village and in rooms. A warm point light added
 * in the unlit materials' shaders as base colour x lantern(d), in linear light before tone mapping, with
 * lantern(d) = intensity / (1 + (d / near)^2) x (1 - smoothstep(0.7 x reach, reach, d)). No shadows.
 */
export const LANTERN = {
  /** The light's colour, `#FFB457` (the palette's warm), as sRGB; the shader takes it linear. */
  colour: '#FFB457',
  /** Below the eye, metres: 1.45 m above the feet while walking (eye 1.6 m); crawling it stays this far under the
   * eye (0.4 m above the feet), so it is never carried up into a low roof. */
  belowEye: 0.15,
  /** How far ahead of the eye on the ground plane, metres. */
  ahead: 0.3,
  /** The falloff's knee, metres: at this distance the light is half of `intensity`. */
  near: 2.5,
  /** Nothing is lit beyond this, metres; the light fades out from 0.7 of it. */
  reach: 12,
  /**
   * Scene-linear intensity. A cave wall of the most common albedo (the limestone walls' scan, as the file carries it:
   * its mean linear luminance, 0.1843; the twelve scans of the realism pass are about twice as bright as the first
   * scans were) square to the lantern and 2 m from it shows display luminance 0.48 through AgX at the caves' exposure
   * (2.378) from the lantern alone, 0.50 with the bake's floor: under the cave look's lamp-pool display (0.55, which
   * every gate lamp's pool is held at or under), so the lantern is the dimmer light. Solved with the AgX port in
   * test/lantern.test.ts: the light at 2 m is 0.73, and 0.73 x (1 + (2 / 2.5)^2) = 1.2. Within 1.5 m of a wall the
   * display stays under 0.56 (the angle term and the occlusion take it lower still), so the wall does not wash out.
   */
  intensity: 1.2,
  /** The flicker's depth: the light moves by at most this share either way, slowly (nothing above 2.2 Hz). */
  flicker: 0.03,
  /**
   * The surface-angle term's weight, 0 to 1: the light is scaled by (1 - form) + form x max(N.L, 0), N the surface
   * normal from the GLB (or the screen's derivative of the position, where the file has none) turned to face the eye
   * and L the direction to the lantern. A wall square to the lantern keeps all of it; one seen edge on keeps 1 - form.
   */
  form: 0.6,
  /**
   * How far the baked ambient occlusion scales the lantern, 0 to 1: the light is scaled by mix(1, ao, aoWeight), ao
   * the lightmap page's alpha (1 open, near 0 in a crevice; a material without a page is not occluded). A crevice
   * stays dark under the lantern and a ledge and a formation read as forms.
   */
  aoWeight: 0.9,
  /** The ink, `#12141C`: the darkest value a cave pixel is drawn at (the cave look's ink; the shader clamps to it). */
  ink: '#12141C',
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
  /** At most 500 m with distance fog: the wild areas sit 900 m and more from the village (README, GLB contract). */
  far: 500,
} as const;
