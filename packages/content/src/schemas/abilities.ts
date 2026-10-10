import { z } from 'zod';
import { GddRef, Id, Seconds, Ships, Tiles } from './common.js';
import { NoiseKey } from './balance.js';

/**
 * Every verb that carries a number: role abilities shown on a card, item uses (an item's
 * `use` points here) and universal verbs anyone can perform.
 */
export const Ability = z.strictObject({
  id: Id,
  name: z.string().min(1),
  scope: z.enum(['role', 'item', 'universal']),
  /** `hold` is a start/stop command re-validated every tick (`act.hold`). */
  kind: z.enum(['active', 'hold', 'passive']),
  target: z.enum(['none', 'self', 'player', 'body', 'clue', 'door', 'spot', 'ground', 'water']),
  cooldownS: Seconds.optional(),
  /** Time the actor must hold or channel before it resolves; 0 is instant. */
  castS: Seconds.optional(),
  rangeTiles: Tiles.optional(),
  /** Key into balance.json `noise`. */
  noise: NoiseKey.optional(),
  /** Item that must be in the inventory. */
  requires: Id.optional(),
  /** Item consumed per use (one charge). */
  consumes: Id.optional(),
  /** Uses per match when not limited by an item's quantity. */
  usesPerMatch: z.number().int().positive().optional(),
  /** Only enabled at or above this player count. */
  minPlayers: z.number().int().min(4).max(10).optional(),
  /** Named numbers specific to this verb, in seconds, tiles or factors as the name says. */
  params: z.record(z.string().regex(/^[a-z][A-Za-z0-9]*$/), z.number()).optional(),
  effect: z.string().min(1),
  ships: Ships,
  gddRef: GddRef,
});
export type Ability = z.infer<typeof Ability>;

export const AbilitiesFile = z.strictObject({
  gddRef: GddRef,
  abilities: z.record(Id, Ability),
});
export type AbilitiesFile = z.infer<typeof AbilitiesFile>;
