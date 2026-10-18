import { z } from 'zod';

/** A camelCase record id such as `killer`, `sinEater` or `skeletonKey`. */
export const Id = z.string().regex(/^[a-z][A-Za-z0-9]*$/, 'ids are camelCase');

/**
 * A look id from looks.json (GDD 3.17): the atlas body id of `char/<lookId>/<anim>/<dir>`, so lowercase letters and
 * digits only.
 */
export const LookId = z.string().regex(/^[a-z][a-z0-9]*$/, 'look ids are lowercase letters and digits');

/** A snake_case world id such as `tavern_bar` or `cave_side` (scenes, spawns). */
export const WorldId = z.string().regex(/^[a-z][a-z0-9_]*$/, 'world ids are snake_case');

/** A prefixed world id such as `tb.front` or `ov.well` (portals, spots, props). */
export const PrefixedId = z
  .string()
  .regex(/^[a-z]{2}\.[a-z][a-z0-9_]*$/, 'prefixed ids look like `tb.front`');

/** Section of docs/GDD.md a record copies its rules and numbers from, e.g. "3.2". */
export const GddRef = z.string().regex(/^\d+(\.\d+)*$/, 'gddRef is a section number like 3.2');

/** Release a record ships in (GDD 3.10, 3.11). */
export const Ships = z.enum(['V1', 'V1.1', 'V1.5', 'V2']);
export type Ships = z.infer<typeof Ships>;

export const Faction = z.enum(['village', 'cabal', 'neutral']);
export type Faction = z.infer<typeof Faction>;

/** A palette token name; the values live in palette.json. */
export const PaletteToken = z.enum([
  'ink',
  'slate',
  'fog',
  'bone',
  'mustard',
  'teal',
  'magenta',
  'blood',
  'lantern',
  'moon',
]);
export type PaletteToken = z.infer<typeof PaletteToken>;

export const Seconds = z.number().nonnegative();
export const Tiles = z.number().nonnegative();

/** Player counts are 4..10 and JSON keys are strings, so rows are keyed "4".."10". */
export const PLAYER_COUNTS = ['4', '5', '6', '7', '8', '9', '10'] as const;
export const PlayerCountKey = z.enum(PLAYER_COUNTS);
export type PlayerCountKey = z.infer<typeof PlayerCountKey>;

/** A record keyed by every player count from 4 to 10, no more and no fewer. */
export function byPlayerCount<T extends z.ZodType>(row: T) {
  return z.strictObject({
    '4': row,
    '5': row,
    '6': row,
    '7': row,
    '8': row,
    '9': row,
    '10': row,
  });
}
