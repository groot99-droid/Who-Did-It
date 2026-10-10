import { z } from "zod";
import { Faction, GddRef, Id, Ships } from "./common.js";

/** Quick-mode act ids sent as `act.ability` (ARCHITECTURE 5.14), e.g. `onub.take`. */
export const OnubActId = z.string().regex(/^onub\.[a-z][A-Za-z]*$/);

export const OnubRole = z.strictObject({
  id: Id,
  name: z.string().min(1),
  faction: Faction,
  ships: Ships,
  /** Who this role wins with when the dawn table is judged on final loaves. */
  winsWith: z.enum(["village", "cabal", "self"]),
  /** Has a night window in balance.onub.json (false: Debtor, Gamekeeper, Mourner). */
  wakes: z.boolean(),
  /** Night act summary for the role card; the window itself lives in balance.onub.json. */
  nightAct: z.string().min(1),
  cardText: z.string().min(1),
  gddRef: GddRef,
});
export type OnubRole = z.infer<typeof OnubRole>;

export const OnubRolesFile = z.strictObject({
  gddRef: GddRef,
  /** Printed on every quick-mode role card. */
  cardLine: z.string().min(1),
  /** Role dealt in place of a planned role that has not shipped yet. */
  standIn: Id,
  roles: z.record(Id, OnubRole),
});
export type OnubRolesFile = z.infer<typeof OnubRolesFile>;
