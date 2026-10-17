import { z } from 'zod';
import { Faction, GddRef, Id, Ships } from './common.js';

// ONUB v2 roles (GDD 3.11): the fifteen Role cards, the three teams and the ten night scenes.

/** Quick-mode act ids sent as `act.ability` (ARCHITECTURE 5.14), e.g. `onub.rob`. */
export const OnubActId = z.string().regex(/^onub\.[a-z][A-Za-z]*$/);

/** The three sides of a match. */
export const OnubTeamId = z.enum(['baker', 'mold', 'croissant']);
export type OnubTeamId = z.infer<typeof OnubTeamId>;

export const OnubTeam = z.strictObject({
  id: OnubTeamId,
  /** Shown on the role card in place of the faction (`RoleRevealPayload.teamName`). */
  name: z.string().min(1),
  /** The wire's `TeamId` for a card of this team (`RoleRevealPayload.team`, `Private.role.team`). */
  faction: Faction,
  goal: z.string().min(1),
});
export type OnubTeam = z.infer<typeof OnubTeam>;

/** A night role scene: the owner's art `onub_scene_<id>` and its caption. */
export const OnubScene = z.strictObject({ id: Id, name: z.string().min(1) });
export type OnubScene = z.infer<typeof OnubScene>;

export const OnubRole = z.strictObject({
  id: Id,
  /** The French card name with its article ("Le Chef de Cuisine"). */
  name: z.string().min(1),
  /** The English gloss printed under the name ("Executive Chef"). */
  gloss: z.string().min(1),
  team: OnubTeamId,
  /** A Mold Spore for the winners table (Le Champignon only). */
  spore: z.boolean(),
  /** The hand at prep holds the station's sabotage cards too (every Team Mold card). */
  sabotages: z.boolean(),
  /** Has a night window in `balance.onub.json` `windows`. */
  wakes: z.boolean(),
  /** Key of `scenes`: the room the role wakes in and the art on its card. */
  scene: Id,
  /** Allowed non-zero copy counts in a deck: [1, 2] for the Spore, [2] for the Commis, [1] for the rest. */
  copies: z.array(z.number().int().positive()).min(1),
  /** Every deck holds at least one copy. */
  required: z.boolean(),
  /** `dragVote`: when this final card goes in the oven, the seat it voted for goes in too (the Critique). */
  onOut: z.enum(['none', 'dragVote']),
  ships: Ships,
  /** The night act line of the role card (its goal row). */
  nightAct: z.string().min(1),
  cardText: z.string().min(1),
  gddRef: GddRef,
});
export type OnubRole = z.infer<typeof OnubRole>;

export const OnubRolesFile = z.strictObject({
  gddRef: GddRef,
  /** Printed on every quick-mode role card (`RoleRevealPayload.beware`). */
  cardLine: z.string().min(1),
  teams: z.strictObject({ baker: OnubTeam, mold: OnubTeam, croissant: OnubTeam }),
  scenes: z.record(Id, OnubScene),
  roles: z.record(Id, OnubRole),
});
export type OnubRolesFile = z.infer<typeof OnubRolesFile>;
