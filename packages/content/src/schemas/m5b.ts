import { z } from 'zod';
import { GddRef, Id, LookId, Seconds, Tiles } from './common.js';
import { ToolTag } from './interactions.js';

// M5b content (GDD 3.14 to 3.16, round 6, Session 6E; docs/round6/m5b-data.md 1): resources, recipes, mobs, quests and
// the main-mode mini-games. Pre-seeded by 6Z as empty records with these shapes; 6E fills the rows and may widen a
// shape in the same PR as its GDD text. Cross-references (scene nodes, spawners, givers, items, prop kinds) are
// checked by `checkM5b` in validate.ts.

/** A prop kind, the same pattern as `Prop.kind` (schemas/scene.ts). */
const PropKind = z.string().regex(/^[a-z][A-Za-z]*$/);
const Qty = z.number().int().positive();
/** A manifest key of the sprite atlases (SPRITES.md), lowercase with underscores. */
const SpriteKey = z.string().regex(/^[a-z][a-z0-9_]*$/);

export const Resource = z.strictObject({
  id: Id,
  name: z.string().min(1),
  /** The gather hold, in seconds. */
  gatherS: Seconds,
  /** Units a gather yields. */
  yield: Qty,
  respawnS: Seconds,
  /** An item the gatherer must hold (a spade for ore), or none. */
  tool: Id.optional(),
  /** Round 10 (A11): a held item with this capability tag cuts the gather hold to `gatherS` (bare hands still gather). */
  fastTool: z.strictObject({ tag: ToolTag, gatherS: Seconds }).optional(),
  sprite: SpriteKey,
});
export type Resource = z.infer<typeof Resource>;

export const ResourcesFile = z.strictObject({ gddRef: GddRef, resources: z.record(Id, Resource) });
export type ResourcesFile = z.infer<typeof ResourcesFile>;

export const Recipe = z.strictObject({
  id: Id,
  /** The item made and how many. */
  out: Id,
  qty: Qty,
  in: z.array(z.strictObject({ item: Id, qty: Qty })).min(1),
  /** The prop kind of the station the craft hold needs, or null for anywhere. */
  station: PropKind.nullable(),
  craftS: Seconds,
  /**
   * Round 10 (A13): rows of item ids (null = an empty cell) the crafting grid must show, as in Minecraft: the pattern
   * is matched wherever it sits in the grid, and mirrored. Absent = shapeless: the grid matches the set of inputs.
   */
  shape: z.array(z.array(Id.nullable()).min(1)).min(1).optional(),
  /** Round 10, D4a: the maps this recipe is made on (its stations stand only there); absent = every map. */
  maps: z.array(Id).min(1).optional(),
});
export type Recipe = z.infer<typeof Recipe>;

export const RecipesFile = z.strictObject({ gddRef: GddRef, recipes: z.record(Id, Recipe) });
export type RecipesFile = z.infer<typeof RecipesFile>;

export const MobDef = z.strictObject({
  id: Id,
  name: z.string().min(1),
  /** Hit points (round 8, 8G): fists, bolts and lights take them off; at zero it dies (GDD 3.15, body.md 4). */
  hp: z.number().int().positive(),
  speedTilesPerS: z.number().positive(),
  /** How far it notices a seat, and how close a light must be for it to flee. */
  senseTiles: Tiles,
  fleeLightTiles: Tiles,
  /**
   * Seconds in reach before its attack lands; `kills` whether zero health from it is a death (`wolf` for the wolf,
   * `creature` for the rest; GDD 3.22, round 8: every creature kills).
   */
  attackS: Seconds,
  kills: z.boolean(),
  sprite: SpriteKey,
  /** Round 8 (GDD 3.22, Session 8A): the health its attack takes and the effects it may apply (`hp` above is 8G's). */
  dmg: z.number().int().positive(),
  effects: z.record(z.string().regex(/^[a-z][A-Za-z0-9]*$/), z.number().min(0).max(1)),
});
export type MobDef = z.infer<typeof MobDef>;

export const MobsFile = z.strictObject({ gddRef: GddRef, mobs: z.record(Id, MobDef) });
export type MobsFile = z.infer<typeof MobsFile>;

/** A quest giver: a scene static with a look, never a seat (GDD 3.16). */
export const QuestNpc = z.strictObject({ id: Id, name: z.string().min(1), look: LookId });
export type QuestNpc = z.infer<typeof QuestNpc>;

/** `contract` is the round-7 vendetta seam (docs/round6/bible-seams.md 2.1); the server refuses it in round 6. */
export const QuestKind = z.enum(['fetch', 'contract']);

export const Quest = z.strictObject({
  id: Id,
  giver: Id,
  kind: QuestKind,
  wants: z.array(z.strictObject({ item: Id, qty: Qty })).min(1),
  reward: z.array(z.strictObject({ item: Id, qty: Qty })),
  /** Round 8 (GDD 3.23, 8C): the Scrip the giver pays on the turn-in, beside the items (0 when absent). */
  scrip: z.number().int().nonnegative().optional(),
  /** A copy id of the client's `ui/copy/m5b.ts` for the giver's lines. */
  copyId: z.string().regex(/^[a-z][A-Za-z0-9.]*$/),
});
export type Quest = z.infer<typeof Quest>;

export const QuestsFile = z.strictObject({
  gddRef: GddRef,
  npcs: z.record(Id, QuestNpc),
  quests: z.record(Id, Quest),
});
export type QuestsFile = z.infer<typeof QuestsFile>;

/** Mirrors the protocol's `MinigameKind`: the five station mini-games (GDD 3.16; `tap` is round 7's, 7M). */
export const MinigameKind = z.enum(['crates', 'pour', 'slide', 'stoke', 'tap']);

export const MinigameDef = z.strictObject({
  id: Id,
  kind: MinigameKind,
  /** The `tasks.json` station task it plays for. */
  task: Id,
  difficulty: z.number().int().min(1).max(5),
  /** Seconds before the Done control appears, as GDD 3.16 sets it. */
  assistS: Seconds,
  /**
   * How the widget draws its station (7M PR 5, A151 (3)): the station's own object and the pieces the hands move,
   * one per step (the last repeats). Labels stand in for atlas frames; a skin changes no rule.
   */
  skin: z.strictObject({
    station: z.string().min(1).max(16),
    pieces: z.array(z.string().min(1).max(12)).min(1),
  }),
});
export type MinigameDef = z.infer<typeof MinigameDef>;

export const MinigamesFile = z.strictObject({ gddRef: GddRef, minigames: z.record(Id, MinigameDef) });
export type MinigamesFile = z.infer<typeof MinigamesFile>;
