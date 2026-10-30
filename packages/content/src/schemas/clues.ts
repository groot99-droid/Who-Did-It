import { z } from 'zod';
import { GddRef, Id, Ships } from './common.js';

export const Decay = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('never') }),
  z.strictObject({ kind: z.literal('seconds'), seconds: z.number().positive() }),
  z.strictObject({ kind: z.literal('cycles'), cycles: z.number().int().positive() }),
  /** Replaced at every meeting (the Ledger). */
  z.strictObject({ kind: z.literal('meeting') }),
  /** Information, not an object in the world. */
  z.strictObject({ kind: z.literal('instant') }),
]);
export type Decay = z.infer<typeof Decay>;

export const Clue = z.strictObject({
  /** Frozen id; the sprite key is `clue_<id>`. */
  id: Id,
  name: z.string().min(1),
  reveals: z.enum([
    'cause',
    'height',
    'scarf',
    'hat',
    'bloody',
    'fingerprint',
    'trail',
    'timeOfDeath',
    'heightScarf',
    'lastHouse',
    'inventory',
    'washed',
    'wolf',
    'wounded',
    'hunger',
    /** Round 10 (D5c): a lock was picked here. */
    'picked',
  ]),
  /** A physical object in a scene that can be collected (hold E) into the Notebook. */
  inWorld: z.boolean(),
  collectible: z.boolean(),
  decay: Decay,
  /** Who can read it: anyone, or the role (or ability) that turns it into a Verified entry. */
  reader: z.enum(['anyone', 'detective', 'doctor', 'child', 'butler']),
  /** Ability that reads it, when a role is needed. */
  readWith: Id.optional(),
  /** Accomplice Plant Clue can forge this clue. */
  plantable: z.boolean(),
  source: z.enum([
    'kill',
    'wolfKill',
    'drag',
    'wash',
    'death',
    'wound',
    'hunger',
    'drop',
    'ability',
    'static',
    /** Round 8 (GDD 3.24, 8E): left by a mugging. */
    'mugging',
    /** Round 10 (D5c, GDD 3.29): left by a lock a pick opened. */
    'pick',
  ]),
  params: z.record(z.string().regex(/^[a-z][A-Za-z0-9]*$/), z.number()).optional(),
  description: z.string().min(1),
  ships: Ships,
  gddRef: GddRef,
});
export type Clue = z.infer<typeof Clue>;

export const CluesFile = z.strictObject({
  gddRef: GddRef,
  clues: z.record(Id, Clue),
});
export type CluesFile = z.infer<typeof CluesFile>;
