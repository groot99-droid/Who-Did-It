import { z } from 'zod';

export const MetricsFile = z.strictObject({
  source: z.literal('docs/WORLD.md 4.2, docs/ASSETS.md 6.1-6.3'),
  tilePx: z.literal(64),
  metersPerTile: z.literal(1),
  characterCellPx: z.literal(128),
  maxStandingSilhouettePx: z.number().int().positive(),
  maxSilhouetteTiles: z.number().positive(),
  characterHeadsTall: z.number().positive(),
  camera: z.strictObject({
    tiltXDeg: z.number(),
    yawZDeg: z.number(),
    verticalSquash: z.number().positive().max(1),
    wallPxPerMeter: z.number().int().positive(),
    groundTileTiltXDeg: z.literal(0),
  }),
  render: z.strictObject({
    fps: z.number().int().positive(),
    overscan: z.number().min(0).max(1),
    propCellPx: z.strictObject({ min: z.number().int(), max: z.number().int() }),
  }),
  overworldTiles: z.strictObject({ w: z.number().int(), h: z.number().int() }),
  interiorCameraFollow: z.literal(true),
});
export type MetricsFile = z.infer<typeof MetricsFile>;
