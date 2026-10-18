import { z } from 'zod';
import { GddRef, Id, PaletteToken, PrefixedId, Ships, WorldId } from './common.js';
import { NoiseKey, Profile } from './balance.js';

/**
 * Grid legend (frozen, docs/SESSIONS.md): `#` wall, `D` door (any portal tile), `S` spawn,
 * `H` hiding spot, `B` body spot, `.` floor. `D`, `H` and `B` tiles are solid and used from an
 * orthogonally adjacent floor tile; `S` is floor. Origin top-left, x right, y down, in tiles.
 */
export const GRID_LEGEND = {
  wall: '#',
  door: 'D',
  spawn: 'S',
  hide: 'H',
  body: 'B',
  floor: '.',
} as const;

/**
 * Scene ids of WORLD 4.3 and 4.10. Append-only: a scene's index is its wire id (`Player.sceneId` is a u8,
 * 255 is the quick-mode loft), so the first 15 entries never move (a test pins them). A new scene's id goes at
 * the end in the same pull request as its file (GDD 3.13). V2 reads the same graph.
 */
export const SCENE_IDS = [
  'overworld',
  'tavern_bar',
  'tavern_back',
  'apoth_shop',
  'apoth_loft',
  'widow_parlour',
  'widow_bedroom',
  'forest',
  'bakery',
  'cave_entry',
  'manor_hall',
  'manor_upper',
  'barn',
  'chapel',
  'cellar',
  // Round 5 (A50): Hollowmere's new forest and cave, then Blackpine.
  'forest_deep',
  'cave_gallery',
  'bp_camp',
  'bp_lodge',
  'bp_mill',
  'bp_woods',
  'bp_mine',
  'bp_office',
  'bp_smithy',
  'bp_deep',
] as const;
export type SceneId = (typeof SCENE_IDS)[number];

const X = z.number().int().nonnegative();
const Y = z.number().int().nonnegative();

export const Direction = z.enum(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);

/** GDD 3.13: picks the default ground and walls, the sound bed and the look; a `cave` scene is always `dark`. */
export const Biome = z.enum(['village', 'house', 'forest', 'cave']);
export type Biome = z.infer<typeof Biome>;

/**
 * Parts of the day a light burns in or a spawner wakes in (GDD 3.13): `day` is grace, day and immunity;
 * `dusk` is dusk and dawn; `night` is night and the Final Night.
 */
export const DayPart = z.enum(['day', 'dusk', 'night']);
export type DayPart = z.infer<typeof DayPart>;

/**
 * Material legend (GDD 3.13, SPRITES 10.12): one character per tile in `material`. Floor characters stand on
 * `.` and `S` grid tiles; solid characters on `#`; either on `D`, `H` and `B` (the ground under the object, or
 * the wall it is set in). `u` is walkable but blocks sight once dark visibility ships (M5b).
 */
export const FLOOR_MATERIALS = {
  g: 'grass',
  l: 'litter',
  m: 'moss',
  p: 'path',
  d: 'earth',
  c: 'cobble',
  f: 'flags',
  w: 'planks',
  r: 'rock',
  s: 'shingle',
  '~': 'shallows',
  u: 'brush',
  '=': 'rails',
} as const;
/** `O` is flat and drawn in the ground tileset; `P` is drawn by the building or prop that covers the tile. */
export const SOLID_MATERIALS = {
  O: 'water',
  W: 'wall',
  T: 'tree',
  R: 'boulder',
  X: 'cliff',
  F: 'fence',
  K: 'stack',
  P: 'covered',
} as const;
/** Row order of an isometric ground tileset (SPRITES 10.12): the floor materials, then deep water. */
export const GROUND_ROWS = 'glmpdcfwrs~u=O';
/** Blend rank, lowest first: a higher-ranked ground lays its fringe over a lower-ranked neighbour. */
export const BLEND_RANK = 'O~r=wfcdpslmgu';
/** Materials that will block sight with the server-side dark visibility of M5b. */
export const OPAQUE_MATERIALS = 'WTXPu';
export const MATERIAL_ROW = /^[glmpdcfwrs~u=OWTRXFKP]+$/;
export const DEFAULT_FLOOR: Record<Biome, keyof typeof FLOOR_MATERIALS> = {
  village: 'g',
  house: 'w',
  forest: 'l',
  cave: 'r',
};
export const DEFAULT_SOLID: Record<Biome, keyof typeof SOLID_MATERIALS> = {
  village: 'W',
  house: 'W',
  forest: 'T',
  cave: 'X',
};

/** A rectangle of whole tiles. */
export const Rect = z.strictObject({
  x: X,
  y: Y,
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});
export type Rect = z.infer<typeof Rect>;

