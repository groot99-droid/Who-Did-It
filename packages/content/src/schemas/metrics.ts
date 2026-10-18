import { z } from 'zod';
import { PaletteToken } from './common.js';

const Ambient = z.strictObject({ color: PaletteToken, alpha: z.number().min(0).max(1) });

export const MetricsFile = z.strictObject({
  source: z.literal('docs/WORLD.md 4.2, 4.7, docs/ASSETS.md 6.1-6.3, docs/SPRITES.md 10'),
  tilePx: z.literal(64),
  metersPerTile: z.literal(1),
  /** Displayed character cell; packed at half size (`iso.packedCharacterCellPx`). */
  characterCellPx: z.literal(128),
  maxStandingSilhouettePx: z.number().int().positive(),
  maxSilhouetteTiles: z.number().positive(),
  characterHeadsTall: z.number().positive(),
  /** The one render camera (SPRITES 10.3): ground tiles are rendered by it too. */
  camera: z.strictObject({
    tiltXDeg: z.literal(60),
    yawZDeg: z.literal(45),
    verticalSquash: z.number().positive().max(1),
    wallPxPerMeter: z.number().int().positive(),
    groundTileTiltXDeg: z.literal(60),
  }),
  /** SPRITES 10: the isometric presentation. */
  iso: z.strictObject({
    tileW: z.literal(128),
    tileH: z.literal(64),
    /** Displayed px per metre along the ground. */
    pxPerMeter: z.number().positive(),
    /** Heights are rendered at this fraction of true scale (characters uniformly). */
    zScale: z.number().positive().max(1),
    /**
     * Sprites are packed at 1 / artScale and drawn artScale times larger (nearest while the main pixel
     * finish is on, SPRITES 10.3).
     */
    artScale: z.literal(2),
    packedCharacterCellPx: z.literal(64),
    packedDieCellPx: z.literal(128),
    wallHeightM: z.strictObject({
      full: z.number().positive(),
      half: z.number().positive(),
      stub: z.number().positive(),
    }),
    /** Solid tiles farther than this from every walkable tile (Chebyshev) draw nothing. */
    deepCullTiles: z.number().int().positive(),
    /** Extra camera bound above the map, for tall sprites on the north edge. */
    topPadPx: z.number().int().nonnegative(),
    /** The camera shows about this many tiles' worth of height (a tile is 64 px either way). */
    viewTilesHigh: z.number().positive(),
    /** Camera zoom snaps down to a multiple of this, so an art pixel is a whole number of screen pixels. */
    zoomStep: z.number().positive(),
  }),
  /** GDD 3.13, WORLD 4.7: the darkness layer. */
  lighting: z.strictObject({
    ambient: z.strictObject({ day: Ambient, night: Ambient, dark: Ambient }),
    /** A pool erases fully out to this fraction of its radius, then fades to its edge. */
    lightCore: z.number().min(0).max(1),
    /** Strength of a pool's additive colour glow. */
    glowAlpha: z.number().min(0).max(1),
    /** Torch and fire pools: radius wobble frequency and amplitude (fraction of the radius). */
    flicker: z.strictObject({ hz: z.number().positive(), amp: z.number().min(0).max(0.5) }),
    occluderFadeAlpha: z.number().min(0).max(1),
    occluderFadeS: z.number().nonnegative(),
  }),
  render: z.strictObject({
    fps: z.number().int().positive(),
    overscan: z.number().min(0).max(1),
    propCellPx: z.strictObject({ min: z.number().int(), max: z.number().int() }),
  }),
  overworldTiles: z.strictObject({ w: z.number().int(), h: z.number().int() }),
  interiorCameraFollow: z.literal(true),
  /** Side of the square collision box under a player's feet, in tiles (WORLD 4.2). */
  collisionBoxTiles: z.number().positive().max(1),
});
export type MetricsFile = z.infer<typeof MetricsFile>;
