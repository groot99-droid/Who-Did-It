import { z } from 'zod';
import { GddRef, Id } from './common.js';

// Effects (GDD 3.22, round 8, Session 8A; docs/round8/body.md 6). An effect is a row keyed by its string id; the
// u8 wire id is `EffectId` in @wdi/shared (docs/round8/seams.md 2), and `validate.ts` checks the two tables agree.
// Every number of an effect lives here; `balance.json` `body` holds the body's own numbers.

/** The ids of docs/round8/seams.md 2, in wire order; append-only. */
export const EFFECT_IDS = [
  'slowed',
  'wounded',
  'bleeding',
  'weakened',
  'poisoned',
  'fatigued',
  'stunned',
  'dazed',
  'famished',
  'knockedOut',
  'indebted',
  'charm',
  'exhausted',
] as const;
export const EffectKey = z.enum(EFFECT_IDS);
export type EffectKey = z.infer<typeof EffectKey>;

/** The `StatusBit` an effect shows on the drawn figure (seams.md 2); an effect without one is inspect-only. */
export const EffectSign = z.enum(['limp', 'bleeding', 'poisoned', 'fatigued', 'stunned', 'dazed', 'down']);
export type EffectSign = z.infer<typeof EffectSign>;

const Chance = z.number().min(0).max(1);
const Factor = z.number().positive().max(1);

export const Effect = z.strictObject({
  id: EffectKey,
  name: z.string().min(1),
  /**
   * How long one application lasts; 0 is "until cured or until its condition ends" (Wounded follows health,
   * Fatigued stamina, Famished the last meal, Knocked out `body.koS`).
   */
  durationS: z.number().nonnegative(),
  /** Health drained per second while on. */
  hpPerS: z.number().positive().optional(),
  /** Walking and running speed factor. */
  speedFactor: Factor.optional(),
  /** Factor on the damage of a strike the carrier lands. */
  strikeFactor: Factor.optional(),
  /** Factor on the carrier's strike cooldown (slower strikes). */
  strikeCooldownFactor: z.number().min(1).optional(),
  /** Factor on stamina regeneration. */
  staminaRegenFactor: Factor.optional(),
  /** Factor on maximum stamina (round 10, A7: Exhausted); the body's stamina never rises above the cap. */
  maxStaminaFactor: Factor.optional(),
  /** Health does not regenerate while on. */
  blocksRegen: z.boolean().optional(),
  noRun: z.boolean().optional(),
  noMove: z.boolean().optional(),
  noAct: z.boolean().optional(),
  /** Effects this one applies while it ticks, each with a chance per second. */
  applies: z.partialRecord(EffectKey, Chance).optional(),
  /** Items that cure it (`items.json` ids), or `food` for any item of kind `food`. Time cures the rest. */
  cures: z.array(z.union([Id, z.literal('food')])),
  /** Its public physical sign, if any. */
  sign: EffectSign.optional(),
  /** Leaves a drip trail (the client's blood pass). */
  drip: z.boolean().optional(),
  gddRef: GddRef,
});
export type Effect = z.infer<typeof Effect>;

export const EffectsFile = z.strictObject({
  gddRef: GddRef,
  effects: z.record(EffectKey, Effect),
});
export type EffectsFile = z.infer<typeof EffectsFile>;
