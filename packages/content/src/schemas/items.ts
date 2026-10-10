import { z } from "zod";
import { GddRef, Id, Ships, Tiles } from "./common.js";

export const Item = z.strictObject({
  id: Id,
  name: z.string().min(1),
  kind: z.enum(["weapon", "key", "tool", "charge", "medical", "light", "deliverable", "valuable"]),
  /** Role-bound items never drop on death; the Magnifier is the one exception (GDD 3.5). */
  roleBound: z.boolean(),
  /** `inspectStation`: drops as a world object anyone can Inspect with (the Magnifier). */
  onDeath: z.enum(["drops", "kept", "inspectStation"]),
  /** Ability in abilities.json this item performs, if any. */
  use: Id.optional(),
  lightRadiusTiles: Tiles.optional(),
  tooltip: z.string().min(1),
  ships: Ships,
  gddRef: GddRef,
});
export type Item = z.infer<typeof Item>;

export const ItemsFile = z.strictObject({
  gddRef: GddRef,
  inventorySlots: z.number().int().positive(),
  items: z.record(Id, Item),
});
export type ItemsFile = z.infer<typeof ItemsFile>;
