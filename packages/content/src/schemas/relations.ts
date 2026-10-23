import { z } from 'zod';
import { GddRef, Seconds, Tiles } from './common.js';
import { MapId } from './maps.js';

// Round 8 (GDD 3.22 "Inspect"; docs/round8/body.md 7), Session 8B: what the eye reads when a seat inspects another,
// and the relations table that says which looks are suspicious to the NPCs who see them.

/**
 * One side of a relation:
 * - `role:<id>` the seat's true card (`roles.json`);
 * - `vendetta:<id>` the vendetta it holds (`vendettas.json`);
 * - `faction:<id>` its true card's faction;
 * - `look:<id>` the look it is drawn as now (`looks.json`);
 * - `figure:<id>` an ambient townsfolk profile (8E's, inert until it lands);
 * - `mark` (inspected side only) the seat the inspector's open contract names.
 */
export const RelationSide = z
  .string()
  .regex(
    /^(?:(?:role|vendetta|faction|look|figure):[a-z][A-Za-z0-9]*|mark)$/,
    'a side is `<kind>:<id>` or `mark`',
  );
export type RelationSide = z.infer<typeof RelationSide>;

/** A copy id of the client's `ui/copy/inspect.ts`, sent as `inspect.hunch { copyId }`. */
const HunchId = z
  .string()
  .regex(/^inspect\.hunch\.[a-z][A-Za-z0-9]*$/, 'a note is an `inspect.hunch.*` copy id');

export const Relation = z.strictObject({
  inspector: RelationSide,
  inspected: RelationSide,
  /** The row holds only on this map. */
  map: MapId.optional(),
  /** Added to the inspector's (drawn face's) suspicion in each NPC seat that saw the look. */
  suspicion: z.number().int().nonnegative(),
  /** The card-blind hunch sent to the inspected human. */
  note: HunchId.optional(),
  /** Names a role or figure a later round brings (the Railroad Baron, R9): validated loosely, never matched. */
  inert: z.literal(true).optional(),
});
export type Relation = z.infer<typeof Relation>;

/** Band floors as fractions of the whole: at or above `unhurt` reads "unhurt", at or above `bruised` "bruised". */
const Bands = z.strictObject({ unhurt: z.number().min(0).max(1), bruised: z.number().min(0).max(1) });

export const RelationsFile = z.strictObject({
  gddRef: GddRef,
  inspect: z.strictObject({
    rangeTiles: Tiles,
    cooldownS: Seconds,
    health: Bands,
    /** Scrip at or above which a purse reads "fair", then "heavy" (8C's scale); absent reads "unknown". */
    purse: z
      .strictObject({ fair: z.number().int().nonnegative(), heavy: z.number().int().nonnegative() })
      .optional(),
  }),
  rows: z.array(Relation),
});
export type RelationsFile = z.infer<typeof RelationsFile>;
