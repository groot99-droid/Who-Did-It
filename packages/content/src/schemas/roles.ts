import { z } from 'zod';
import { Faction, GddRef, Id, LookId, PaletteToken, Ships, byPlayerCount } from './common.js';

export const KitEntry = z.strictObject({ item: Id, qty: z.number().int().positive() });

export const FactionInfo = z.strictObject({
  name: z.string().min(1),
  color: PaletteToken,
  icon: z.enum(['shield', 'dagger', 'mask']),
  /** Members are told each other's names on the role card (Cabal only). */
  membersKnowEachOther: z.boolean(),
});

export const Role = z.strictObject({
  id: Id,
  name: z.string().min(1),
  faction: Faction,
  /**
   * Wears the look of another card of the deck instead of its own (GDD 3.17): Killer, Accomplice, Drifter.
   */
  cover: z.boolean(),
  /**
   * The character on this card (looks.json). Null for a row no deck deals: the Townsfolk class row, the heir and
   * unshipped roles.
   */
  look: LookId.nullable(),
  /** A profession names the class row it plays as; every rules field equals that row's (validate.ts). */
  plays: Id.optional(),
  ships: Ships,
  /** Part of the M3 first playable (GDD 3.10). */
  firstPlayable: z.boolean(),
  /** One-line goal on the role card and the HUD chip. */
  goal: z.string().min(1),
  /** Who this role wins with; parity and practice rules live in balance.json. */
  winsWith: z.enum(['village', 'cabal', 'self']),
  win: z.string().min(1),
  /** What the role counts as for the parity check (GDD 3.8). */
  parity: z.enum(['village', 'cabal', 'nobody']),
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

/** One deck row (GDD 3.1, 3.9). */
export const DeckRow = z.strictObject({
  /** Practice party: lobby warning, no ranking (GDD 3.1). */
  practice: z.boolean(),
  /**
   * Card role ids in display order (cover cards, village specials, professions), player count + 2. Every Killer
   * card is always dealt; two of the other cards stay undealt.
   */
  cards: z.array(Id).min(6).max(12),
  gddRef: GddRef,
});
export type DeckRow = z.infer<typeof DeckRow>;

export const RolesFile = z.strictObject({
  gddRef: GddRef,
  factions: z.strictObject({ village: FactionInfo, cabal: FactionInfo, neutral: FactionInfo }),
  roles: z.record(Id, Role),
  /** Keyed "4".."10": `decks[String(n)].cards`. */
  decks: byPlayerCount(DeckRow),
});
export type RolesFile = z.infer<typeof RolesFile>;
