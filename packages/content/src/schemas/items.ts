import { z } from 'zod';
import { GddRef, Id, Ships, Tiles } from './common.js';
import { ToolTag } from './interactions.js';

export const Item = z.strictObject({
  id: Id,
  name: z.string().min(1),
  /** `material`: a gathered resource that stacks (GDD 3.14); its id is the `resources.json` row it comes from. */
  kind: z.enum([
    'weapon',
    'key',
    'tool',
    'charge',
    'medical',
    'light',
    'deliverable',
    'valuable',
    'material',
    /** Round 8 (GDD 3.22): eaten with `eat`; any food cures Famished and Weakened. */
    'food',
    /** Round 10, D6a (GDD 3.22): worn in the body slot; its numbers are `balance.json` `armor`. */
    'armour',
  ]),
  /** Role-bound items never drop on death; the Magnifier is the one exception (GDD 3.5). */
  roleBound: z.boolean(),
  /** `inspectStation`: drops as a world object anyone can Inspect with (the Magnifier). */
  onDeath: z.enum(['drops', 'kept', 'inspectStation']),
  /** Ability in abilities.json this item performs, if any. */
  use: Id.optional(),
  lightRadiusTiles: Tiles.optional(),
  /** Round 10, D4a (GDD 3.14): the dish buff (an `effects.json` id) eating this item gives. */
  buff: Id.optional(),
  /** Round 10, D6a (GDD 3.22): what a worn item does besides `balance.json` `armor.tierMult` (logic-table 8.3). */
  armor: z
    .strictObject({
      tier: z.number().int().min(1).max(3),
      /** A factor on the rate or length of an effect the wearer has. */
      resist: z.partialRecord(z.enum(['poisoned', 'bleeding']), z.number().gt(0).lte(1)).optional(),
      staminaRegenMult: z.number().gt(0).lte(1).optional(),
      speedMult: z.number().gt(0).lte(1).optional(),
    })
    .optional(),
  /** Round 10, A12 (GDD 3.30): the equipment slot this item fits; none fits one until armour and weapons (D6). */
  equip: z.enum(['head', 'body', 'weapon']).optional(),
  /** Round 10 (A10; logic-table.md 3.3): the capability tags this tool carries, each with its tier. */
  tool: z.partialRecord(ToolTag, z.number().int().min(1).max(3)).optional(),
  /** Round 10 (A10): uses before the tool breaks, each worn by an interaction's `wear`; absent = it lasts. */
  uses: z.number().int().positive().optional(),
  tooltip: z.string().min(1),
  ships: Ships,
  gddRef: GddRef,
});
export type Item = z.infer<typeof Item>;

export const ItemsFile = z.strictObject({
  gddRef: GddRef,
  /** The hotbar and the pack together (GDD 3.30); `balance.inventory.hotbar` of them are the hotbar. */
  inventorySlots: z.number().int().positive(),
  items: z.record(Id, Item),
});
export type ItemsFile = z.infer<typeof ItemsFile>;
