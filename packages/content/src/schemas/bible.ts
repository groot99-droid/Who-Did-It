import { z } from 'zod';
import { GddRef, Id } from './common.js';
import { MapId } from './maps.js';
import { SCENE_IDS } from './scene.js';

// The Bible's seams (docs/round6/bible-seams.md 1): four files that round 6 ships empty and validated, for the
// vendettas (round 7), the evolutions and the law pipeline (round 8) and the world events (round 9). Their `gddRef`
// is "3" until the round that fills a file writes its GDD section and narrows it. The shapes here are the minimum
// each round's contract document names; that round widens them in the same PR as its rules.

/** A `SimEvent.kind` of the server's `sim/events/bus.ts`, the trigger vocabulary of every file below. */
const EventKind = z.string().regex(/^[a-z][A-Za-z0-9.]*$/);

/** A trigger: an event kind and an optional filter on its data. */
const Trigger = z.strictObject({ on: EventKind, where: z.record(z.string(), z.unknown()).optional() });

/**
 * A Killer card's vendetta (round 7, GDD 3.20; docs/round7/vendettas.md 2): drawn at the deal for a seat holding
 * `role`, on the `vendetta` stream keyed by seat, among the rows whose conditions the match meets. `triggers` are the
 * bus kinds it listens to (the conditions it watches each tick are GDD 3.20's), `emits` the kinds it sends, and
 * `fires` the one of them that is its consequence, sent at most once per match.
 */
export const Vendetta = z.strictObject({
  id: Id,
  /** The killer role that carries it. */
  role: Id,
  kind: z.enum(['conversion', 'sabotage', 'heist', 'contract']),
  /** Drawn only on these maps (default: every map). */
  maps: z.array(MapId).min(1).optional(),
  /** Drawn only when a seat is dealt this card (the Zealot needs a Vicar). */
  needsCard: Id.optional(),
  /** Drawn only when this scene is open at the party's profile (the Bandit's strongbox). */
  needsScene: z.enum(SCENE_IDS).optional(),
  triggers: z.array(Trigger),
  /** Event kinds the vendetta emits, each `vendetta.<kind>.<step>`. */
  emits: z.array(EventKind).min(1),
  /** The emit that is its consequence: at most once per match, only for its holder. */
  fires: EventKind,
});
export type Vendetta = z.infer<typeof Vendetta>;
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
/**
 * Round 10, B2 (GDD 3.31, UI 14.46): the Constables' briefing lines. `{clue}` and `{scene}` in both, `{trait}` in
 * `withTrait`; D9's Constable tips read them here.
 */
export const BriefingLines = z.strictObject({
  line: z.string().includes('{clue}').includes('{scene}'),
  withTrait: z.string().includes('{clue}').includes('{scene}').includes('{trait}'),
});
export const LawsFile = z.strictObject({
  gddRef: GddRef,
  laws: z.record(Id, LawStage),
  briefing: BriefingLines.optional(),
});
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
