import { z } from "zod";
import { Faction, GddRef, Id, PaletteToken, Ships, byPlayerCount } from "./common.js";

export const KitEntry = z.strictObject({ item: Id, qty: z.number().int().positive() });

export const FactionInfo = z.strictObject({
  name: z.string().min(1),
  color: PaletteToken,
  icon: z.enum(["shield", "dagger", "mask"]),
  /** Members are told each other's names on the role card (Cabal only). */
  membersKnowEachOther: z.boolean(),
});

export const Role = z.strictObject({
  id: Id,
  name: z.string().min(1),
  faction: Faction,
  ships: Ships,
  /** Part of the M3 first playable (GDD 3.10). */
  firstPlayable: z.boolean(),
  /** One-line goal on the role card and the HUD chip. */
  goal: z.string().min(1),
  /** Who this role wins with; parity and practice rules live in balance.json. */
  winsWith: z.enum(["village", "cabal", "self"]),
  win: z.string().min(1),
  /** What the role counts as for the parity check (GDD 3.8). */
  parity: z.enum(["village", "cabal", "nobody"]),
  startKit: z.array(KitEntry),
  /** Ability ids from abilities.json in card order; the card shows at most 3. */
  abilities: z.array(Id).max(3),
  cardText: z.string().min(1),
  beware: z.string().min(1),
  /** Emergency Bell pulls per match. */
  bellPulls: z.number().int().nonnegative(),
  gddRef: GddRef,
});
export type Role = z.infer<typeof Role>;

export const RosterRow = z.strictObject({
  /** Practice party: lobby warning, no ranking (GDD 3.1). */
  practice: z.boolean(),
  /** The roles V1 deals at this count, one per player. `assignRoles` shuffles this list. */
  deal: z.array(Id).min(4).max(10),
  /** The GDD 3.1 row including roles that ship later; each later role is dealt as `stand-in`. */
  planned: z.array(Id).min(4).max(10),
  gddRef: GddRef,
});
export type RosterRow = z.infer<typeof RosterRow>;

export const RolesFile = z.strictObject({
  gddRef: GddRef,
  factions: z.strictObject({ village: FactionInfo, cabal: FactionInfo, neutral: FactionInfo }),
  /** Role that stands in for a planned role that has not shipped yet. */
  standIn: Id,
  roles: z.record(Id, Role),
  /** Keyed "4".."10": `rosters[String(ids.length)].deal`. */
  rosters: byPlayerCount(RosterRow),
});
export type RolesFile = z.infer<typeof RolesFile>;
