import { z } from 'zod';
import { GddRef, Id, LookId, PrefixedId, Seconds, WorldId } from './common.js';
import { MAP_IDS } from './maps.js';

/**
 * `economy.json` (round 8, GDD 3.23, docs/round8/economy.md): the numbers of Book IV on today's maps. Session 8D's
 * keys are `rent`, `quota`, `curfew`, `faith`, `notices` and `hq`; 8C's Scrip keys (`shops`, `stakes`, `prices`) join
 * the same file.
 */

const Scrip = z.number().int().nonnegative();
const Count = z.number().int().positive();
const MapId = z.enum(MAP_IDS);

/** A material a tier consumes from the investor's inventory: an `items.json` id and a count. */
export const Material = z.strictObject({ item: Id, qty: Count });
export type Material = z.infer<typeof Material>;

/**
 * The passive perks a tier can give to every seat walking in its station's look (GDD 3.23). A multiplier is a factor
 * on the base number; `slipsExtra` and `noticesHeld` add whole counts; `famishedImmune` is a flag (1). The perks on
 * 8D's loops are read in `sim/economy`; the others are one-line reads the owning session takes (8A's body, 8C's
 * shops).
 */
export const PERK_KEYS = [
  'faithGain',
  'indulgenceFaith',
  'sealShield',
  'rentDue',
  'quotaDue',
  'fenceGain',
  'slipsExtra',
  'noticesHeld',
  'shopDiscount',
  'staminaRegen',
  'hpRegen',
  'healGain',
  'famishedImmune',
  'creatureDmg',
  'lightGain',
] as const;
export const PerkKey = z.enum(PERK_KEYS);
export type PerkKey = z.infer<typeof PerkKey>;

export const HqTier = z.strictObject({
  scrip: Scrip,
  materials: z.array(Material),
  perks: z.partialRecord(PerkKey, z.number().positive()),
});
export type HqTier = z.infer<typeof HqTier>;

export const HqStation = z.strictObject({
  /** The public look that may invest (A131's rule: the look, never the card). */
  look: LookId,
  /** The station's `hq_` prop on each map that has one. */
  props: z.partialRecord(MapId, PrefixedId),
  /** Tiers 1, 2 and 3 in order. */
  tiers: z.array(HqTier).length(3),
});
export type HqStation = z.infer<typeof HqStation>;

const Price = z.strictObject({ faith: Count, scrip: Scrip });

export const EconomyFile = z.strictObject({
  gddRef: GddRef,
  rent: z.strictObject({
    maps: z.array(MapId),
    amount: Count,
    /** Rent falls due this far into the day (0.5 is midday) and must be paid by dusk. */
    dueAtDayFrac: z.number().gt(0).lt(1),
  }),
  quota: z.strictObject({
    maps: z.array(MapId),
    /** Items hauled to a tally rack each shift (the day); any mix of `items`. */
    qty: Count,
    items: z.array(Id).min(1),
    /** Scrip a short seat is fined at the shift change (dusk). */
    fine: Count,
    racks: z.array(PrefixedId).min(1),
  }),
  /** The scenes whose doors refuse an Indebted seat from dusk until it pays (GDD 3.23), per map. */
  curfew: z.partialRecord(MapId, z.array(WorldId)),
  faith: z.strictObject({
    altars: z.array(PrefixedId).min(1),
    /** Faith earned per Scrip donated. */
    perScrip: z.number().positive(),
    donateMax: Count,
    max: Count,
    indulgence: Price,
    seal: Price,
    /** After a Seal is presented, no vote may name its holder for this long. */
    sealShieldS: Seconds,
    /** Seals a seat may hold at once. */
    holdMax: Count,
  }),
  notices: z.strictObject({
    mailbags: z.array(PrefixedId),
    blackMarkets: z.array(PrefixedId),
    slipsPerBag: Count,
    maxHeld: Count,
    fencePrice: Count,
    /** The rumour ledger samples who stands where this often. */
    sampleS: z.number().positive(),
    /** A notice unshown and uncleansed this many day cycles after it was made is printed at the next meeting. */
    gazetteAfterRounds: Count,
  }),
  hq: z.strictObject({ stations: z.record(Id, HqStation) }),
});
export type EconomyFile = z.infer<typeof EconomyFile>;
