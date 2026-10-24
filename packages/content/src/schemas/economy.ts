import { z } from 'zod';
import { GddRef, Id, PrefixedId } from './common.js';

// Round 8 (GDD 3.23; docs/round8/economy.md 2), Session 8C: the Scrip numbers that are not `balance.json` `economy`.
// 8D adds its own top-level keys beside these.

const Scrip = z.number().int().nonnegative();

/** A stake tier: the purse a seat starts with is drawn uniformly in [min, max]. */
const StakeTier = z.strictObject({ min: Scrip, max: Scrip }).refine((t) => t.min <= t.max, 'min > max');

const Shop = z.strictObject({ prop: PrefixedId, sells: z.array(Id), buys: z.array(Id) });

const Price = z
  .strictObject({ ask: Scrip.positive().optional(), pay: Scrip.positive().optional() })
  .refine((p) => p.ask !== undefined || p.pay !== undefined, 'a price needs ask or pay')
  .refine((p) => p.ask === undefined || p.pay === undefined || p.pay < p.ask, 'pay must be below ask');

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
  /**
   * A shop is one scene static (`prop`, a prop of kind `counter`): the items it sells at their `ask` and the items it
   * buys at their `pay`.
   */
  shops: z.record(Id, Shop),
  /** Per item: what a shop asks for one (`ask`) and what a shop pays for one (`pay`). */
  prices: z.record(Id, Price),
});
export type EconomyFile = z.infer<typeof EconomyFile>;
