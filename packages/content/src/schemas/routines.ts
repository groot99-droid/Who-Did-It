import { z } from 'zod';
import { GddRef, Id } from './common.js';
import { MapId } from './maps.js';

// NPC routines (GDD 3.12): the stations an NPC works at, keyed by prop kind only, so no frozen scene, portal, spawn,
// spot, clue or prop id appears here and a new map's props become stations by their kind (round 5, npc/data.md 1).

/** A prop kind, the same pattern as `Prop.kind` (schemas/scene.ts). */
const PropKind = z.string().regex(/^[a-z][A-Za-z]*$/);

/** The two phase classes of an NPC routine (GDD 3.12): the day weights and stations, or the night ones. */
export const RoutinePhaseClass = z.enum(['day', 'night']);
export type RoutinePhaseClass = z.infer<typeof RoutinePhaseClass>;

/** The main-mode world phases, by their `Phase` key (packages/shared/src/schema/index.ts). */
export const RoutineWorldPhase = z.enum(['grace', 'day', 'dusk', 'night', 'immunity', 'finalNight']);
export type RoutineWorldPhase = z.infer<typeof RoutineWorldPhase>;

/** Mirrors the protocol's `HoldAction` (packages/shared/src/protocol/index.ts); 5H's server code assigns it to one. */
export const RoutineHold = z.enum(['drag', 'collect', 'task', 'inspect', 'autopsy']);
export type RoutineHold = z.infer<typeof RoutineHold>;

export const RoutineActivity = z.strictObject({
  /** The phase classes in which a station of this activity qualifies. */
  phases: z.array(RoutinePhaseClass).min(1),
  kinds: z.array(PropKind).min(1),
});
export type RoutineActivity = z.infer<typeof RoutineActivity>;

/**
 * Round 8 (GDD 3.24, Session 8E): one kind of ambient townsfolk figure. `stations` are prop kinds in route order (an
 * empty list means any station of the map, drawn from the figure's `townsfolk` stream); a `named` figure walks once
 * per map it lists (the Company Clerk, the Tallyman); a `fixed` figure stands one per such prop (a stallholder).
 * `look` is a `villager` look id (seams.md 2: never a card's look). A kind no map holds yet is inert.
 */
export const TownsfolkRow = z.strictObject({
  maps: z.array(MapId).min(1).optional(),
  look: z.string().regex(/^villager/),
  named: z.boolean(),
  fixed: z.boolean(),
  stations: z.array(PropKind),
});
export type TownsfolkRow = z.infer<typeof TownsfolkRow>;

export const RoutinesFile = z.strictObject({
  gddRef: GddRef,
  phaseClasses: z.strictObject({
    day: z.array(RoutineWorldPhase).min(1),
    night: z.array(RoutineWorldPhase).min(1),
  }),
  /** Activity id -> its classes and prop kinds (work, social, rest in M5a; round 6 may add more). */
  activities: z.record(Id, RoutineActivity),
  /** Prop kind -> the hold a human can start at such a prop; an NPC works with that hold only there. */
  holds: z.record(PropKind, RoutineHold),
  /** Prop kinds that are never stations. */
  ignore: z.array(PropKind),
  /** Prop kinds that light an exterior scene at night. */
  lightKinds: z.array(PropKind),
  /** Round 8 (GDD 3.24): the ambient townsfolk kinds, by figure kind id. */
  townsfolk: z.record(Id, TownsfolkRow),
});
export type RoutinesFile = z.infer<typeof RoutinesFile>;
