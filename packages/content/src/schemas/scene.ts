import { z } from "zod";
import { GddRef, Id, PrefixedId, Ships, WorldId } from "./common.js";
import { NoiseKey, Profile } from "./balance.js";

/**
 * Grid legend (frozen, docs/SESSIONS.md): `#` wall, `D` door (any portal tile), `S` spawn,
 * `H` hiding spot, `B` body spot, `.` floor. `D`, `H` and `B` tiles are solid and used from an
 * orthogonally adjacent floor tile; `S` is floor. Origin top-left, x right, y down, in tiles.
 */
export const GRID_LEGEND = {
  wall: "#",
  door: "D",
  spawn: "S",
  hide: "H",
  body: "B",
  floor: ".",
} as const;

/** Scene ids of WORLD 4.3, frozen; V2 reads the same graph. */
export const SCENE_IDS = [
  "overworld",
  "tavern_bar",
  "tavern_back",
  "apoth_shop",
  "apoth_loft",
  "widow_parlour",
  "widow_bedroom",
  "forest",
  "bakery",
  "cave_entry",
  "manor_hall",
  "manor_upper",
  "barn",
  "chapel",
  "cellar",
] as const;
export type SceneId = (typeof SCENE_IDS)[number];

const X = z.number().int().nonnegative();
const Y = z.number().int().nonnegative();

export const Direction = z.enum(["n", "ne", "e", "se", "s", "sw", "w", "nw"]);

/** WORLD 4.5 portal record. `id` is `<scene prefix>.<name>` and globally unique. */
export const Portal = z.strictObject({
  id: PrefixedId,
  from: WorldId,
  x: X,
  y: Y,
  kind: z.enum(["door", "stairs", "hatch", "drop", "crawl", "gate", "forest_gate", "cave_mouth"]),
  /** Target scene and spawn; null only for a portal that ships later (boarded until then). */
  to: WorldId.nullable(),
  toSpawn: WorldId.nullable(),
  oneWay: z.boolean(),
  lock: z.strictObject({ keyId: Id }).nullable(),
  window: z.enum(["night", "lowTide"]).nullable(),
  /** Key into balance.json `noise`, emitted on use; null for a silent crossing. */
  noise: NoiseKey.nullable(),
  /** Metres gained crossing the portal (negative going down). */
  elevationDelta: z.number(),
  /** Below this profile the door renders boarded and the portal rejects with CLOSED (428). */
  minProfile: Profile,
  ships: Ships,
});
export type Portal = z.infer<typeof Portal>;

/** Spawn ids are local to their scene and referenced as `<scene>.<spawn>`. */
export const Spawn = z.strictObject({
  id: WorldId,
  x: X,
  y: Y,
  z: z.number(),
  facing: Direction,
});
export type Spawn = z.infer<typeof Spawn>;

/** Hiding spots hold one player; body spots hide a dragged body (GDD 3.7). */
export const Spot = z.strictObject({
  id: PrefixedId,
  kind: z.enum(["hide", "body"]),
  variant: z.string().regex(/^[a-z][A-Za-z]*$/),
  x: X,
  y: Y,
  /** A crawlspace: only the Child fits, and adults cannot Check it. */
  childOnly: z.boolean(),
});
export type Spot = z.infer<typeof Spot>;

/** Interactable or landmark objects (the `interact` layer of a later Tiled export). */
export const Prop = z.strictObject({
  id: PrefixedId,
  kind: z.string().regex(/^[a-z][A-Za-z]*$/),
  x: X,
  y: Y,
  /** Item picked up here or required to open it. */
  item: Id.optional(),
  /** Present only at these profiles (default: every profile the scene is open at). */
  profiles: z.array(Profile).optional(),
  ships: Ships.optional(),
});
export type Prop = z.infer<typeof Prop>;

/** Floor tiles that are solid below `minProfile` (district gates on the overworld). */
export const Gate = z.strictObject({
  id: PrefixedId,
  minProfile: Profile,
  x: X,
  y: Y,
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});
export type Gate = z.infer<typeof Gate>;

export const Path = z.strictObject({
  id: PrefixedId,
  kind: z.literal("wolfLoop"),
  /** Corners of a closed loop joined by straight orthogonal runs of floor. */
  points: z.array(z.strictObject({ x: X, y: Y })).min(4),
});
export type Path = z.infer<typeof Path>;

export const Scene = z.strictObject({
  id: WorldId,
  /** Two-letter prefix of every portal, spot, prop, gate and path id in this scene. */
  prefix: z.string().regex(/^[a-z]{2}$/),
  name: z.string().min(1),
  /** Visibility, Ledger and noise scope; equals `id` in V1 (WORLD 4.3). */
  zoneId: WorldId,
  profile: Profile,
  kind: z.enum(["exterior", "interior"]),
  size: z.strictObject({ w: z.number().int().positive(), h: z.number().int().positive() }),
  /** Ambient light radius in tiles where the scene is otherwise dark (cave moss, cellar). */
  ambientLightTiles: z.number().positive().optional(),
  /** No footstep noise inside (the chapel). */
  silent: z.boolean().optional(),
  /** Noise emitted to the scene when anyone enters (the barn goat). */
  entryNoise: NoiseKey.optional(),
  notes: z.string(),
  worldRef: GddRef,
  portals: z.array(Portal),
  spawns: z.array(Spawn).min(1),
  spots: z.array(Spot),
  props: z.array(Prop),
  gates: z.array(Gate),
  paths: z.array(Path),
  grid: z.array(z.string().regex(/^[#DSHB.]+$/, "grid rows use only # D S H B .")),
});
export type Scene = z.infer<typeof Scene>;
