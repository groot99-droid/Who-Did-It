import { z } from 'zod';
import { GddRef, Id } from './common.js';

// Round 8 (GDD 3.23; docs/round8/economy.md 2), Session 8C: the Scrip numbers that are not `balance.json` `economy`.
// `shops` and `prices` are filled by the shops step; 8D adds its own top-level keys beside these.

const Scrip = z.number().int().nonnegative();

/** A stake tier: the purse a seat starts with is drawn uniformly in [min, max]. */
const StakeTier = z.strictObject({ min: Scrip, max: Scrip }).refine((t) => t.min <= t.max, 'min > max');

export const EconomyFile = z.strictObject({
  gddRef: GddRef,
  /**
   * The starting stake, by the seat's public look (never its card, so a cover's purse matches the look it wears):
   * each look id names a tier, a seat with no look takes `default`.
   */
  stakes: z.strictObject({
    tiers: z.record(Id, StakeTier),
    byLook: z.record(Id, Id),
    default: Id,
  }),
  shops: z.record(Id, z.unknown()),
  prices: z.record(Id, Scrip),
});
export type EconomyFile = z.infer<typeof EconomyFile>;
