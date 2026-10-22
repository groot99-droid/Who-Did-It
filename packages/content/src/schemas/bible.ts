import { z } from 'zod';
import { GddRef, Id } from './common.js';

// The Bible's seams (docs/round6/bible-seams.md 1): four files that round 6 ships empty and validated, for the
// vendettas (round 7), the evolutions and the law pipeline (round 8) and the world events (round 9). Their `gddRef`
// is "3" until the round that fills a file writes its GDD section and narrows it. The shapes here are the minimum
// each round's contract document names; that round widens them in the same PR as its rules.

/** A `SimEvent.kind` of the server's `sim/events/bus.ts`, the trigger vocabulary of every file below. */
const EventKind = z.string().regex(/^[a-z][A-Za-z0-9.]*$/);

/** A trigger: an event kind and an optional filter on its data. */
const Trigger = z.strictObject({ on: EventKind, where: z.record(z.string(), z.unknown()).optional() });

export const Vendetta = z.strictObject({
  id: Id,
  /** The killer role that carries it. */
  role: Id,
  kind: z.enum(['conversion', 'sabotage', 'heist', 'contract']),
  triggers: z.array(Trigger),
  /** Event kinds the vendetta emits when it fires. */
  emits: z.array(EventKind),
});
export const VendettasFile = z.strictObject({ gddRef: GddRef, vendettas: z.record(Id, Vendetta) });
export type VendettasFile = z.infer<typeof VendettasFile>;

export const Evolution = z.strictObject({
  id: Id,
  from: Id,
  to: Id,
  when: Trigger,
  /** The seat keeps its public look when it evolves (GDD 3.17's one-tick rule otherwise). */
  keepPublicLook: z.boolean(),
});
export const EvolutionsFile = z.strictObject({ gddRef: GddRef, evolutions: z.record(Id, Evolution) });
export type EvolutionsFile = z.infer<typeof EvolutionsFile>;

export const LawStage = z.strictObject({
  /** `GameState.lawStage` value this row describes (1 or 2; 0 is the plain ejection). */
  stage: z.number().int().min(1).max(2),
  advanceOn: z.array(Trigger).min(1),
  /** The verdicts the Tribunal may return at this stage. */
  verdicts: z.array(z.enum(['release', 'exile', 'hang'])).min(1),
});
export const LawsFile = z.strictObject({ gddRef: GddRef, laws: z.record(Id, LawStage) });
export type LawsFile = z.infer<typeof LawsFile>;

/** One row of the propagation matrix: who hears what, and what it does to them. */
export const WorldEvent = z.strictObject({
  id: Id,
  trigger: Trigger,
  /** How far the news travels, in scenes along the map graph; 0 is the scene it happened in. */
  spreadScenes: z.number().int().nonnegative(),
  /** The NPC emotional state it pushes toward. */
  mood: z.enum(['calm', 'panicked', 'entranced', 'rioting']).optional(),
  emits: z.array(EventKind),
});
export const EventsFile = z.strictObject({ gddRef: GddRef, events: z.record(Id, WorldEvent) });
export type EventsFile = z.infer<typeof EventsFile>;