/** WORLD 4.5 portal record. `id` is `<scene prefix>.<name>` and globally unique. */
export const Portal = z.strictObject({
  id: PrefixedId,
  from: WorldId,
  x: X,
  y: Y,
  kind: z.enum(['door', 'stairs', 'hatch', 'drop', 'crawl', 'gate', 'forest_gate', 'cave_mouth']),
  /** Target scene and spawn; null only for a portal that ships later (boarded until then). */
  to: WorldId.nullable(),
  toSpawn: WorldId.nullable(),
  oneWay: z.boolean(),
  lock: z.strictObject({ keyId: Id }).nullable(),
  window: z.enum(['night', 'lowTide']).nullable(),
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
  kind: z.enum(['hide', 'body']),
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
  /** Tiles a multi-tile prop covers (all solid, holding its anchor); its art is one slice per tile (SPRITES 10.5). */
  footprint: Rect.optional(),
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
  /** `wolfLoop` for wolves (GDD 3.6); `patrol` for any other creature's round (M5b). */
  kind: z.enum(['wolfLoop', 'patrol']),
  /** Corners of a closed loop joined by straight orthogonal runs of floor. */
  points: z.array(z.strictObject({ x: X, y: Y })).min(4),
});
export type Path = z.infer<typeof Path>;

/** A building drawn from the map's building atlas over its footprint; its doors are portals on the footprint. */
export const Building = z.strictObject({
  id: PrefixedId,
  /** Frame stem in `bld_<mapId>`: the slices are `<art>#<dx>_<dy>` (SPRITES 10.13). */
  art: Id,
  footprint: Rect,
});
export type Building = z.infer<typeof Building>;

/** A light pool cut out of the darkness layer (GDD 3.13, WORLD 4.7). */
export const Light = z.strictObject({
  id: PrefixedId,
  kind: z.enum(['lantern', 'torch', 'lamp', 'fire', 'window', 'moss', 'moon', 'shaft']),
  /** Ground centre of the pool: any tile of the scene. */
  x: X,
  y: Y,
  radiusTiles: z.number().positive().max(8),
  /** Default by kind: `moss` teal, `moon` and `shaft` moon, the rest lantern. */
  color: PaletteToken.optional(),
  /** Burns only in these parts of the day; default: always. */
  phases: z.array(DayPart).min(1).optional(),
});
export type Light = z.infer<typeof Light>;

/** Where M5b puts a resource node; read by no code in M5a. */
export const NodeSpot = z.strictObject({
  id: PrefixedId,
  /** A resource id of M5b's `resources.json`; checked against it once that file lands. */
  resource: Id,
  x: X,
  y: Y,
  /** Nodes sharing a pool are a pool the server activates part of per match (M5b). */
  pool: Id.optional(),
});
export type NodeSpot = z.infer<typeof NodeSpot>;

/** Where M5b spawns creatures; read by no code in M5a. */
export const Spawner = z.strictObject({
  id: PrefixedId,
  /** A creature id of M5b's `mobs.json`; checked against it once that file lands. */
  mob: Id,
  x: X,
  y: Y,
  /** How far its creatures stray from it, in tiles. */
  leashTiles: z.number().positive(),
  /** Awake only in these parts of the day; default: always. */
  phases: z.array(DayPart).min(1).optional(),
  /** A `paths[]` entry of the same scene that its creatures walk. */
  pathId: PrefixedId.optional(),
});
export type Spawner = z.infer<typeof Spawner>;

/** Where an M5b quest giver stands; read by no code in M5a. Quest givers are not seats. */
export const Giver = z.strictObject({
  id: PrefixedId,
  /** An NPC id of M5b's `quests.json`; checked against it once that file lands. */
  npc: Id,
  x: X,
  y: Y,
  facing: Direction,
});
export type Giver = z.infer<typeof Giver>;

export const Scene = z.strictObject({
  id: WorldId,
  /** Two-letter prefix of every object id in this scene; unique across scenes. */
  prefix: z.string().regex(/^[a-z]{2}$/),
  name: z.string().min(1),
  /** Visibility, Ledger and noise scope; equals `id` in V1 (WORLD 4.3). */
  zoneId: WorldId,
  profile: Profile,
  kind: z.enum(['exterior', 'interior']),
  /** Default: `village` for an exterior, `house` for an interior. */
  biome: Biome.optional(),
  /** Night in every phase (GDD 3.13); required on every `cave`. */
  dark: z.boolean().optional(),
  size: z.strictObject({ w: z.number().int().positive(), h: z.number().int().positive() }),
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
  buildings: z.array(Building).optional(),
  lights: z.array(Light).optional(),
  nodes: z.array(NodeSpot).optional(),
  spawners: z.array(Spawner).optional(),
  givers: z.array(Giver).optional(),
  grid: z.array(z.string().regex(/^[#DSHB.]+$/, 'grid rows use only # D S H B .')),
  /** `h` rows of `w` material characters (legend above); default: the biome's floor and solid. */
  material: z.array(z.string().regex(MATERIAL_ROW, 'material rows use the legend of GDD 3.13')).optional(),
});
export type Scene = z.infer<typeof Scene>;

export const biomeOf = (scene: Scene): Biome =>
  scene.biome ?? (scene.kind === 'exterior' ? 'village' : 'house');
export const isDarkScene = (scene: Scene): boolean => scene.dark === true;
