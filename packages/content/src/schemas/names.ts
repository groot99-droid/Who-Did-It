import { z } from 'zod';
import { GddRef } from './common.js';

/**
 * The NPC name pool (GDD 3.12): human-style names an NPC seat takes so nothing on the roster marks
 * it. `validate.ts` checks each name against `balance.lobby.nameMin..nameMax`, uniqueness and the
 * role tokens; the pool holds at least `players.max` names.
 */
export const NamesFile = z.strictObject({
  gddRef: GddRef,
  pool: z.array(z.string().min(1)).min(1),
});
export type NamesFile = z.infer<typeof NamesFile>;
