# Schemas, maps and scene outlines (round 5)

> For Session 5J (maps, the exporter, map choice); 5I, 5K and 5L read sections 2, 4 and 8, and 5H reads section 9.1.
> The two pre-seed rows of section 1 have landed. Builds on DECISIONS A49 and A50 and on `docs/GDD.md` 3.13,
> `docs/WORLD.md` 4.2-4.10 and `docs/SPRITES.md` section 10, the projection contract (the `@wdi/shared/iso` module,
> the tilemap the exporter writes, the manifest keys and the budgets).
>
> **How this was checked.**
>
> - **The pre-seed** (section 1, first two rows) ran on a scratch worktree of 265bda9. `content-world.patch`
>   was the first row (content and the shared iso module) and `server-mapsites.patch` the second row (section 9.1),
>   applied on top of it; both patches stay with the orchestrator.
>   With both applied: `@wdi/shared` typecheck clean and 70 of 70 tests
>   (the 9 of `iso.test.ts` among them); `@wdi/content` typecheck clean and 90 of 90 tests (13 new in
>   `world.test.ts`), data lint clean; `@wdi/server` typecheck clean and 147 tests passed, 2 skipped (1 new in
>   `mapSites.test.ts`); `@wdi/client` typecheck clean; `pnpm grid:export --check` clean (no tilemap or nav
>   changes). The content patch alone also passes the shared, content and server checks.
> - **Landed (2026-10-17).** Both patches applied with `git apply` (no three-way merge) on the round-5 pre-seed tree,
>   the client lines of the second row by hand; nothing staged. The server and content code matches sections 2, 3, 4,
>   5.4 and 9.1 and SPRITES 10.2 as written; the client differs as section 1's second row says. On the tree after
>   the step: `@wdi/shared` 76 of 76 tests (9 in `iso.test.ts`); `@wdi/content` 93 of 93 (13 in `world.test.ts`),
>   data lint clean; `@wdi/server` 153 passed and 2 skipped (20 files); `@wdi/client` 146 of 146 (15 files);
>   `tools/grid` 10, `tools/sprites` 34, `tools/bots` 7; `pnpm grid:export --check` 15 scenes, none stale; eslint,
>   prettier and the root typecheck clean. Confirmed: `metrics.json` `characterHeadsTall` 5 (pinned in
>   `content.test.ts` with 112 and 1.75); `MAP_IDS = ['hollowmere']` and `hollowmere.json` lists the 15 current
>   scenes; every scene has `biome` and `dark`, and only `apoth_loft`, `cave_entry` and `cellar` are dark;
>   `ambientLightTiles` is gone from the schema and the data; `@wdi/shared` exports `./iso` and
>   `MAX_SILHOUETTE_PX = 112`.
> - **5J's scenes and maps** (sections 3, 6.2, 8 and the 5J cases of section 10) ran earlier in a scratch copy of
>   `packages/content` (working tree of 2026-10-17, 19:00) with stub scenes painted from the appendix: `tsc`
>   clean and 90 of 90 content tests. The Fenwood and the Flooded Gallery have since moved to Medium (F4), which
>   changes only their `profile` and the `minProfile` of the portals that touch them (section 7 and 8.1-8.2).
>
> This document is the authority; the patches were a convenience.

## 1. What lands where, and in what order

| Step | Who | Files | What |
|---|---|---|---|
| Pre-seed (landed), content and shared | orchestrator | `schemas/scene.ts` (section 2, with `SCENE_IDS` still 15 long), new `schemas/maps.ts` (with `MAP_IDS = ['hollowmere']`), new `validateWorld.ts` and its two calls in `validate.ts`, the `index.ts` map plumbing (one map file, no new scene), `metrics.json` (with `characterHeadsTall` 5) and `schemas/metrics.ts` (section 4), `maps/hollowmere.json` listing the 15 current scenes, `biome` and `dark` on the 15 current scenes (section 7, first table: the cave and forest rules need them), `ambientLightTiles` removed from `cave_entry.json` and `cellar.json` in the same commit (the schema is strict), the pre-seed `test/world.test.ts` and the `content.test.ts` pins (section 10). In `@wdi/shared`: `src/iso.ts` and `test/iso.test.ts` (SPRITES 10.2), `"./iso": "./src/iso.ts"` in `package.json` `exports`, `export * from './iso'` in `src/index.ts`, and `MAX_SILHOUETTE_PX = 112` in `src/metrics.ts` | Every type, rule and number later sessions build on, with the content still valid |
| Pre-seed (landed), server and client | orchestrator | new `apps/server/src/sim/MapSites.ts` and `test/mapSites.test.ts`; every map site of section 9.1 routed through it; `lobby.settings` gains `map?: string` in `packages/shared/src/protocol/index.ts`, with `docs/PROTOCOL.md` regenerated. In `apps/client`: new `src/ui/lobby/MapPicker.ts` exporting `mountMapPicker(root: HTMLElement, net: NetworkService): { update(s: LobbySnapshot): void; destroy(): void }` (a stub that renders nothing), mounted by `ui/Lobby.ts` (`:136`) in its own slot `<div data-testid="lobby-map">` at the end of the settings block, just before the deck editor, with `update` and `destroy` called from there; the slot is hidden in the quick mode (the exported `showsMapRow(mode)`) and while it is empty, so the stub adds no gap; `LobbySettings` (`net/protocol.ts`) gains `map: string` read from `state.settings.map`, an empty value falling back to the client's own `DEFAULT_MAP_ID = 'hollowmere'` (`net/protocol.ts`; the client reads the data files, not the content module, and a test pins it to `DEFAULT_MAP`); `NetworkService` and `net/mock.ts` gain `setMap(mapId: string)`, sending `lobby.settings {map}` (the mock accepts it from the leader only, in the lobby, and leaves the check against `MAP_IDS` to the server, 5J). No e2e test: the client unit tests run without a DOM, so the quick-mode hiding is tested through `showsMapRow` | Every place the server takes from the map, in one 5J-owned file, with Hollowmere's values in every room |
| 5J PR 1 | 5J | `forest.json`, `cave_entry.json`, `overworld.json`, `tavern_bar.json`, `apoth_shop.json`, `bakery.json`, new `forest_deep.json` and `cave_gallery.json` with their navs (both Medium, F4), `SCENE_IDS` +2, their imports in `index.ts` and `nav.ts`, `maps/hollowmere.json` +2 scenes, `test/scenes.test.ts` | Hollowmere's forest and cave, the door moves, buildings, lights and materials |
| 5J PR 2 (and 3, split by data file) | 5J | the 8 `bp_*` scenes and navs, `SCENE_IDS` +8, their imports in `index.ts` and `nav.ts`, `MAP_IDS` +`blackpine`, `maps/blackpine.json` and its import, the Blackpine cases of `test/world.test.ts` | Blackpine |
| 5J PR 4 | 5J | `tools/grid/**` | The isometric exporter (SPRITES 10.12) |
| 5J PR 5 | 5J | the bodies of `sim/MapSites.ts`, `handleSettings`'s map branch in `rooms/handlers/lobby.ts`, the scene creation in `PartyRoom`, `ui/lobby/MapPicker.ts`, the server tests of section 10 | Map choice (section 9.2) |
| 5J, with each scene PR | 5J | `material` and `lights` of the 11 untouched old interiors | Every scene gets a material layer in round 5 |

`SCENE_IDS` grows only together with the scene files, because `parseScenes` reads one file per id. Every append
goes at the end, in the order of section 2. `MAP_IDS` grows the same way with the map files.

## 2. `packages/content/src/schemas/scene.ts` (whole file)

What changes against today's file (the block is the pre-seed's file):

- `SCENE_IDS` keeps its 15 ids in the pre-seed. 5J appends 10 at the end, each in the pull request of its file
  (section 1), under the comment `// Round 5 (A50): Hollowmere's new forest and cave, then Blackpine.`:
  `forest_deep`, `cave_gallery` (PR 1), then `bp_camp`, `bp_lodge`, `bp_mill`, `bp_woods`, `bp_mine`,
  `bp_office`, `bp_smithy`, `bp_deep` (PR 2).
- New exports: `Biome`, `DayPart`, the material tables, `Rect`, `Building`, `Light`, `NodeSpot`, `Spawner`,
  `Giver`, `biomeOf` and `isDarkScene`.
- `Prop` gains an optional `footprint`, and `Path.kind` widens to `wolfLoop | patrol`.
- `Scene` gains `biome`, `dark`, `buildings`, `lights`, `nodes`, `spawners`, `givers` and `material`, all optional.
- `ambientLightTiles` is removed: no code reads it, and `lights` replaces it in `cave_entry` and `cellar`.

```ts
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
```

**Material legend** (also GDD 3.13 and SPRITES 10.12). The material characters mean:

| Char | Material | Walkable | Drawn as | Opaque from M5b |
|---|---|---|---|---|
| `g` | grass | yes | ground | no |
| `l` | litter (forest floor) | yes | ground | no |
| `m` | moss | yes | ground | no |
| `p` | path (dirt track) | yes | ground | no |
| `d` | earth (yards, mine floors) | yes | ground | no |
| `c` | cobble | yes | ground | no |
| `f` | flags (stone floor) | yes | ground | no |
| `w` | planks (floorboards, boardwalks, mine planking) | yes | ground | no |
| `r` | rock (cave floor) | yes | ground | no |
| `s` | shingle (river and shore) | yes | ground | no |
| `~` | shallows (walked at the normal speed in M5a) | yes | ground | no |
| `u` | brush | yes | ground | **yes** |
| `=` | rails on earth | yes | ground | no |
| `O` | deep water | no | ground (flat) | no |
| `W` | wall | no | kit block: full, half or sill | yes |
| `T` | tree | no | kit tree: full or stump | yes |
| `R` | boulder | no | kit block | no |
| `X` | cliff, rock face | no | kit block: full, half or ledge | yes |
| `F` | fence | no | kit block | no |
| `K` | stack (crates, log piles, counters) | no | kit block | no |
| `P` | covered | no | nothing: its building or prop draws it | yes |

A `#` tile holding a prop anchor, or inside a building or prop footprint, is `P`; no other tile is. Under a `D`, `H`
or `B` tile any character is allowed. A floor character there is drawn as the ground under the object; a solid
character picks the wall kit that the door frame or niche is cut into.

**Biome defaults.** A scene without `material`, or the ground under a solid tile, takes its biome's defaults:

| Biome | Floor | Solid |
|---|---|---|
| `village` | `g` | `W` |
| `house` | `w` | `W` |
| `forest` | `l` | `T` |
| `cave` | `r` | `X` |

**Light kinds** and their default colours: `lantern`, `torch`, `lamp`, `fire` and `window` are `lantern`; `moss`
is `teal`; `moon` and `shaft` are `moon`. Torch and fire flicker. `phases`: `day` covers grace, day and immunity;
`dusk` covers dusk and dawn; `night` covers night and the Final Night.

**Object id forms:**

| Object | Id form |
|---|---|
| Buildings | `<p>.bld_<name>` |
| Lights | `<p>.lt_<name>` |
| Nodes | `<p>.nd_<name>` |
| Spawners | `<p>.sp_<name>` |
| Givers | `<p>.gv_<name>` |

All of them share the scene's object-id space with spots, props, gates and paths.

**M5b placeholders.** `resource`, `mob` and `npc` are free camelCase ids in M5a; M5b checks them against its
`resources.json`, `mobs.json` and `quests.json` when those land. The ids used here are:

| Field | Ids |
|---|---|
| `resource` | `timber`, `resin`, `stone`, `tinOre`, `herb`, `mushroom` |
| `mob` | `wolf`, `boar`, `bat`, `rat` |
| `npc` | `moll`, `foreman`, `collier`, `smith` |

## 3. `packages/content/src/schemas/maps.ts` (new) and the content index

The block is the pre-seed's file. 5J PR 2 appends `'blackpine'` to `MAP_IDS` with `maps/blackpine.json`.

```ts
import { z } from 'zod';
import { GddRef, PrefixedId } from './common.js';
import { SCENE_IDS } from './scene.js';

/**
 * Map ids in lobby order, append-only (WORLD 4.3); `Settings.map` holds one of them. A new map's id goes at the
 * end in the same pull request as its file.
 */
export const MAP_IDS = ['hollowmere'] as const;
export const MapId = z.enum(MAP_IDS);
export type MapId = z.infer<typeof MapId>;
/** `Settings.map` of a new party (the schema default, GDD 3.13). */
export const DEFAULT_MAP: MapId = 'hollowmere';

const SceneIdEnum = z.enum(SCENE_IDS);

/** A spawn as `<scene id>.<spawn id>`, e.g. `overworld.square_0`. */
export const SpawnRef = z
  .string()
  .regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, 'spawn refs look like `overworld.square_0`');

/** GDD 3.13: a closed graph of scenes the leader picks in the lobby. */
export const MapFile = z.strictObject({
  id: MapId,
  name: z.string().min(1).max(24),
  /** One line under the name in the lobby's map row. */
  blurb: z.string().min(1).max(120),
  /** Modes the map is offered in. The quick mode does not walk, so the M5a maps list only `main`. */
  modes: z.array(z.enum(['main', 'onub'])).min(1),
  /** Art set of the map's ground and walls: `iso_ground_<theme>` and `iso_kit_<theme>` (SPRITES 10.13). */
  theme: z.enum(['harbour', 'timber']),
  scenes: z.array(SceneIdEnum).min(1),
  /** The exterior with the Emergency Bell, open at every party size. */
  hub: SceneIdEnum,
  /** First placement spreads the seats over these in seat order (M3); at least `players.max`. */
  startSpawns: z.array(SpawnRef).min(1),
  /** Everyone is spread over these when a meeting ends; at least `players.max`. */
  meetingSpawns: z.array(SpawnRef).min(1),
  /** Prop ids on the hub: the Emergency Bell, the grace-phase teaching clue and the kit chest. */
  bell: PrefixedId,
  teachingClue: PrefixedId,
  kitChest: PrefixedId,
  /** Manifest key of the lobby thumbnail (`type: image`). */
  thumbnail: z.string().regex(/^thumb_[a-z]+$/),
  worldRef: GddRef,
  gddRef: GddRef,
});
export type MapFile = z.infer<typeof MapFile>;
```

**`index.ts` changes:**

- The pre-seed imports `maps/hollowmere.json` into `mapJson: Record<MapId, unknown>`. 5J adds each new scene
  file to `sceneJson` with its id, and `maps/blackpine.json` to `mapJson` with its map id.
- `export * from './schemas/maps.js'`.
- Parse the maps into `content.maps` (`parseMaps`, one `MapFile.parse` per id of `MAP_IDS`); `parseContent` now
  returns `Omit<Content, 'scenes' | 'maps'>`.
- Export `maps` beside `scenes`.
- Add two helpers:

```ts
const sceneMap = new Map<SceneId, MapId>(
  MAP_IDS.flatMap((id) => maps[id].scenes.map((s) => [s, id] as const)),
);

/** The map a scene belongs to (every scene belongs to exactly one, GDD 3.13). */
export function mapOf(sceneId: SceneId): MapId {
  const id = sceneMap.get(sceneId);
  if (id === undefined) throw new Error(`scene ${sceneId} belongs to no map`);
  return id;
}

/** A map id from `Settings.map`, or the default map when the value is not one (GDD 3.13). */
export function mapIdOf(value: string): MapId {
  return (MAP_IDS as readonly string[]).includes(value) ? (value as MapId) : DEFAULT_MAP;
}
```

**`nav.ts`** is untouched by the pre-seed. 5J imports one `<id>.nav.json` per new scene into `navJson`. The nav
format stays at version 1 (64 px tiles, `solid` and `gates`); `opaque` arrives with the dark visibility of M5b.

## 4. `metrics.json` and `schemas/metrics.ts`

The `camera` block now describes the one isometric camera. Ground tiles are rendered by that camera, so
`groundTileTiltXDeg` is 60. `iso` holds the projection and art scale (SPRITES 10), and `lighting` holds the
darkness-layer numbers of GDD 3.13. `maxStandingSilhouettePx` becomes 112 (displayed px) and `maxSilhouetteTiles`
becomes 1.75. The old 90 px and 1.4 tiles were measured at the 40° camera. `@wdi/shared` `metrics.ts` follows:
`MAX_SILHOUETTE_PX = 112`. `characterHeadsTall` becomes 5, for the five-head figures of `art-plan.md` S4.
`content.test.ts` pins 112, 1.75 and 5.

```json
{
  "source": "docs/WORLD.md 4.2, 4.7, docs/ASSETS.md 6.1-6.3, docs/SPRITES.md 10",
  "tilePx": 64,
  "metersPerTile": 1,
  "characterCellPx": 128,
  "maxStandingSilhouettePx": 112,
  "maxSilhouetteTiles": 1.75,
  "characterHeadsTall": 5,
  "camera": {
    "tiltXDeg": 60,
    "yawZDeg": 45,
    "verticalSquash": 0.5,
    "wallPxPerMeter": 59,
    "groundTileTiltXDeg": 60
  },
  "iso": {
    "tileW": 128,
    "tileH": 64,
    "pxPerMeter": 90.51,
    "zScale": 0.75,
    "artScale": 2,
    "packedCharacterCellPx": 64,
    "packedDieCellPx": 128,
    "wallHeightM": { "full": 2.5, "half": 1.2, "stub": 0.3 },
    "deepCullTiles": 2,
    "topPadPx": 320,
    "viewTilesHigh": 11,
    "zoomStep": 0.5
  },
  "lighting": {
    "ambient": {
      "day": { "color": "slate", "alpha": 0.4 },
      "night": { "color": "ink", "alpha": 0.9 },
      "dark": { "color": "ink", "alpha": 0.94 }
    },
    "lightCore": 0.55,
    "glowAlpha": 0.25,
    "flicker": { "hz": 1.7, "amp": 0.06 },
    "occluderFadeAlpha": 0.35,
    "occluderFadeS": 0.15
  },
  "render": { "fps": 12, "overscan": 0.03, "propCellPx": { "min": 64, "max": 128 } },
  "overworldTiles": { "w": 64, "h": 48 },
  "interiorCameraFollow": true,
  "collisionBoxTiles": 0.5
}
```

```ts
import { z } from 'zod';
import { PaletteToken } from './common.js';

const Ambient = z.strictObject({ color: PaletteToken, alpha: z.number().min(0).max(1) });

export const MetricsFile = z.strictObject({
  source: z.literal('docs/WORLD.md 4.2, 4.7, docs/ASSETS.md 6.1-6.3, docs/SPRITES.md 10'),
  tilePx: z.literal(64),
  metersPerTile: z.literal(1),
  /** Displayed character cell; packed at half size (`iso.packedCharacterCellPx`). */
  characterCellPx: z.literal(128),
  maxStandingSilhouettePx: z.number().int().positive(),
  maxSilhouetteTiles: z.number().positive(),
  characterHeadsTall: z.number().positive(),
  /** The one render camera (SPRITES 10.3): ground tiles are rendered by it too. */
  camera: z.strictObject({
    tiltXDeg: z.literal(60),
    yawZDeg: z.literal(45),
    verticalSquash: z.number().positive().max(1),
    wallPxPerMeter: z.number().int().positive(),
    groundTileTiltXDeg: z.literal(60),
  }),
  /** SPRITES 10: the isometric presentation. */
  iso: z.strictObject({
    tileW: z.literal(128),
    tileH: z.literal(64),
    /** Displayed px per metre along the ground. */
    pxPerMeter: z.number().positive(),
    /** Heights are rendered at this fraction of true scale (characters uniformly). */
    zScale: z.number().positive().max(1),
    /**
     * Sprites are packed at 1 / artScale and drawn artScale times larger (nearest while the main pixel
     * finish is on, SPRITES 10.3).
     */
    artScale: z.literal(2),
    packedCharacterCellPx: z.literal(64),
    packedDieCellPx: z.literal(128),
    wallHeightM: z.strictObject({
      full: z.number().positive(),
      half: z.number().positive(),
      stub: z.number().positive(),
    }),
    /** Solid tiles farther than this from every walkable tile (Chebyshev) draw nothing. */
    deepCullTiles: z.number().int().positive(),
    /** Extra camera bound above the map, for tall sprites on the north edge. */
    topPadPx: z.number().int().nonnegative(),
    /** The camera shows about this many tiles' worth of height (a tile is 64 px either way). */
    viewTilesHigh: z.number().positive(),
    /** Camera zoom snaps down to a multiple of this, so an art pixel is a whole number of screen pixels. */
    zoomStep: z.number().positive(),
  }),
  /** GDD 3.13, WORLD 4.7: the darkness layer. */
  lighting: z.strictObject({
    ambient: z.strictObject({ day: Ambient, night: Ambient, dark: Ambient }),
    /** A pool erases fully out to this fraction of its radius, then fades to its edge. */
    lightCore: z.number().min(0).max(1),
    /** Strength of a pool's additive colour glow. */
    glowAlpha: z.number().min(0).max(1),
    /** Torch and fire pools: radius wobble frequency and amplitude (fraction of the radius). */
    flicker: z.strictObject({ hz: z.number().positive(), amp: z.number().min(0).max(0.5) }),
    occluderFadeAlpha: z.number().min(0).max(1),
    occluderFadeS: z.number().nonnegative(),
  }),
  render: z.strictObject({
    fps: z.number().int().positive(),
    overscan: z.number().min(0).max(1),
    propCellPx: z.strictObject({ min: z.number().int(), max: z.number().int() }),
  }),
  overworldTiles: z.strictObject({ w: z.number().int(), h: z.number().int() }),
  interiorCameraFollow: z.literal(true),
  /** Side of the square collision box under a player's feet, in tiles (WORLD 4.2). */
  collisionBoxTiles: z.number().positive().max(1),
});
export type MetricsFile = z.infer<typeof MetricsFile>;
```

## 5. Validator rules

### 5.1 One scene (`checkSceneWorld`, run for every scene beside `checkGrid`)

1. A scene whose biome is `cave` has `dark: true`.
2. Every building and multi-tile prop footprint lies inside the grid, covers only `#` tiles, and overlaps no other
   footprint. The exceptions are the door tiles of a building: a `D` inside a building footprint must be on its
   south row or east column, so that the camera sees it (WORLD 4.4).
3. A multi-tile prop's anchor lies inside its footprint, and the footprint touches a floor tile. A single-tile prop
   inside a footprint is an overlay on that tile's slice: the plates on the Wake Table, the crepe on the manor door.
4. `material`, when present, has `h` rows of `w` legend characters, with:
   - floor characters on `.` and `S`;
   - solid characters on `#`;
   - `P` exactly on the `#` tiles that a building or a prop covers.
5. Lights lie inside the grid, on any tile, and repeat no phase.
6. A node stands on `.`, or on `#` with an orthogonally adjacent floor tile and outside every footprint.
7. A spawner stands on `.`. Its `pathId` names a path of the same scene, and its phases do not repeat.
8. A giver stands on `.`, and no two givers share a tile.
9. Every building, light, node, spawner and giver id carries the scene prefix.

### 5.2 Across scenes (in `validateContent`)

10. Scene prefixes are unique.
11. The new object kinds join the global id set of spots, props, gates and paths.

### 5.3 Maps (`checkMaps`)

12. Each map file's `id` matches its key in `MAP_IDS`. No map lists `onub` (the quick mode does not walk). A
    map's scenes are unique, and every scene belongs to exactly one map. A scene in no map is an error.
13. The hub is one of the map's scenes and is a Small `exterior`.
14. `startSpawns` and `meetingSpawns` each hold at least `balance.players.max` unique refs, each naming a spawn of
    the hub.
15. `bell`, `teachingClue` and `kitChest` are props of the hub, of kind `bell`, `teachingClue` and `kitChest`.
16. No portal of a map's scene leads out of the map.
17. At each profile (Small, Medium, Large), every scene open at it is reachable from the hub through V1 portals
    open at it, and has a way back to the hub.
18. At least one `forest` scene and one `cave` scene of the map are open at the Small profile (A49). Hollowmere's
    are Gallows Wood and the Tin Gallery mouth; the Fenwood and the Flooded Gallery open at Medium (F4).

### 5.4 The code

`packages/content/src/validateWorld.ts` (new):

```ts
// World rules of GDD 3.13 and WORLD 4.3 that a single zod schema cannot express: the material layer, buildings
// and footprints, lights and the M5b placeholders inside one scene (`checkSceneWorld`), and the maps
// (`checkMaps`). `validateContent` calls both; every message names the scene or map it is about.
import { PROFILE_RANK, type Profile } from './schemas/balance.js';
import type { MapFile, MapId } from './schemas/maps.js';
import { MAP_IDS } from './schemas/maps.js';
import {
  FLOOR_MATERIALS,
  SOLID_MATERIALS,
  biomeOf,
  type Rect,
  type Scene,
  type SceneId,
} from './schemas/scene.js';

const FLOOR = new Set(Object.keys(FLOOR_MATERIALS));
const SOLID = new Set(Object.keys(SOLID_MATERIALS));
const PROFILES: Profile[] = ['small', 'medium', 'large'];

const tilesOf = (r: Rect): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push([x, y]);
  return out;
};
const inRect = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

/** Every rule of one scene's M5a fields; returns the problems found. */
export function checkSceneWorld(scene: Scene): string[] {
  const errors: string[] = [];
  const err = (msg: string) => errors.push(`scene ${scene.id}: ${msg}`);
  const { w, h } = scene.size;
  const at = (x: number, y: number) => scene.grid[y]?.[x];
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const floorish = (x: number, y: number) => at(x, y) === '.' || at(x, y) === 'S';
  const touchesFloor = (x: number, y: number) =>
    floorish(x + 1, y) || floorish(x - 1, y) || floorish(x, y + 1) || floorish(x, y - 1);
  const prefixed = (id: string, what: string) => {
    if (!id.startsWith(`${scene.prefix}.`)) err(`${what} ${id} lacks prefix ${scene.prefix}.`);
  };

  if (biomeOf(scene) === 'cave' && scene.dark !== true) err('a cave scene must be dark');

  // Footprints: buildings and multi-tile props cover solid tiles only, never each other.
  const covered = new Map<string, string>();
  const doorOf = new Map(scene.portals.map((p) => [`${p.x},${p.y}`, p]));
  const cover = (id: string, r: Rect, isBuilding: boolean) => {
    for (const [x, y] of tilesOf(r)) {
      const key = `${x},${y}`;
      if (!inBounds(x, y)) {
        err(`${id} footprint leaves the grid at ${key}`);
        continue;
      }
      if (covered.has(key)) err(`${id} footprint overlaps ${covered.get(key)} at ${key}`);
      covered.set(key, id);
      const ch = at(x, y);
      if (ch === 'D' && isBuilding) {
        // A building's door is on its south or east face, so the camera always sees it (WORLD 4.4).
        if (y !== r.y + r.h - 1 && x !== r.x + r.w - 1)
          err(`door ${doorOf.get(key)?.id} is not on the south or east face of ${id}`);
      } else if (ch !== '#') err(`${id} footprint covers "${ch}" at ${key}, expected "#"`);
    }
  };
  for (const b of scene.buildings ?? []) {
    prefixed(b.id, 'building');
    cover(b.id, b.footprint, true);
  }
  for (const p of scene.props) {
    if (!p.footprint) continue;
    if (!inRect(p.footprint, p.x, p.y)) err(`prop ${p.id} anchor ${p.x},${p.y} is outside its footprint`);
    cover(p.id, p.footprint, false);
    if (!tilesOf(p.footprint).some(([x, y]) => touchesFloor(x, y)))
      err(`prop ${p.id} footprint touches no floor`);
  }
  // A single-tile prop inside a footprint is an overlay on that tile's slice (the plates on the Wake Table, the
  // crepe on the manor door), so it needs no rule of its own.

  // Material layer: h rows of w legend characters that agree with the grid.
  if (scene.material) {
    if (scene.material.length !== h) err(`material has ${scene.material.length} rows, size says ${h}`);
    scene.material.forEach((row, y) => {
      if (row.length !== w) err(`material row ${y} has ${row.length} columns, size says ${w}`);
      [...row].forEach((m, x) => {
        const ch = at(x, y);
        const key = `${x},${y}`;
        if (ch === '.' || ch === 'S') {
          if (!FLOOR.has(m)) err(`material "${m}" at ${key} is solid on a walkable tile`);
        } else if (ch === '#') {
          if (!SOLID.has(m)) err(`material "${m}" at ${key} is floor on a solid tile`);
          const coveredHere = covered.has(key) || scene.props.some((p) => p.x === x && p.y === y);
          if (coveredHere !== (m === 'P')) {
            err(`material at ${key} must be "P" exactly where a building or prop covers the tile`);
          }
        }
      });
    });
  }

  // Lights, nodes, spawners and givers.
  const pathIds = new Set(scene.paths.map((p) => p.id));
  for (const l of scene.lights ?? []) {
    prefixed(l.id, 'light');
    if (!inBounds(l.x, l.y)) err(`light ${l.id} is out of bounds`);
    if (l.phases && new Set(l.phases).size !== l.phases.length) err(`light ${l.id} repeats a phase`);
  }
  for (const n of scene.nodes ?? []) {
    prefixed(n.id, 'node');
    if (!inBounds(n.x, n.y)) {
      err(`node ${n.id} is out of bounds`);
      continue;
    }
    const ch = at(n.x, n.y);
    if (ch === '#') {
      if (!touchesFloor(n.x, n.y)) err(`node ${n.id} on a solid tile has no adjacent floor`);
      if (covered.has(`${n.x},${n.y}`)) err(`node ${n.id} is inside a footprint`);
    } else if (ch !== '.') err(`node ${n.id} stands on "${ch}"; nodes stand on "." or on "#" beside floor`);
  }
  for (const s of scene.spawners ?? []) {
    prefixed(s.id, 'spawner');
    if (at(s.x, s.y) !== '.') err(`spawner ${s.id} is not on a floor tile`);
    if (s.pathId !== undefined && !pathIds.has(s.pathId))
      err(`spawner ${s.id} walks unknown path ${s.pathId}`);
    if (s.phases && new Set(s.phases).size !== s.phases.length) err(`spawner ${s.id} repeats a phase`);
  }
  const taken = new Set<string>();
  for (const g of scene.givers ?? []) {
    prefixed(g.id, 'giver');
    const key = `${g.x},${g.y}`;
    if (at(g.x, g.y) !== '.') err(`giver ${g.id} is not on a floor tile`);
    if (taken.has(key)) err(`giver ${g.id} shares tile ${key}`);
    taken.add(key);
  }
  return errors;
}

export interface MapContent {
  maps: Record<MapId, MapFile>;
  scenes: Record<SceneId, Scene>;
  playersMax: number;
}

/** GDD 3.13 and WORLD 4.3: closed graphs, hubs, spawns, the bell, reachability and a forest and a cave each. */
export function checkMaps(c: MapContent): string[] {
  const errors: string[] = [];
  const scenes: Record<string, Scene | undefined> = c.scenes;
  const owner = new Map<string, string>();
  for (const id of MAP_IDS) {
    const map = c.maps[id];
    const err = (msg: string) => errors.push(`map ${id}: ${msg}`);
    if (map.id !== id) err(`file holds map "${map.id}"`);
    if (map.modes.includes('onub')) err('the quick mode does not walk, so no map lists it (GDD 3.11)');
    if (new Set(map.scenes).size !== map.scenes.length) err('a scene is listed twice');
    for (const s of map.scenes) {
      if (owner.has(s)) err(`scene ${s} also belongs to map ${owner.get(s)}`);
      owner.set(s, id);
    }
    const inMap = new Set<string>(map.scenes);
    const hub = scenes[map.hub];
    if (!inMap.has(map.hub)) err(`hub ${map.hub} is not one of its scenes`);
    if (hub && (hub.kind !== 'exterior' || hub.profile !== 'small'))
      err(`hub ${map.hub} must be a Small exterior`);

    // Start and meeting spawns: enough for a full party, unique, on the hub.
    for (const [field, refs] of [
      ['startSpawns', map.startSpawns],
      ['meetingSpawns', map.meetingSpawns],
    ] as const) {
      if (refs.length < c.playersMax) err(`${field} has ${refs.length}, needs ${c.playersMax}`);
      if (new Set(refs).size !== refs.length) err(`${field} repeats a spawn`);
      for (const ref of refs) {
        const [sceneId, spawnId] = ref.split('.');
        if (sceneId !== map.hub) err(`${field} ${ref} is not on the hub`);
        if (!scenes[sceneId!]?.spawns.some((s) => s.id === spawnId)) err(`${field} ${ref} names no spawn`);
      }
    }
    // The bell, the teaching clue and the kit chest are props of the right kind on the hub.
    for (const [field, kind] of [
      ['bell', 'bell'],
      ['teachingClue', 'teachingClue'],
      ['kitChest', 'kitChest'],
    ] as const) {
      const prop = hub?.props.find((p) => p.id === map[field]);
      if (!prop) err(`${field} ${map[field]} is not a prop of the hub`);
      else if (prop.kind !== kind) err(`${field} ${map[field]} has kind ${prop.kind}, expected ${kind}`);
    }

    // Closed graph: every portal stays inside the map.
    for (const s of map.scenes) {
      for (const p of scenes[s]?.portals ?? []) {
        if (p.to !== null && !inMap.has(p.to)) err(`portal ${p.id} leaves the map for ${p.to}`);
      }
    }
    // At every profile, every open scene is reachable from the hub and leads back to it.
    for (const profile of PROFILES) {
      const open = map.scenes.filter(
        (s) => scenes[s] && PROFILE_RANK[scenes[s]!.profile] <= PROFILE_RANK[profile],
      );
      const edges = (from: string) =>
        (scenes[from]?.portals ?? [])
          .filter(
            (p) => p.to !== null && p.ships === 'V1' && PROFILE_RANK[p.minProfile] <= PROFILE_RANK[profile],
          )
          .map((p) => p.to as string)
          .filter((to) => open.includes(to as SceneId));
      const reach = (start: string, next: (s: string) => string[]) => {
        const seen = new Set([start]);
        const queue = [start];
        while (queue.length) {
          for (const n of next(queue.shift()!)) {
            if (seen.has(n)) continue;
            seen.add(n);
            queue.push(n);
          }
        }
        return seen;
      };
      const forward = reach(map.hub, edges);
      const back = reach(map.hub, (to) => open.filter((from) => edges(from).includes(to)));
      for (const s of open) {
        if (!forward.has(s)) err(`${s} is unreachable from the hub at ${profile}`);
        if (!back.has(s)) err(`${s} has no way back to the hub at ${profile}`);
      }
    }
    // Every party size gets a forest and a cave (owner, A49).
    for (const biome of ['forest', 'cave'] as const) {
      const ok = map.scenes.some(
        (s) => scenes[s] && scenes[s]!.profile === 'small' && biomeOf(scenes[s]!) === biome,
      );
      if (!ok) err(`has no ${biome} scene open at the Small profile`);
    }
  }
  for (const s of Object.keys(c.scenes)) if (!owner.has(s)) errors.push(`scene ${s} belongs to no map`);
  return errors;
}
```

The hook in `validate.ts`, as a diff on 265bda9:

```diff
--- a/packages/content/src/validate.ts
+++ b/packages/content/src/validate.ts
@@ -14,6 +14,8 @@
 import type { StyleFile } from './schemas/style.js';
 import type { TasksFile } from './schemas/tasks.js';
 import type { TraitsFile } from './schemas/traits.js';
+import type { MapFile, MapId } from './schemas/maps.js';
+import { checkMaps, checkSceneWorld } from './validateWorld.js';
 
 export interface Content {
   palette: PaletteFile;
@@ -27,6 +29,7 @@
   tasks: TasksFile;
   balance: BalanceFile;
   scenes: Record<SceneId, Scene>;
+  maps: Record<MapId, MapFile>;
   onubRoles: OnubRolesFile;
   onubBalance: OnubBalanceFile;
 }
@@ -118,12 +121,17 @@
   // Scenes.
   const portalIds = new Set<string>();
   const objectIds = new Set<string>();
+  const prefixes = new Map<string, string>();
   const propIn = (scene: string, prop: string) => scenes[scene]?.props.some((p) => p.id === prop) ?? false;
   for (const [key, scene] of Object.entries(c.scenes)) {
     const where = `scene ${key}`;
     if (key !== scene.id) err(`${where}: file key and id differ`);
     if (scene.zoneId !== scene.id) err(`${where}: zoneId equals sceneId in V1`);
     errors.push(...checkGrid(scene));
+    errors.push(...checkSceneWorld(scene));
+    if (prefixes.has(scene.prefix))
+      err(`${where}: prefix ${scene.prefix} is also ${prefixes.get(scene.prefix)}'s`);
+    prefixes.set(scene.prefix, scene.id);
     for (const portal of scene.portals) {
       if (portalIds.has(portal.id)) err(`${where}: duplicate portal id ${portal.id}`);
       portalIds.add(portal.id);
@@ -147,7 +155,17 @@
       if (portal.kind === 'drop' && portal.noise !== 'oneWayDrop') err(`${where}: drop ${portal.id} noise`);
       if (portal.kind === 'drop' && !portal.oneWay) err(`${where}: drop ${portal.id} must be one-way`);
     }
-    for (const obj of [...scene.spots, ...scene.props, ...scene.gates, ...scene.paths]) {
+    for (const obj of [
+      ...scene.spots,
+      ...scene.props,
+      ...scene.gates,
+      ...scene.paths,
+      ...(scene.buildings ?? []),
+      ...(scene.lights ?? []),
+      ...(scene.nodes ?? []),
+      ...(scene.spawners ?? []),
+      ...(scene.givers ?? []),
+    ]) {
       if (objectIds.has(obj.id)) err(`${where}: duplicate id ${obj.id}`);
       objectIds.add(obj.id);
     }
@@ -171,6 +189,9 @@
     }
   }
 
+  // Maps (GDD 3.13).
+  errors.push(...checkMaps({ maps: c.maps, scenes: c.scenes, playersMax: balance.players.max }));
+
   // Tasks point at real items, scenes and props.
   for (const task of Object.values(tasks.tasks)) {
     if (task.tool !== undefined && !isItem(task.tool)) err(`task ${task.id}: unknown tool ${task.tool}`);
```

## 6. The map files

### 6.1 `packages/content/data/maps/hollowmere.json`

`scenes` lists the 15 current ids (the pre-seed) plus `forest_deep` and `cave_gallery` (5J PR 1).

```json
{
  "id": "hollowmere",
  "name": "Hollowmere",
  "blurb": "Fog-bound harbour hamlet: lanes, a tavern and a manor, two woods and Vane's flooded tin gallery.",
  "modes": ["main"],
  "theme": "harbour",
  "scenes": [
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
    "forest_deep",
    "cave_gallery"
  ],
  "hub": "overworld",
  "startSpawns": [
    "overworld.square_0",
    "overworld.square_1",
    "overworld.square_2",
    "overworld.square_3",
    "overworld.square_4",
    "overworld.square_5",
    "overworld.square_6",
    "overworld.square_7",
    "overworld.square_8",
    "overworld.square_9"
  ],
  "meetingSpawns": [
    "overworld.square_0",
    "overworld.square_1",
    "overworld.square_2",
    "overworld.square_3",
    "overworld.square_4",
    "overworld.square_5",
    "overworld.square_6",
    "overworld.square_7",
    "overworld.square_8",
    "overworld.square_9"
  ],
  "bell": "ov.bell",
  "teachingClue": "ov.teaching_clue",
  "kitChest": "ov.chest",
  "thumbnail": "thumb_hollowmere",
  "worldRef": "4.3",
  "gddRef": "3.13"
}
```

### 6.2 `packages/content/data/maps/blackpine.json` (5J PR 2)

```json
{
  "id": "blackpine",
  "name": "Blackpine",
  "blurb": "Storm-cut logging camp: bunkhouse, sawmill, pine woods and the company's tin workings under the hill.",
  "modes": ["main"],
  "theme": "timber",
  "scenes": ["bp_camp", "bp_lodge", "bp_mill", "bp_woods", "bp_mine", "bp_office", "bp_smithy", "bp_deep"],
  "hub": "bp_camp",
  "startSpawns": [
    "bp_camp.yard_0",
    "bp_camp.yard_1",
    "bp_camp.yard_2",
    "bp_camp.yard_3",
    "bp_camp.yard_4",
    "bp_camp.yard_5",
    "bp_camp.yard_6",
    "bp_camp.yard_7",
    "bp_camp.yard_8",
    "bp_camp.yard_9"
  ],
  "meetingSpawns": [
    "bp_camp.yard_0",
    "bp_camp.yard_1",
    "bp_camp.yard_2",
    "bp_camp.yard_3",
    "bp_camp.yard_4",
    "bp_camp.yard_5",
    "bp_camp.yard_6",
    "bp_camp.yard_7",
    "bp_camp.yard_8",
    "bp_camp.yard_9"
  ],
  "bell": "bc.bell",
  "teachingClue": "bc.teaching_clue",
  "kitChest": "bc.chest",
  "thumbnail": "thumb_blackpine",
  "worldRef": "4.10",
  "gddRef": "3.13"
}
```

## 7. Changes to the existing scenes

**Biome, darkness and lights.** `ambientLightTiles` went from `cave_entry` and `cellar`. The pre-seed set
`biome` and `dark` on every scene (landed). 5J adds the lights with the material layers, scene by scene:

| Scene | `biome` | `dark` | Lights | Spawners |
|---|---|---|---|---|
| `overworld` | `village` | `false` | `ov.lt_lantern_0` `lantern` 22,15 r3 [dusk, night]; `ov.lt_lantern_1` `lantern` 38,15 r3 [dusk, night]; `ov.lt_lantern_2` `lantern` 22,27 r3 [dusk, night]; `ov.lt_lantern_3` `lantern` 38,27 r3 [dusk, night]; `ov.lt_tavern_window` `window` 31,35 r2 [dusk, night]; `ov.lt_bakery_window` `window` 44,20 r2 [dusk, night]; `ov.lt_apoth_window` `window` 53,25 r2 [dusk, night] `teal`; `ov.lt_chapel_window` `window` 11,30 r2 [dusk, night]; `ov.lt_moon_dock` `moon` 50,41 r4 [night] | – |
| `tavern_bar` | `house` | `false` | `tb.lt_hearth` `fire` 1,3 r3; `tb.lt_lamp_bar` `lamp` 15,2 r2.5; `tb.lt_lamp_room` `lamp` 7,8 r2.5 | – |
| `tavern_back` | `house` | `false` | `tk.lt_lamp` `lamp` 6,4 r2 | – |
| `apoth_shop` | `house` | `false` | `as.lt_lamp` `lamp` 8,3 r2.5; `as.lt_shelf` `lamp` 4,1 r1.5 `teal` | – |
| `apoth_loft` | `house` | `true` | `al.lt_green_lamp` `lamp` 6,1 r2 `teal` | – |
| `widow_parlour` | `house` | `false` | `wp.lt_lamp` `lamp` 8,5 r2 | – |
| `widow_bedroom` | `house` | `false` | `wb.lt_candle` `lamp` 6,1 r1.5 | – |
| `forest` | `forest` | `false` | `fo.lt_gate_lantern` `lantern` 21,28 r2.5 [dusk, night]; `fo.lt_moon_clearing` `moon` 20,24 r4 [night] | `fo.sp_wolf_w` `wolf` 8,9 leash 6 [dusk, night] path `fo.wolf_loop_w`; `fo.sp_wolf_n` `wolf` 25,6 leash 6 [dusk, night] path `fo.wolf_loop_n`; `fo.sp_wolf_e` `wolf` 33,12 leash 6 [dusk, night] path `fo.wolf_loop_e` |
| `bakery` | `house` | `false` | `bk.lt_lamp_table` `lamp` 8,6 r2.5; `bk.lt_lamp_counter` `lamp` 14,6 r2 | – |
| `cave_entry` | `cave` | `true` | `ce.lt_moss_0` `moss` 3,2 r2; `ce.lt_moss_1` `moss` 16,5 r2; `ce.lt_moss_2` `moss` 4,11 r2; `ce.lt_mouth` `shaft` 10,12 r3 [day, dusk] | – |
| `manor_hall` | `house` | `false` | `mh.lt_lamp_w` `lamp` 7,7 r2.5; `mh.lt_lamp_e` `lamp` 21,7 r2.5 | – |
| `manor_upper` | `house` | `false` | `mu.lt_lamp` `lamp` 12,6 r2 | – |
| `barn` | `house` | `false` | `ba.lt_lantern` `lantern` 10,6 r2.5 | – |
| `chapel` | `house` | `false` | `ch.lt_candles` `lamp` 9,1 r2.5; `ch.lt_moon_window` `moon` 4,6 r2 [night] | – |
| `cellar` | `house` | `true` | `cl.lt_torch_well` `torch` 14,2 r2.5; `cl.lt_torch_trap` `torch` 25,8 r2.5; `cl.lt_torch_crypt` `torch` 2,8 r2.5 | – |

**New portals and spawns** (5J PR 1; every other field: `lock: null`, `window: null`, `noise: "door"`,
`elevationDelta: 0`, `ships: "V1"`, `oneWay: false`). Each portal's tile in the grid changes from `#` to `D`, and
each spawn's tile from `.` to `S`. Both portals lead into a Medium scene (F4), so both are `minProfile: "medium"`:
below Medium they render boarded and refuse with `CLOSED`, as the validator requires (a portal's `minProfile` is
the higher profile of its two scenes):

| Scene | Portal | Tile | Kind | to . toSpawn | minProfile | New spawn |
|---|---|---|---|---|---|---|
| `forest` | `fo.deep` | 0,16 (west edge) | `forest_gate` | `forest_deep.wood_side` | `medium` | `deep_side` 1,16 facing e |
| `cave_entry` | `ce.gallery` | 10,0 (north edge) | `cave_mouth` | `cave_gallery.upper` | `medium` | `gallery` 10,1 facing s |

**Moved doors.** Ids are kept (WORLD 4.4). The old tile goes back to `#` (portal) or `.` (spawn):

| Scene | Object | From | To | Facing |
|---|---|---|---|---|
| `overworld` | portal `ov.tavern_front` | 25,31 | 28,34 (tavern south face) | – |
| `overworld` | spawn `tavern_front` | 24,31 | 28,35 | s |
| `overworld` | portal `ov.apoth` | 47,21 | 50,24 (apothecary south face) | – |
| `overworld` | spawn `apoth` | 46,21 | 50,25 | s |
| `tavern_bar` | portal `tb.front` | 0,6 | 4,11 (south wall) | – |
| `tavern_bar` | spawn `front` | 1,6 | 4,10 | n |
| `apoth_shop` | portal `as.door` | 0,5 | 4,10 (south wall) | – |
| `apoth_shop` | spawn `door` | 1,5 | 4,9 | n |

**Overworld buildings** (`buildings`, art in `bld_hollowmere`). Every door listed sits on a south or east face:

| id | art | footprint (x,y w x h) | doors |
|---|---|---|---|
| `ov.bld_manor` | `manor` | 3,6 13x6 | `ov.manor_front` 13,11, `ov.manor_back` 6,11 (south) |
| `ov.bld_barn` | `barn` | 47,6 10x5 | `ov.barn` 51,10 (south) |
| `ov.bld_bakery` | `bakery` | 40,16 6x4 | `ov.bakery` 42,19 (south) |
| `ov.bld_apoth` | `apoth` | 47,17 10x8 | `ov.apoth` 50,24 (south) |
| `ov.bld_widow` | `widow` | 2,17 8x7 | `ov.widow` 9,20 (east) |
| `ov.bld_tavern` | `tavern` | 25,28 12x7 | `ov.tavern_front` 28,34 (south), `ov.tavern_alley` 36,31 (east) |
| `ov.bld_chapel` | `chapel` | 2,28 9x8 | `ov.chapel` 10,32 (east) |
| `ov.bld_netloft` | `netloft` | 40,28 5x9 | none: the dock net loft. Rows 37-39 of its old block become cliff (`X`) |

`ov.crepe` (13,11) stays where it is, as an overlay on the manor's front door.

**Other existing-scene changes:**

- `bakery`: `bk.wake_table` gains `footprint: {x: 6, y: 4, w: 5, h: 2}`. The plates stay single-tile overlays.
- **Forest wolves.** The spawners in the table above sit on the existing wolf loops.
- **Material for every scene.** 5J writes `material` for all 25 scenes in round 5:
  - the overworld: grass, cobble around the square, paths, dock planks, shingle, the sea as `O`, cliffs as `X`,
    hedges as `F`, the graveyard's headstones as `R`, buildings and props as `P`;
  - Gallows Wood and the Tin Gallery mouth;
  - every interior: planks or flags, `W` walls and `P` under props. The chapel, the cellar and the manor hall are
    `f`.

## 8. The new scenes

Coordinates are tiles, x right and y down, origin top-left. The 1:1 skeleton of each scene is in the appendix.

- **Exact and frozen:** portal and spawn tiles, ids and sizes.
- **Targets:** the tiles of spots, props, lights, nodes, spawners and givers. 5J may move one of them by up to 2
  tiles when the drawn grid needs it, keeping its id and every rule of section 5.
- Every scene has `zoneId` equal to `id`, `gates: []`, and `notes` written by 5J in the style of WORLD 4.3.


### 8.1 `forest_deep`: The Fenwood

**The Fenwood** is the wood on the marsh edge west of Gallows Wood, where the mere-rot leaks out of Vane's flooded
gallery and makes the wolves bold (WORLD 4.1). Points of interest:

- **The east trail** (3 wide, x 30-46, y 17-19) runs in from `fd.wood`, with the hollow log (`fd.hollow_log`) on its
  north side.
- **The Hanging Oak clearing** (x 19-29, y 13-21) is the centre and the only grass. The old oak with a frayed rope
  (`fd.hanging_oak`, 2x2) stands in it, and moonlight pools there at night.
- **The north trail** climbs from the clearing to the adit mouth (`fd.adit`). It passes:
  - the sinkhole glade, where `fd.sinkhole` drops into the Gallery's engine chamber;
  - the wolf den: a rock face with a den mouth (`fd.den`), moss on the stones, and a hollow inside a wolf loop.
- **The charcoal clearing** (x 33-42, y 6-11) holds Mother Moll's smouldering clamp (`fd.clamp`, a warm fire light),
  her hut (`fd.bld_moll_hut`, no door) and the charcoal pit (`fd.charcoal_pit`, a body spot). A path runs south from
  it to the east trail.
- **The fen** (x 2-22, y 22-34) is a grass bank over shallow water (walkable), deep pools (solid) and reed beds.
  - A plank boardwalk runs from the clearing to the drowned lantern still glowing on its post (`fd.drowned_lantern`,
    WORLD 4.8).
  - The bog (`fd.bog`) is a body spot beside the boardwalk.
  - The mere-rot glows teal on the water (`fd.lt_rot_fen`).
- **The pine loop** (south-east) is a wolf loop with a boar wallow inside it, joined to the clearing by a short
  trail.

| Field | Value |
|---|---|
| `id` / `zoneId` | `forest_deep` |
| `prefix` | `fd` |
| `name` | The Fenwood |
| `kind` / `profile` | `exterior` / `medium` (F4: Small already has Gallows Wood) |
| `size` | 48 x 36 |
| `biome` / `dark` | `forest` / `false` |
| `worldRef` | `4.3` |

Portals (`lock: null`, `window: null`, `ships: "V1"`):

| id | tile | kind | to . toSpawn | oneWay | noise | elevationDelta | minProfile |
|---|---|---|---|---|---|---|---|
| `fd.wood` | 47,18 | `forest_gate` | `forest.deep_side` | false | `door` | 0 | `medium` |
| `fd.adit` | 8,0 | `cave_mouth` | `cave_gallery.fen` | false | `door` | 0 | `medium` |
| `fd.sinkhole` | 16,7 | `drop` | `cave_gallery.sink_landing` | true | `oneWayDrop` | -6 | `medium` |

Spawns (`z: 0`): `wood_side` 46,18 w; `adit_side` 8,1 s.

Spots (`childOnly: false` unless marked): `fd.hollow_log` hide `hollowLog` 32,16; `fd.reeds` hide `reeds` 6,26; `fd.bramble` hide `brush` 45,27; `fd.bog` body `bog` 14,31; `fd.charcoal_pit` body `charcoalPit` 34,9.

Props: `fd.hanging_oak` `decor` 24,16 footprint 23,15 2x2; `fd.clamp` `decor` 37,7 footprint 36,6 2x2; `fd.drowned_lantern` `decor` 10,30; `fd.den` `decor` 4,7.

Buildings: `fd.bld_moll_hut` art `mollHut` footprint 39,3 4x3.

Lights: `fd.lt_clamp` `fire` 37,8 r3; `fd.lt_drowned` `lantern` 10,29 r2 [dusk, night]; `fd.lt_moon_oak` `moon` 24,19 r4 [night]; `fd.lt_moss_den` `moss` 6,8 r1.5; `fd.lt_rot_fen` `moss` 16,27 r2.

Nodes (M5b placeholders; `wall` = on a solid tile used from beside it): `fd.nd_timber_0` `timber` 27,12 wall pool `fenTimber`; `fd.nd_timber_1` `timber` 30,14 wall pool `fenTimber`; `fd.nd_timber_2` `timber` 42,20 wall pool `fenTimber`; `fd.nd_timber_3` `timber` 26,25 wall pool `fenTimber`; `fd.nd_herb_0` `herb` 21,15 pool `fenHerbs`; `fd.nd_herb_1` `herb` 18,24 pool `fenHerbs`; `fd.nd_herb_2` `herb` 35,11 pool `fenHerbs`; `fd.nd_mush_0` `mushroom` 10,9 pool `fenMush`; `fd.nd_mush_1` `mushroom` 35,29 pool `fenMush`; `fd.nd_stone_0` `stone` 4,9 wall.

Spawners (M5b placeholders): `fd.sp_wolf_den` `wolf` 6,9 leash 6 [dusk, night] path `fd.wolf_loop_n`; `fd.sp_wolf_south` `wolf` 28,28 leash 6 [dusk, night] path `fd.wolf_loop_s`; `fd.sp_boar` `boar` 36,28 leash 5 [day, dusk].

Givers (M5b placeholders): `fd.gv_moll` npc `moll` 40,7 facing sw.

Paths: `fd.wolf_loop_n` `wolfLoop` 3,4 13,4 13,11 3,11; `fd.wolf_loop_s` `wolfLoop` 28,24 44,24 44,32 28,32.


### 8.2 `cave_gallery`: The Flooded Gallery

**The Flooded Gallery** is Vane's lowest tin gallery, flooded and leaking mere-rot into the fen. It is dark;
its light comes from the mere-rot on the water, moss, one dropped miner's lamp and the daylight down the sinkhole
shaft. Points of interest:

- **The entry passage** (x 19-21) runs up from `cg.upper` into **the junction** (x 14-26, y 14-20), which holds a rat
  run.
- **The flooded stope** (west, x 3-13, y 4-16): deep water with shallow margins, crossed by a plank walkway along
  y 10. The mere-rot glows teal on it in three places. The sump (`cg.sump`, a body spot) is at its south margin.
- **The west passage** runs down the stope's side to the fen adit (`cg.fen`).
- **The ore chamber** (north, x 15-24, y 2-8) has:
  - tin lodes in its walls (four M5b tin nodes);
  - an ore cart on rails (`cg.ore_cart`), with the rails running south to the junction;
  - a half-pried VANE TIN CO crate (`cg.tin_crate`);
  - the ore chute (`cg.ore_chute`, a hiding spot) in its east wall.
- **The pumping engine chamber** (east, x 27-37, y 3-12) holds the broken beam engine (`cg.pump_beam`, 2x3) and the
  heap under the sinkhole where `sink_landing` sits, lit by the shaft.
- **The collapse** (south-east) is rubble with a squeeze and a timber crib (`cg.timber_crib`, a hiding spot).

| Field | Value |
|---|---|
| `id` / `zoneId` | `cave_gallery` |
| `prefix` | `cg` |
| `name` | The Flooded Gallery |
| `kind` / `profile` | `interior` / `medium` (F4: Small already has the Tin Gallery mouth) |
| `size` | 40 x 28 |
| `biome` / `dark` | `cave` / `true` |
| `worldRef` | `4.3` |

Portals (`lock: null`, `window: null`, `ships: "V1"`):

| id | tile | kind | to . toSpawn | oneWay | noise | elevationDelta | minProfile |
|---|---|---|---|---|---|---|---|
| `cg.upper` | 20,27 | `cave_mouth` | `cave_entry.gallery` | false | `door` | 0 | `medium` |
| `cg.fen` | 0,20 | `cave_mouth` | `forest_deep.adit_side` | false | `door` | 0 | `medium` |

Spawns (`z: 0`): `upper` 20,26 n; `fen` 1,20 e; `sink_landing` 31,7 s.

Spots (`childOnly: false` unless marked): `cg.ore_chute` hide `oreChute` 25,4; `cg.timber_crib` hide `timberCrib` 30,17; `cg.sump` body `sump` 12,17.

Props: `cg.pump_beam` `decor` 34,5 footprint 34,4 2x3; `cg.ore_cart` `decor` 20,5; `cg.tin_crate` `decor` 16,3.

Lights: `cg.lt_shaft` `shaft` 31,6 r3; `cg.lt_lamp_ore` `lamp` 19,4 r2; `cg.lt_rot_0` `moss` 6,7 r2; `cg.lt_rot_1` `moss` 10,13 r2; `cg.lt_rot_2` `moss` 4,18 r2; `cg.lt_moss_upper` `moss` 22,23 r2.

Nodes (M5b placeholders; `wall` = on a solid tile used from beside it): `cg.nd_tin_0` `tinOre` 14,4 wall pool `galleryTin`; `cg.nd_tin_1` `tinOre` 17,1 wall pool `galleryTin`; `cg.nd_tin_2` `tinOre` 22,1 wall pool `galleryTin`; `cg.nd_tin_3` `tinOre` 25,6 wall pool `galleryTin`; `cg.nd_stone_0` `stone` 29,19 wall; `cg.nd_stone_1` `stone` 29,14 wall; `cg.nd_mush_0` `mushroom` 16,18.

Spawners (M5b placeholders): `cg.sp_bats` `bat` 13,6 leash 8; `cg.sp_rats` `rat` 24,16 leash 6 path `cg.rat_run`.

Paths: `cg.rat_run` `patrol` 16,15 25,15 25,19 16,19.


### 8.3 `bp_camp`: Blackpine Camp

**Blackpine Camp** is the hub. Points of interest:

- **The edges.** The north edge is the hill: a cliff 4 tiles deep, with the adit (`bc.adit`) cut into it and tram rails
  running down to the ore bin (`bc.ore_bin`, a hiding spot). The west edge is the pine line, with the woods trail
  (`bc.woods`) through it. The south edge is the Blackwater, with a shingle bank and the broken trestle
  (`bc.trestle`, 3x2, standing in the water). The east edge is the log pond and a fence, with the flume end
  (`bc.flume`).
- **The yard** (x 22-36, y 14-27) has the shift bell (`bc.bell`), the pump with the teaching clue beside it, the
  notice board, the kit chest, four lantern posts and the ten `yard_*` spawns in a ring.
- **The buildings** (doors on their south or east faces):

  | Building | Footprint | Doors |
  |---|---|---|
  | The bunkhouse (`bc.bld_lodge`) | 14x7, west of the yard | front door south, side door east; a Child-only crawlspace under its porch |
  | The sawmill (`bc.bld_mill`) | 12x7, south-east | main door east, yard door south onto the plank log landing |
  | The Company Office (`bc.bld_office`) | 8x6, north-east | south [M]; the foreman stands at its porch in M5b |
  | The Forge (`bc.bld_smithy`) | 7x5, north of the yard | south [M] |
  | The woodshed (`bc.bld_woodshed`) | 5x3, south-west | none |

- **The rest.** The log deck (stacked logs, a hiding spot at its north edge) lies south-west. The chute landing
  (`chute_foot`, north-west) is where the one-way log chute from the woods ends.

| Field | Value |
|---|---|
| `id` / `zoneId` | `bp_camp` |
| `prefix` | `bc` |
| `name` | Blackpine Camp |
| `kind` / `profile` | `exterior` / `small` |
| `size` | 56 x 40 |
| `biome` / `dark` | `village` / `false` |
| `worldRef` | `4.10` |

Portals (`lock: null`, `window: null`, `ships: "V1"`):

| id | tile | kind | to . toSpawn | oneWay | noise | elevationDelta | minProfile |
|---|---|---|---|---|---|---|---|
| `bc.lodge` | 12,19 | `door` | `bp_lodge.front` | false | `door` | 0 | `small` |
| `bc.lodge_side` | 21,16 | `door` | `bp_lodge.side` | false | `door` | 0 | `small` |
| `bc.mill` | 45,27 | `door` | `bp_mill.door` | false | `door` | 0 | `small` |
| `bc.mill_yard` | 38,30 | `door` | `bp_mill.yard` | false | `door` | 0 | `small` |
| `bc.office` | 47,11 | `door` | `bp_office.door` | false | `door` | 0 | `medium` |
| `bc.smithy` | 32,11 | `door` | `bp_smithy.door` | false | `door` | 0 | `medium` |
| `bc.woods` | 0,22 | `forest_gate` | `bp_woods.camp` | false | `door` | 0 | `small` |
| `bc.adit` | 40,3 | `cave_mouth` | `bp_mine.adit` | false | `door` | 0 | `small` |

Spawns (`z: 0`): `lodge` 12,20 s; `lodge_side` 22,16 e; `mill` 46,27 e; `mill_yard` 38,31 s; `office` 47,12 s; `smithy` 32,12 s; `woods` 1,22 e; `adit` 40,4 s; `chute_foot` 5,10 s; `yard_0` 25,17 s; `yard_1` 28,17 s; `yard_2` 31,17 s; `yard_3` 33,19 s; `yard_4` 33,22 s; `yard_5` 31,24 s; `yard_6` 28,25 s; `yard_7` 25,24 s; `yard_8` 23,22 s; `yard_9` 23,19 s.

Spots (`childOnly: false` unless marked): `bc.ore_bin` hide `oreBin` 40,14; `bc.log_deck` hide `logPile` 13,29; `bc.water_barrel` hide `barrel` 36,19; `bc.porch_crawl` hide `crawlspace` 16,20 (childOnly).

Props: `bc.bell` `bell` 28,20; `bc.pump` `pump` 31,21; `bc.board` `noticeBoard` 25,21; `bc.chest` `kitChest` 28,23; `bc.teaching_clue` `teachingClue` 30,21; `bc.lantern_0` `lanternPost` 23,15; `bc.lantern_1` `lanternPost` 33,15; `bc.lantern_2` `lanternPost` 23,26; `bc.lantern_3` `lanternPost` 33,26; `bc.trestle` `decor` 19,35 footprint 18,35 3x2; `bc.flume` `decor` 50,18.

Buildings: `bc.bld_lodge` art `lodge` footprint 8,13 14x7; `bc.bld_mill` art `mill` footprint 34,24 12x7; `bc.bld_office` art `office` footprint 44,6 8x6; `bc.bld_smithy` art `smithy` footprint 29,7 7x5; `bc.bld_woodshed` art `woodshed` footprint 4,26 5x3.

Lights: `bc.lt_lantern_0` `lantern` 23,15 r3 [dusk, night]; `bc.lt_lantern_1` `lantern` 33,15 r3 [dusk, night]; `bc.lt_lantern_2` `lantern` 23,26 r3 [dusk, night]; `bc.lt_lantern_3` `lantern` 33,26 r3 [dusk, night]; `bc.lt_lodge_window` `window` 15,20 r2 [dusk, night]; `bc.lt_mill_window` `window` 46,25 r2 [dusk, night]; `bc.lt_office_window` `window` 49,12 r2 [dusk, night]; `bc.lt_smithy_glow` `fire` 33,12 r2.5 [dusk, night]; `bc.lt_adit_torch` `torch` 41,4 r2.5; `bc.lt_moon_river` `moon` 28,33 r4 [night].

Nodes (M5b placeholders; `wall` = on a solid tile used from beside it): `bc.nd_timber_0` `timber` 2,14 wall pool `campTimber`; `bc.nd_timber_1` `timber` 2,30 wall pool `campTimber`; `bc.nd_stone_0` `stone` 24,3 wall pool `campStone`; `bc.nd_stone_1` `stone` 12,3 wall pool `campStone`.

Givers (M5b placeholders): `bc.gv_foreman` npc `foreman` 45,13 facing s.


### 8.4 `bp_lodge`: The Bunkhouse

**The Bunkhouse** is one room split by a half wall (x 12, y 1-7; open below it). Points of interest:

- **The mess hall** (west) has the long table (`bl.mess_table`, 6x2), the iron range against the west wall
  (`bl.stove`, kind `oven`, a fire light), the wash basin on the north wall (`bl.basin`, a Blood wash), coat pegs and
  the wood box (a hiding spot).
- **The bunk room** (east) has two bunk rows (`bl.bunks_n`, `bl.bunks_s`, 7x2 each), each with a hiding spot under its
  end bunk, and the root cellar hatch (`bl.root_cellar`, a body spot).
- **Doors.** The front door is in the south wall and the side door in the east wall, matching the outside.

| Field | Value |
|---|---|
| `id` / `zoneId` | `bp_lodge` |
| `prefix` | `bl` |
| `name` | The Bunkhouse |
| `kind` / `profile` | `interior` / `small` |
| `size` | 24 x 12 |
| `biome` / `dark` | `house` / `false` |
| `worldRef` | `4.10` |

Portals (`lock: null`, `window: null`, `ships: "V1"`):

| id | tile | kind | to . toSpawn | oneWay | noise | elevationDelta | minProfile |
|---|---|---|---|---|---|---|---|
| `bl.front` | 6,11 | `door` | `bp_camp.lodge` | false | `door` | 0 | `small` |
| `bl.side` | 23,5 | `door` | `bp_camp.lodge_side` | false | `door` | 0 | `small` |

Spawns (`z: 0`): `front` 6,10 n; `side` 22,5 w.

Spots (`childOnly: false` unless marked): `bl.wood_box` hide `woodBox` 1,1; `bl.under_bunk_n` hide `underBed` 21,1; `bl.under_bunk_s` hide `underBed` 21,10; `bl.root_cellar` body `rootCellar` 10,9.

Props: `bl.stove` `oven` 0,3; `bl.basin` `basin` 9,0; `bl.mess_table` `decor` 6,4 footprint 4,4 6x2; `bl.bunks_n` `decor` 17,2 footprint 14,1 7x2; `bl.bunks_s` `decor` 17,9 footprint 14,9 7x2; `bl.pegs` `decor` 11,0.

Lights: `bl.lt_stove` `fire` 1,3 r2.5; `bl.lt_lamp_mess` `lamp` 7,7 r2.5; `bl.lt_lamp_bunks` `lamp` 17,5 r2.


### 8.5 `bp_mill`: Vane Sawmill

**Vane Sawmill** points of interest:

- the head saw (`bs.head_saw`, 3x2) beside the log carriage rails that cross the floor along y 7;
- the waterwheel gearing on the north wall (`bs.gearing`);
- the plank stack (`bs.plank_stack`, a task source of `planks`, like `fo.planks`);
- the sawdust pile (`bs.sawdust`, a hiding spot);
- the log chute down to the race (`bs.log_chute`, a body spot);
- the main door in the east wall and the yard door in the south wall, where daylight falls in.

| Field | Value |
|---|---|
| `id` / `zoneId` | `bp_mill` |
| `prefix` | `bs` |
| `name` | Vane Sawmill |
| `kind` / `profile` | `interior` / `small` |
| `size` | 24 x 14 |
| `biome` / `dark` | `house` / `false` |
| `worldRef` | `4.10` |

Portals (`lock: null`, `window: null`, `ships: "V1"`):

| id | tile | kind | to . toSpawn | oneWay | noise | elevationDelta | minProfile |
|---|---|---|---|---|---|---|---|
| `bs.door` | 23,7 | `door` | `bp_camp.mill` | false | `door` | 0 | `small` |
| `bs.yard` | 6,13 | `door` | `bp_camp.mill_yard` | false | `door` | 0 | `small` |

Spawns (`z: 0`): `door` 22,7 w; `yard` 6,12 n.

Spots (`childOnly: false` unless marked): `bs.sawdust` hide `sawdustPile` 3,2; `bs.log_chute` body `logChute` 1,11.

Props: `bs.head_saw` `decor` 11,5 footprint 10,5 3x2; `bs.gearing` `decor` 12,0; `bs.plank_stack` `taskSource` 18,12 item `planks`.

Lights: `bs.lt_lamp_saw` `lamp` 11,8 r2.5; `bs.lt_lamp_door` `lamp` 20,7 r2; `bs.lt_daylight` `shaft` 6,11 r2.5 [day, dusk].


### 8.6 `bp_woods`: Blackpine Woods

**Blackpine Woods** points of interest:

- **The skid road** (3 wide) runs in from `bw.camp`, west to the ford and on to the drowned adit (`bw.old_adit`
  [L]).
- **The vent trail** runs north from the road to the Workings' vent drift (`bw.vent`).
- **The felling slope** (north-east) has stumps, an axe left in one (WORLD 4.10), the head of the log chute
  (`bw.chute`, a one-way drop to the camp) with a lantern beside it, moonlight at night, and the hollow pine
  (`bw.hollow_pine`, a hiding spot) on the wolf loop below.
- **The kiln clearing** (centre-south) has two brick charcoal kilns (`bw.kiln_0` and `bw.kiln_1`, 2x2 each, warm fire
  lights). The collier stands before them in M5b.
- **The ford** (south-west) is shingle banks with shallow water and stepping boulders, deep pools on both sides, and
  the ford pool (`bw.ford_pool`, a body spot). The log jam (`bw.log_jam`, a hiding spot) is on its north bank.
- **The rest.** A glade west of the road is the boar's ground. A second wolf loop lies south of the kilns.

| Field | Value |
|---|---|
| `id` / `zoneId` | `bp_woods` |
| `prefix` | `bw` |
| `name` | Blackpine Woods |
| `kind` / `profile` | `exterior` / `small` |
| `size` | 52 x 40 |
| `biome` / `dark` | `forest` / `false` |
| `worldRef` | `4.10` |

Portals (`lock: null`, `window: null`, `ships: "V1"`):

| id | tile | kind | to . toSpawn | oneWay | noise | elevationDelta | minProfile |
|---|---|---|---|---|---|---|---|
| `bw.camp` | 51,22 | `forest_gate` | `bp_camp.woods` | false | `door` | 0 | `small` |
| `bw.vent` | 30,0 | `cave_mouth` | `bp_mine.vent` | false | `door` | 0 | `small` |
| `bw.chute` | 44,9 | `drop` | `bp_camp.chute_foot` | true | `oneWayDrop` | -4 | `small` |
| `bw.old_adit` | 0,30 | `cave_mouth` | `bp_deep.old_adit` | false | `door` | 0 | `large` |

Spawns (`z: 0`): `camp` 50,22 w; `vent` 30,1 s; `old_adit` 1,30 e.

Spots (`childOnly: false` unless marked): `bw.hollow_pine` hide `hollowTree` 34,18; `bw.brush_n` hide `brush` 28,8; `bw.log_jam` hide `logPile` 12,27; `bw.ford_pool` body `pool` 15,33.

Props: `bw.kiln_0` `decor` 22,26 footprint 22,26 2x2; `bw.kiln_1` `decor` 26,26 footprint 26,26 2x2.

Lights: `bw.lt_kiln_0` `fire` 23,28 r2.5; `bw.lt_kiln_1` `fire` 27,28 r2.5; `bw.lt_chute_lantern` `lantern` 43,10 r2.5 [dusk, night]; `bw.lt_moon_ford` `moon` 13,30 r4 [night]; `bw.lt_moon_slope` `moon` 40,7 r4 [night].

Nodes (M5b placeholders; `wall` = on a solid tile used from beside it): `bw.nd_timber_0` `timber` 35,13 wall pool `pineTimber`; `bw.nd_timber_1` `timber` 47,15 wall pool `pineTimber`; `bw.nd_timber_2` `timber` 19,20 wall pool `pineTimber`; `bw.nd_timber_3` `timber` 31,25 wall pool `pineTimber`; `bw.nd_timber_4` `timber` 13,25 wall pool `pineTimber`; `bw.nd_timber_5` `timber` 24,32 wall pool `pineTimber`; `bw.nd_resin_0` `resin` 28,15 wall pool `pineResin`; `bw.nd_resin_1` `resin` 41,24 wall pool `pineResin`; `bw.nd_herb_0` `herb` 21,24 pool `woodHerbs`; `bw.nd_herb_1` `herb` 16,26 pool `woodHerbs`; `bw.nd_mush_0` `mushroom` 30,29 pool `woodMush`; `bw.nd_mush_1` `mushroom` 6,31 pool `woodMush`; `bw.nd_stone_0` `stone` 11,31 wall pool `fordStone`; `bw.nd_stone_1` `stone` 17,29 wall pool `fordStone`.

Spawners (M5b placeholders): `bw.sp_wolf_n` `wolf` 38,19 leash 6 [dusk, night] path `bw.wolf_loop_n`; `bw.sp_wolf_s` `wolf` 38,32 leash 6 [dusk, night] path `bw.wolf_loop_s`; `bw.sp_boar` `boar` 10,22 leash 5 [day, dusk].

Givers (M5b placeholders): `bw.gv_collier` npc `collier` 24,30 facing n.

Paths: `bw.wolf_loop_n` `wolfLoop` 33,15 46,15 46,19 33,19; `bw.wolf_loop_s` `wolfLoop` 32,32 46,32 46,37 32,37.


### 8.7 `bp_mine`: Blackpine Workings

**Blackpine Workings** is dark, lit only by torches and lamps, plus daylight at the adit by day. Points of
interest:

- **The timbered adit** (x 21-23, tram rails down its middle) climbs north from `bm.adit` into **the ore chamber**
  (x 12-32, y 10-19). The chamber has:
  - tin lodes in its walls;
  - an ore cart (`bm.ore_cart_0`) and a hiding spot behind another (`bm.ore_cart`);
  - the old stope (`bm.stope`, a body spot);
  - the last shift's tally board on its north wall (`bm.tally_board`), one name chalked out;
  - a rat run.
- **The vent drift** (2-3 wide, planked) runs west to `bm.vent`. Moss grows at the vent, and a timber crib
  (`bm.timber_crib`, a hiding spot) stands beside the drift.
- **The winze gallery** (east) has deep water around the ladder shaft (`bm.winze` down to the Deep Level [L], boarded
  below) and a torch.
- **The powder niche** beyond the winze gallery holds the powder kegs (`bm.powder_kegs`).

| Field | Value |
|---|---|
| `id` / `zoneId` | `bp_mine` |
| `prefix` | `bm` |
| `name` | Blackpine Workings |
| `kind` / `profile` | `interior` / `small` |
| `size` | 44 x 30 |
| `biome` / `dark` | `cave` / `true` |
| `worldRef` | `4.10` |

Portals (`lock: null`, `window: null`, `ships: "V1"`):

| id | tile | kind | to . toSpawn | oneWay | noise | elevationDelta | minProfile |
|---|---|---|---|---|---|---|---|
| `bm.adit` | 22,29 | `cave_mouth` | `bp_camp.adit` | false | `door` | 0 | `small` |
| `bm.vent` | 0,8 | `cave_mouth` | `bp_woods.vent` | false | `door` | 0 | `small` |
| `bm.winze` | 36,10 | `hatch` | `bp_deep.winze` | false | `door` | -8 | `large` |

Spawns (`z: 0`): `adit` 22,28 n; `vent` 1,8 e; `winze` 36,11 n.

Spots (`childOnly: false` unless marked): `bm.ore_cart` hide `oreCart` 25,14; `bm.timber_crib` hide `timberCrib` 6,6; `bm.stope` body `oldStope` 30,19.

Props: `bm.tally_board` `decor` 20,9; `bm.powder_kegs` `decor` 39,3; `bm.ore_cart_0` `decor` 16,14.

Lights: `bm.lt_adit_torch` `torch` 23,26 r2.5; `bm.lt_lamp_chamber` `lamp` 18,13 r2.5; `bm.lt_lamp_tally` `lamp` 20,10 r2; `bm.lt_moss_vent` `moss` 4,8 r2; `bm.lt_torch_winze` `torch` 35,9 r2.5; `bm.lt_daylight` `shaft` 22,27 r3 [day, dusk].

Nodes (M5b placeholders; `wall` = on a solid tile used from beside it): `bm.nd_tin_0` `tinOre` 11,12 wall pool `mineTin`; `bm.nd_tin_1` `tinOre` 15,9 wall pool `mineTin`; `bm.nd_tin_2` `tinOre` 27,9 wall pool `mineTin`; `bm.nd_tin_3` `tinOre` 33,16 wall pool `mineTin`; `bm.nd_tin_4` `tinOre` 9,6 wall pool `mineTin`; `bm.nd_stone_0` `stone` 31,20 wall pool `mineStone`; `bm.nd_stone_1` `stone` 13,20 wall pool `mineStone`.

Spawners (M5b placeholders): `bm.sp_bats` `bat` 28,12 leash 8; `bm.sp_rats` `rat` 16,17 leash 6 path `bm.rat_run`.

Paths: `bm.rat_run` `patrol` 14,11 30,11 30,18 14,18.


### 8.8 `bp_office`: Company Office

**Company Office** is two rooms split by a wall (x 9, y 1-6; open below it). Points of interest:

- **The company store** (west) has a counter (stacked goods) with a hiding spot behind it and empty shelves on the
  north wall.
- **The manager's office** (east) has:
  - the payroll ledger on the desk (`bo.ledger_desk`), open at a torn page;
  - the safe and the map table;
  - the dead telephone on the north wall;
  - a wardrobe (a hiding spot);
  - the strongroom door (`bo.strongroom`, a body spot) against the north wall.
- **The door** is in the south wall.

| Field | Value |
|---|---|
| `id` / `zoneId` | `bp_office` |
| `prefix` | `bo` |
| `name` | Company Office |
| `kind` / `profile` | `interior` / `medium` |
| `size` | 18 x 11 |
| `biome` / `dark` | `house` / `false` |
| `worldRef` | `4.10` |

Portals (`lock: null`, `window: null`, `ships: "V1"`):

| id | tile | kind | to . toSpawn | oneWay | noise | elevationDelta | minProfile |
|---|---|---|---|---|---|---|---|
| `bo.door` | 8,10 | `door` | `bp_camp.office` | false | `door` | 0 | `medium` |

Spawns (`z: 0`): `door` 8,9 n.

Spots (`childOnly: false` unless marked): `bo.behind_counter` hide `behindCounter` 7,4; `bo.wardrobe` hide `wardrobe` 16,8; `bo.strongroom` body `strongroom` 12,1.

Props: `bo.shelves` `decor` 3,0; `bo.ledger_desk` `decor` 13,3; `bo.safe` `decor` 16,1; `bo.map_table` `decor` 11,6 footprint 11,6 2x2; `bo.telephone` `decor` 10,0.

Lights: `bo.lt_desk_lamp` `lamp` 13,4 r2; `bo.lt_store_lamp` `lamp` 5,6 r2.


### 8.9 `bp_smithy`: The Forge

**The Forge** points of interest: the forge hearth against the north wall (`bf.forge`, 3x1, the warmest light in
Blackpine), the anvil, the quench trough (`bf.trough`, kind `basin`, a Blood wash), the tool rack on the west wall,
the coal bin (a hiding spot) and the door in the south wall. Ada Kerrow, the smith, stands at the anvil in M5b; the
Forge is where M5b's crafting happens.

| Field | Value |
|---|---|
| `id` / `zoneId` | `bp_smithy` |
| `prefix` | `bf` |
| `name` | The Forge |
| `kind` / `profile` | `interior` / `medium` |
| `size` | 16 x 11 |
| `biome` / `dark` | `house` / `false` |
| `worldRef` | `4.10` |

Portals (`lock: null`, `window: null`, `ships: "V1"`):

| id | tile | kind | to . toSpawn | oneWay | noise | elevationDelta | minProfile |
|---|---|---|---|---|---|---|---|
| `bf.door` | 7,10 | `door` | `bp_camp.smithy` | false | `door` | 0 | `medium` |

Spawns (`z: 0`): `door` 7,9 n.

Spots (`childOnly: false` unless marked): `bf.coal_bin` hide `coalBin` 13,2.

Props: `bf.forge` `decor` 7,1 footprint 6,1 3x1; `bf.anvil` `decor` 7,4; `bf.trough` `basin` 3,3; `bf.tool_rack` `decor` 0,5.

Lights: `bf.lt_forge` `fire` 7,2 r3; `bf.lt_lamp` `lamp` 12,7 r2.

Givers (M5b placeholders): `bf.gv_smith` npc `smith` 10,4 facing w.


### 8.10 `bp_deep`: The Deep Level

**The Deep Level** is dark. Points of interest:

- **The winze landing** is at the top, where the ladder comes down from the Workings (`bd.winze`).
- **The flooded stope** (centre) is deep water with shallow margins, crossed by two plank walkways (along y 12 and
  x 20). Moss grows on it, and the sump (`bd.sump`, a body spot) is at its south margin.
- **The old workings** (east) are ore pillars, with tin in the pillars and the walls, a VANE TIN CO crate, a hiding
  spot behind a pillar and a rat run.
- **The miners' refuge** (south-west) has a table, a bunk (a hiding spot) and a dead man's lamp still burning.
- **The drowned adit** runs west to the woods (`bd.old_adit`), with a torch at its mouth.

| Field | Value |
|---|---|
| `id` / `zoneId` | `bp_deep` |
| `prefix` | `bd` |
| `name` | The Deep Level |
| `kind` / `profile` | `interior` / `large` |
| `size` | 40 x 28 |
| `biome` / `dark` | `cave` / `true` |
| `worldRef` | `4.10` |

Portals (`lock: null`, `window: null`, `ships: "V1"`):

| id | tile | kind | to . toSpawn | oneWay | noise | elevationDelta | minProfile |
|---|---|---|---|---|---|---|---|
| `bd.winze` | 20,0 | `hatch` | `bp_mine.winze` | false | `door` | 8 | `large` |
| `bd.old_adit` | 0,20 | `cave_mouth` | `bp_woods.old_adit` | false | `door` | 0 | `large` |

Spawns (`z: 0`): `winze` 20,1 s; `old_adit` 1,20 e.

Spots (`childOnly: false` unless marked): `bd.refuge_bunk` hide `bunk` 3,24; `bd.ore_pillar` hide `orePillar` 34,12; `bd.sump` body `sump` 24,19.

Props: `bd.refuge_table` `decor` 6,22; `bd.tin_crate` `decor` 34,6.

Lights: `bd.lt_refuge_lamp` `lamp` 6,23 r2; `bd.lt_moss_0` `moss` 14,9 r2; `bd.lt_moss_1` `moss` 28,16 r2; `bd.lt_torch_adit` `torch` 3,20 r2; `bd.lt_moss_workings` `moss` 36,8 r2.

Nodes (M5b placeholders; `wall` = on a solid tile used from beside it): `bd.nd_tin_0` `tinOre` 32,5 wall pool `deepTin`; `bd.nd_tin_1` `tinOre` 39,10 wall pool `deepTin`; `bd.nd_tin_2` `tinOre` 33,16 wall pool `deepTin`; `bd.nd_tin_3` `tinOre` 39,18 wall pool `deepTin`; `bd.nd_stone_0` `stone` 35,14 wall pool `deepStone`; `bd.nd_stone_1` `stone` 31,21 wall pool `deepStone`; `bd.nd_mush_0` `mushroom` 5,25 pool `deepMush`; `bd.nd_mush_1` `mushroom` 9,21 pool `deepMush`.

Spawners (M5b placeholders): `bd.sp_bats` `bat` 20,12 leash 8; `bd.sp_rats` `rat` 34,10 leash 6 path `bd.rat_run`.

Paths: `bd.rat_run` `patrol` 32,7 37,7 37,19 32,19.


## 9. Code that reads the maps

### 9.1 The pre-seed: `sim/MapSites.ts` and its call sites (section 1, second row)

One new server file holds every place the server takes from the map, and every current site calls it (X5). The
pre-seed returns Hollowmere's values in every room, so no behaviour changes and every existing server test passes
unchanged. Session 5J owns the bodies.

`apps/server/src/sim/MapSites.ts` (new):

```ts
// GDD 3.13 and WORLD 4.3: the places of the room's map that the server uses, in one file (round 5, X5). Every
// site that named 'overworld', a `square_<n>` spawn, `ov.bell` or `ov.teaching_clue` calls these instead.
// The pre-seed plays Hollowmere in every room; Session 5J owns the bodies (and makes `mapIdOfRoom` read
// `Settings.map`). No other file names a map's hub, spawns or props.
import { MAP_IDS, maps, scenes, type MapId, type Prop, type SceneId } from '@wdi/content';
import type { PartyRoom } from '../rooms/PartyRoom';

/** A spawn of a map: the scene and the spawn id inside it. */
export interface SpawnSite {
  sceneId: SceneId;
  spawn: string;
}

interface Sites {
  hub: SceneId;
  scenes: readonly SceneId[];
  startSpawns: readonly SpawnSite[];
  meetingSpawns: readonly SpawnSite[];
  bell: Prop | undefined;
  teachingClue: Prop | undefined;
  kitChest: Prop | undefined;
}

const siteOf = (ref: string): SpawnSite => {
  const dot = ref.indexOf('.');
  return { sceneId: ref.slice(0, dot) as SceneId, spawn: ref.slice(dot + 1) };
};

/** Built once per process from `maps/<id>.json` (immutable, shared by every room). */
const SITES = new Map<MapId, Sites>(
  MAP_IDS.map((id) => {
    const map = maps[id];
    const prop = (propId: string) => scenes[map.hub].props.find((p) => p.id === propId);
    return [
      id,
      {
        hub: map.hub,
        scenes: map.scenes,
        startSpawns: map.startSpawns.map(siteOf),
        meetingSpawns: map.meetingSpawns.map(siteOf),
        bell: prop(map.bell),
        teachingClue: prop(map.teachingClue),
        kitChest: prop(map.kitChest),
      },
    ] as const;
  }),
);

const sitesOf = (room: PartyRoom): Sites => SITES.get(mapIdOfRoom(room))!;

/** The map the room plays (GDD 3.13). Pre-seed: Hollowmere; 5J reads `room.state.settings.map`. */
export function mapIdOfRoom(_room: PartyRoom): MapId {
  return 'hollowmere';
}

/** The hub: the exterior with the Emergency Bell, where the seats start and meetings spread everyone. */
export function hubOf(room: PartyRoom): SceneId {
  return sitesOf(room).hub;
}

/** First placement spreads the seats over these, by ordinal (M3); at least `players.max` of them. */
export function startSpawnsOf(room: PartyRoom): readonly SpawnSite[] {
  return sitesOf(room).startSpawns;
}

/** Everyone is spread over these, by ordinal, when a meeting opens and again at immunity; at least `players.max`. */
export function meetingSpawnsOf(room: PartyRoom): readonly SpawnSite[] {
  return sitesOf(room).meetingSpawns;
}

/** The Emergency Bell prop on the hub (`act.bell`). */
export function bellOf(room: PartyRoom): Prop | undefined {
  return sitesOf(room).bell;
}

/** The prop on the hub where the grace-phase teaching clue lies (GDD 2 step 5). */
export function teachingClueOf(room: PartyRoom): Prop | undefined {
  return sitesOf(room).teachingClue;
}

/** The kit chest prop on the hub. No server code reads it yet; a session that does calls this. */
export function kitChestOf(room: PartyRoom): Prop | undefined {
  return sitesOf(room).kitChest;
}

/** The scenes of the room's map (GDD 3.13: a closed graph; every portal stays inside it). */
export function mapScenesOf(room: PartyRoom): readonly SceneId[] {
  return sitesOf(room).scenes;
}
```

**The sites it replaces.** Found with
`grep -rn "overworld\|square_\|ov\.\(bell\|teaching_clue\|chest\)\|kitChest\|SCENE_IDS\|SCENE_KEYS\|sceneIdx !== 0" apps/server/src`
on 265bda9 (line numbers of that commit). The last column is what landed, with the working tree's lines after the
pre-seed:

| Site (265bda9) | At 265bda9 | Landed (working tree) |
|---|---|---|
| `sim/Actions.ts:10` and `:131-141` (`handleBell`) | `const BELL = scenes.overworld.props.find(... 'ov.bell')`; `actor.sceneIdx !== 0` (index 0 is the overworld); `BELL.x`, `BELL.y` | `Actions.ts:143-163`: `const bell = bellOf(room)` (`:146`); `sceneKey(actor.sceneIdx) !== hubOf(room)` (`:148`); `bell.x`, `bell.y`. The `scenes` import went; `bellOf` and `hubOf` are imported at `:8` |
| `sim/Portals.ts:110-129` (`placeNewPlayers`) | ``enterScene(..., 'overworld', `square_${p.ordinal % 10}`, false)`` | `Portals.ts:116-143`: `const starts = startSpawnsOf(room)` (`:128`); `const site = starts[p.ordinal % starts.length]!`; `enterScene(..., site.sceneId, site.spawn, false)` |
| `sim/Meeting.ts:10-16` (`placeAtSquare`, called at `openMeeting` and `enterImmunity`) | ``enterScene(..., 'overworld', `square_${p.ordinal % 10}`, false, announce)`` | `Meeting.ts:17-27`: the same through `meetingSpawnsOf(room)` (`:19`); the function keeps its name (`deck-wire.md` 8.1: `openMeeting` calls 5F's `onMeetingOpenDisguise` before it, `Meeting.ts:45-46`) |
| `sim/Meeting.ts:141` (`startReveal`) | the ejected seat's `killed` with `sceneId: 'overworld'` | `Meeting.ts:155`: `sceneId: hubOf(room)` |
| `sim/Clues.ts:147-155` (`spawnTeachingClue`) | `scenes.overworld.props.find(... 'ov.teaching_clue')`; `nearestPortalTile('overworld', ...)`; `spawnClue(room, 'overworld', ...)` | `Clues.ts:149-165`: `teachingClueOf(room)` (`:153`); `const hub = hubOf(room)` (`:155`) in both calls |
| `sim/npc/world.ts:14-16` (`BASIN_SCENES`) and `:140-150` (`runFlee`) | basins of every scene of `SCENE_IDS`; the Killer NPC's run ends at `'overworld'` | `npc/world.ts:17-25`: `basinScenesOf(room)`, the basins of `mapScenesOf(room)` (`:18`, cached per scene list); `runFlee` at `:152-166`: `const hub = hubOf(room)` (`:154`), `here === hub`, the goal `s === hub`; `firstPortalToward(..., mapScenesOf(room))` (`:160`) |
| `sim/npc/walk.ts:158-172` (`firstPortalToward`) | `!SCENE_IDS.includes(to)` | `npc/walk.ts:162-191`: a new last parameter `inMap: readonly SceneId[]`; `!inMap.includes(to)`. `runFlee` is its only caller |
| `rooms/handlers/lobby.ts:341` | a comment naming the `square_<n>` spawns | `lobby.ts:341`: "the map's start spawns" |

The comments above `placeNewPlayers`, `placeAtSquare`, `handleBell`, `spawnTeachingClue`, `runFlee` and
`firstPortalToward` change with them. `npc/world.ts` and `npc/walk.ts` stay 5H's files (`npc.md` part 1, section 5).

**Sites that stay as they are:**

- `rooms/PartyRoom.ts:99` (94 at 265bda9) creates a `SceneState` for every id of `SCENE_KEYS` in `onCreate`, and
  `rooms/handlers/movement.ts:15` (`registerMovement`, called from `onCreate`) seeds the doors of the scenes it
  finds. This is the scene creation 5J owns (9.2).
- `sim/World.ts:6-8`: `SCENE_KEYS` is the wire index (`SCENE_IDS` order, every map), and `sceneKey`'s
  `'overworld'` fallback decodes an index that names no scene; neither is a place on a map.
- `sim/RoomSim.ts:29` and `:71`: a seat's `sceneIdx` is 0 until it is placed, so a joining client's first view
  holds scene 0's state (`Visibility.ts:28`, 26 at 265bda9). Placement moves it.
- `sim/Win.ts:136` (134 at 265bda9; `resetToLobby`) clears every `SceneState` the room holds.
- The kit chest: no server code reads it today. `kitChestOf` is there for the session that does.

**The protocol.** `lobby.settings` gains `map?: string` (`packages/shared/src/protocol/index.ts`, with
`docs/PROTOCOL.md` regenerated), so 5J's picker can send it. The server ignores the field until 5J reads it.

**Test.** `apps/server/test/mapSites.test.ts` (new) asserts Hollowmere's values: the hub `overworld`, the start and
meeting spawns `overworld.square_0` to `square_9`, `ov.bell`, `ov.teaching_clue`, `ov.chest`, and the 15
scenes in `SCENE_IDS` order. Its room stub carries `state.settings.map`, so it still holds once 5J reads it.

### 9.2 What 5J changes (PR 5)

5J edits only the bodies of `sim/MapSites.ts`, `handleSettings`'s map branch and the scene creation in
`PartyRoom`. `npc/world.ts`, `npc/walk.ts`, `Meeting.ts`, `Actions.ts`, `Portals.ts` and `Clues.ts` are not
5J's: they reach the map only through `MapSites.ts`.

**Server.**

- **The map helpers.** `mapIdOfRoom` returns `mapIdOf(room.state.settings.map)`; the other helpers already read
  that map's file.
- **The lobby setting.** `handleSettings` (`rooms/handlers/lobby.ts`) accepts `map`: the leader only, in the
  lobby, a value in `MAP_IDS` and nothing else (`ErrorCode.cannot`, "bad setting"), whatever the mode, all or
  nothing with the other fields. The value survives `resetToLobby`.
- **Scene states.** `PartyRoom`'s scene creation (with the door seeding of `registerMovement`, which walks the
  scenes it created) stays the one place that decides which `SceneState`s a room holds. Creating every id of
  `SCENE_KEYS`, as today, covers both maps once 5J's scenes land, and views carry only the viewer's own scene
  (`GameState.scenes` is `.view()`), so the other map's scenes cost nothing on the wire. If 5J narrows the room to
  `mapScenesOf(room)`, it does so there, keeping scene 0's state for unplaced seats or moving their first view.
  `World.ts`'s scene index stays `SCENE_IDS.indexOf`.
- **The quick mode** never reads the map.

**Client.**

- `ui/lobby/MapPicker.ts` renders the map row (frozen test id `map-select`): the name, the blurb and the
  `thumbnail` image for every map whose `modes` holds the chosen mode. The leader gets a picker, everyone else a
  read-only line, and the row is hidden in the quick mode (`ui/Lobby.ts` already hides the landed slot,
  `data-testid="lobby-map"`, through `showsMapRow`; the picker may hide its own row as well). A44's `LobbySettings` gains `map: string`.
- 5J fills only `ui/lobby/MapPicker.ts`; `ui/Lobby.ts`, `net/protocol.ts`, `net/NetworkService.ts` and
  `net/mock.ts` are pre-seeded and are not 5J's.
- `ui/copy/world.ts` `hud.scene` stays the scene name.
- The World loads the map's art per SPRITES 10.13.

**Bots and NPCs** need nothing from 5J: the NPC seats take the hub and the spawns through `MapSites.ts`, and their
walk and the bots' walk read portals from content.

## 10. Tests

**`packages/content/test/world.test.ts`, pre-seed** (13 cases, landed; they passed on 265bda9 with the patch and pass on
the tree).
It uses only the 15 current scenes; the cases that need a building, a material layer, a light or a spawner add one
to a copy of the content:

- the first 15 `SCENE_IDS` are pinned;
- Hollowmere is first in `MAP_IDS` and the default, with the overworld as its hub; `mapOf` and `mapIdOf`;
- every scene is in exactly one map;
- the validator refuses: a map without a Small cave; a portal leaving its map and a scene in no map; a scene
  unreachable from the hub; too few start spawns; a bell that is not a bell; a duplicate prefix; a cave that is
  not dark; a building door off the south and east faces; material mismatches (and accepts a matching layer); a
  spawner on an unknown path; an unprefixed light;
- every map has a Small forest and a dark Small cave.

```ts
import { describe, expect, it } from 'vitest';
import {
  content,
  DEFAULT_MAP,
  MAP_IDS,
  mapIdOf,
  mapOf,
  maps,
  SCENE_IDS,
  scenes,
  validateContent,
  type Content,
  type Scene,
} from '../src/index.js';

function broken(edit: (c: Content) => void): string[] {
  const copy = structuredClone(content);
  edit(copy);
  return validateContent(copy);
}
const hit = (text: string) => expect.arrayContaining([expect.stringContaining(text)]);

/** A material layer that agrees with the grid: planks on floor, walls on solid, `P` under props on walls. */
const materialOf = (scene: Scene): string[] =>
  scene.grid.map((row, y) =>
    [...row]
      .map((ch, x) => {
        if (ch === '.' || ch === 'S') return 'w';
        return ch === '#' && scene.props.some((p) => p.x === x && p.y === y) ? 'P' : 'W';
      })
      .join(''),
  );

describe('maps and frozen ids (GDD 3.13, WORLD 4.3)', () => {
  it('keeps the 15 scene ids of 2026-10-10 first and in order', () => {
    expect(SCENE_IDS.slice(0, 15)).toEqual([
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
    ]);
  });

  it('ships Hollowmere first, the default map, with the overworld as its hub', () => {
    expect(MAP_IDS[0]).toBe('hollowmere');
    expect(DEFAULT_MAP).toBe('hollowmere');
    expect(maps.hollowmere.hub).toBe('overworld');
    expect(maps.hollowmere.bell).toBe('ov.bell');
    expect(mapOf('cellar')).toBe('hollowmere');
    expect(mapIdOf('nowhere')).toBe('hollowmere');
  });

  it('puts every scene in exactly one map', () => {
    const listed = MAP_IDS.flatMap((id) => maps[id].scenes);
    expect([...listed].sort()).toEqual([...SCENE_IDS].sort());
  });

  it('refuses a map without a Small cave', () => {
    expect(broken((c) => (c.scenes.cave_entry.biome = 'house'))).toEqual(
      hit('map hollowmere: has no cave scene'),
    );
  });

  it('refuses a portal that leaves its map, and a scene in no map', () => {
    const errors = broken((c) => {
      c.maps.hollowmere.scenes = c.maps.hollowmere.scenes.filter((s) => s !== 'cellar');
    });
    expect(errors).toEqual(hit('portal ov.well leaves the map for cellar'));
    expect(errors).toEqual(hit('scene cellar belongs to no map'));
  });

  it('refuses a scene unreachable from the hub', () => {
    expect(
      broken((c) => {
        c.scenes.overworld.portals = c.scenes.overworld.portals.filter((p) => p.id !== 'ov.widow');
      }),
    ).toEqual(hit('widow_parlour is unreachable from the hub at small'));
  });

  it('refuses too few start spawns and a bell that is not a bell', () => {
    const errors = broken((c) => {
      c.maps.hollowmere.startSpawns = c.maps.hollowmere.startSpawns.slice(0, 9);
      c.maps.hollowmere.bell = 'ov.pump';
    });
    expect(errors).toEqual(hit('startSpawns has 9, needs 10'));
    expect(errors).toEqual(hit('bell ov.pump has kind pump, expected bell'));
  });

  it('refuses a duplicate scene prefix', () => {
    expect(broken((c) => (c.scenes.cellar.prefix = 'ch'))).toEqual(hit('prefix ch is also'));
  });
});

describe('scene world fields (GDD 3.13)', () => {
  it('requires every cave to be dark', () => {
    expect(broken((c) => (c.scenes.cave_entry.dark = false))).toEqual(
      hit('scene cave_entry: a cave scene must be dark'),
    );
  });

  it('keeps building doors on the south or east face', () => {
    expect(
      broken((c) => {
        c.scenes.overworld.buildings = [
          { id: 'ov.bld_tavern', art: 'tavern', footprint: { x: 25, y: 28, w: 12, h: 7 } },
        ];
      }),
    ).toEqual(hit('door ov.tavern_front is not on the south or east face of ov.bld_tavern'));
  });

  it('checks the material layer against the grid', () => {
    expect(broken((c) => (c.scenes.widow_bedroom.material = materialOf(c.scenes.widow_bedroom)))).toEqual([]);
    const floor = (s: Scene) => {
      const y = s.grid.findIndex((row) => row.includes('.'));
      return { x: s.grid[y]!.indexOf('.'), y };
    };
    expect(
      broken((c) => {
        const s = c.scenes.widow_bedroom;
        const m = materialOf(s);
        const { x, y } = floor(s);
        m[y] = m[y]!.slice(0, x) + 'T' + m[y]!.slice(x + 1);
        s.material = m;
      }),
    ).toEqual(hit('material "T" at'));
    expect(
      broken((c) => {
        const s = c.scenes.widow_bedroom;
        const m = materialOf(s);
        m[0] = 'P' + m[0]!.slice(1);
        s.material = m;
      }),
    ).toEqual(hit('material at 0,0 must be "P" exactly where'));
  });

  it('keeps lights, nodes, spawners and givers in their scene', () => {
    const errors = broken((c) => {
      const forest = c.scenes.forest;
      const corner = forest.paths[0]!.points[0]!;
      forest.spawners = [{ id: 'fo.sp_wolf', mob: 'wolf', ...corner, leashTiles: 6, pathId: 'fo.nowhere' }];
      forest.lights = [{ id: 'zz.lt_moon', kind: 'moon', x: 1, y: 1, radiusTiles: 4 }];
    });
    expect(errors).toEqual(hit('spawner fo.sp_wolf walks unknown path fo.nowhere'));
    expect(errors).toEqual(hit('light zz.lt_moon lacks prefix fo.'));
  });

  it('has a forest and a cave open at Small in every map', () => {
    for (const id of MAP_IDS) {
      const small = maps[id].scenes.map((s) => scenes[s]).filter((s) => s.profile === 'small');
      expect(
        small.some((s) => s.biome === 'forest'),
        id,
      ).toBe(true);
      expect(
        small.some((s) => s.biome === 'cave' && s.dark === true),
        id,
      ).toBe(true);
    }
  });
});
```

**5J PR 2 adds** the Blackpine cases (they ran in the 19:00 scratch copy with stub scenes):

- `MAP_IDS` is `['hollowmere', 'blackpine']`, and Blackpine's hub is `bp_camp`;
- a portal leaving its map: `bc.woods` pointed at `forest.gate` gives "portal bc.woods leaves the map for forest";
- a scene unreachable from the hub: `bp_camp` without `bc.mill` and `bc.mill_yard` gives "bp_mill is unreachable
  from the hub at small";
- a duplicate prefix: `bp_deep` with prefix `bm`;
- the material layer of the real scenes: `T` at 40,18 of `forest_deep` (a trail tile) is "solid on a walkable
  tile", and `W` at 28,20 of `bp_camp` (under `bc.bell`) "must be `P`";
- `bw.sp_wolf_n` on an unknown path, and a light of `bp_woods` with the prefix `zz.`;
- the overworld's real buildings: `ov.bld_tavern` grown to 13 x 8 puts `ov.tavern_front` off its south face.

**Fixture updates in existing tests:**

- `content.test.ts` (pre-seed): `maxStandingSilhouettePx` is 112, `maxSilhouetteTiles` 1.75 and
  `characterHeadsTall` 5. The existing check, `cos(camera.tiltXDeg)` rounded equals `verticalSquash`, holds as it
  is: cos 60° = 0.5.
- `scenes.test.ts` (5J PR 1 and 2; the pre-seed leaves it as it is, since one map holds all 15 scenes):
  - the `WORLD` fixture gains the 10 new scenes (profile, size, portals as in section 8; the Fenwood and the
    Flooded Gallery are Medium), `fo.deep` and `ce.gallery`;
  - the one-way list becomes `['ba.loft', 'bw.chute', 'fd.sinkhole', 'fo.log', 'mu.balcony']`;
  - "every open scene is reachable from the overworld" becomes "from each map's hub, over that map's scenes".
- **Server, pre-seed.** `apps/server/test/mapSites.test.ts` (section 9.1). Every existing server test passes
  unchanged.
- **Server, 5J PR 5.** A lobby test that `lobby.settings {map: 'blackpine'}` from the leader in the lobby sets
  `Settings.map`, and that an unknown id or a non-leader is refused. A Start on Blackpine places the seats on
  `bp_camp.yard_*`, a meeting spreads everyone there, the Bell rings only on `bp_camp` at `bc.bell`, and the
  teaching clue lies at `bc.teaching_clue`.
- **Exporter.** See SPRITES 10.15.

---

## Appendix. Round-5 scene skeletons (material layer drafts)

> Companion to section 8. One sketch per new scene, one character per tile, drawn north-up as in
> WORLD 4.4. Letters are the material legend of GDD 3.13 (section 2): floor `g l m p d c f w r s ~ u =`,
> solid `O W T R X F K P`. The grid markers `D`, `S`, `H` and `B` stand where the portals, spawns and spots of the
> outline tables are. The grid follows from the sketch: a floor letter is `.`, a solid letter is `#`.
>
> Each sketch was painted from the outline's rectangles and checked with the repo's own validator and scene tests
> (a scratch copy of `packages/content` with these sketches as stub scenes: 90 of 90 content tests pass, including
> `scenes.test.ts`'s walkable-world flood at every profile). That check predates F4, which moved the Fenwood and
> the Flooded Gallery to Medium; the grids are unchanged, and only the profiles and the `minProfile` of the
> portals touching them differ (sections 7 and 8).
>
> **The rectangles are the walkable skeleton, not the final shape.** Session 5J keeps every tile that carries an
> object, every trail's connection and every loop. It then rounds the clearings, breaks the straight tree edges,
> widens or narrows trails within 2-3 tiles, and scatters boulders, stumps, reeds and brush, so that no area reads
> as a box.

### `forest_deep`: The Fenwood (48 x 36, forest, medium)

```
    000000000011111111112222222222333333333344444444
    012345678901234567890123456789012345678901234567
  0 TTTTTTTTDTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
  1 TTTTTTTlSlTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
  2 TTTTTTTlllTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
  3 TTTTTTTlllTTTTTTTTTTTTTTTTTTTTTTTTTTTTTPPPPTTTTT
  4 TTTlllllllllllTTTTTTTTTTTTTTTTTTTTTTTTTPPPPTTTTT
  5 TTTlXlllllllllTTTTTTTTTTTTTTTTTTTTTTTTTPPPPTTTTT
  6 TTTlXllllllllllllllTTTTTTTTTTTTTTdddPPdddddTTTTT
  7 TTTlPlllllllllllDllTTTTTTTTTTTTTTdddPPdddddTTTTT
  8 TTTlXllllllllllllllTTTTTTTTTTTTTTddddddddddTTTTT
  9 TTTlXllllllllllllllTTTTTTTTTTTTTTdBddddddddTTTTT
 10 TTTlTllllllllllllllllllTTTTTTTTTTddddddddddTTTTT
 11 TTTllllllllllllllllllllTTTTTTTTTTddddddllldTTTTT
 12 TTTTTTTllllllllllllllllTTTTTTTTTTTTTTTTlllTTTTTT
 13 TTTTTTTTTTTTTTTTTTTglllgggggggTTTTTTTTTlllTTTTTT
 14 TTTTTTTTTTTTTTTTTTTgggggggggggTTTTTTTTTlllTTTTTT
 15 TTTTTTTTTTTTTTTTTTTggggPPgggggTTTTTTTTTlllTTTTTT
 16 TTTTTTTTTTTTTTTTTTTggggPPgggggTTHTTTTTTlllTTTTTT
 17 TTTTTTTTTTTTTTTTTTTggggggggggglllllllllllllllllT
 18 TTTTTTTTTTTTTTTTTTTgggggggggggllllllllllllllllSD
 19 TTTTTTTTTTTTTTTTTTTggggggggggglllllllllllllllllT
 20 TTTTTTTTTTTTTTTTTTTgggggggggggTTTTTTTTTTTTTTTTTT
 21 TTTTTTTTTTTTTTTTTTTgwwgglllllgTTTTTTTTTTTTTTTTTT
 22 TTggggggggggggggggggwwgTlllllTTTTTTTTTTTTTTTTTTT
 23 TTggggggggggggggggggwwgTlllllTTTTTTTTTTTTTTTTTTT
 24 TT~~~~~~~~~~~~~~~~uuuuuTlllllllllllllllllllllTTT
 25 TT~~~~~~~~~~~~~~~~uuuuuTTTTTlTTTTTTTTTTTTTTTlTTT
 26 TT~~~~H~wwwwwwwwwwwwww~TTTTTlTTTTTTTTTTTTTTTlTTT
 27 TT~~~~~~wwwwwwwwwwwwww~TTTTTlTTTTTdddddTTTTTlHTT
 28 TT~OOOOO~www~~~~~~~~~~~TTTTTlllllldddddTTTTTlTTT
 29 TT~OOOOO~www~~~~~~~~~~~TTTTTlTTTTTdddddTTTTTlTTT
 30 TT~OOOOO~~P~~~~~~~~~~~~TTTTTlTTTTTTTTTTTTTTTlTTT
 31 TT~OOOOO~~~~~~BOOOOOO~~TTTTTlTTTTTTTTTTTTTTTlTTT
 32 TT~OOOOO~~~~~~~OOOOOO~~TTTTTlllllllllllllllllTTT
 33 TTuuuuu~~~~~~~~OOOOOO~~TTTTTTTTTTTTTTTTTTTTTTTTT
 34 TTuuuuu~~~~~~~~~~~~~~~~TTTTTTTTTTTTTTTTTTTTTTTTT
 35 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
```

### `cave_gallery`: The Flooded Gallery (40 x 28, cave, medium)

```
    0000000000111111111122222222223333333333
    0123456789012345678901234567890123456789
  0 XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
  1 XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
  2 XXXXXXXXXXXXXXXrrrrrrrrrrXXXXXXXXXXXXXXX
  3 XXXXXXXXXXXXXXXrPrrrrrrrrXXrrrrrrrrrrrXX
  4 XXX~~~~~~~~~~~XrrrrrrrrrrHXrrrrrrrPPrrXX
  5 XXX~OOOOOOOOO~XrrrrrPrrrrXXrrrrrrrPPrrXX
  6 XXX~OOOOOOOOO~Xrrrrr=rrrrXXrrrrrrrPPrrXX
  7 XXX~OOOOOOOOO~Xrrrrr=rrrrXXrrrrSrrrrrrXX
  8 XXX~OOOOOOOOO~Xrrrrr=rrrrXXrrrrrrrrrrrXX
  9 XXX~OOOOOOOOO~XXXXXr=rXXXXXrrrrrrrrrrrXX
 10 XXXwwwwwwwwwwwXXXXXr=rXXXXXrrrrrrrrrrrXX
 11 XXX~OOOOOOOOO~XXXXXr=rXXXXXrrrrrrrrrrrXX
 12 XXX~OOOOOOOOO~XXXXXr=rXXXXrrrrrrrrrrrrXX
 13 XXX~OOOOOOOOO~XXXXXr=rXXXXrrrXXXXXXXXXXX
 14 XXX~OOOOOOOOO~rrrrrrrrrrrrrrrXXXXXXXXXXX
 15 XXX~OOOOOOOOO~rrrrrrrrrrrrrrrXXXXXXXXXXX
 16 Xrrrr~~~~~~~~~rrrrrrrrrrrrrrrrrrrrRRRXXX
 17 XrrrrXXXXXXXBXrrrrrrrrrrrrrrrrHrrrRRRXXX
 18 XrrrrXXXXXXXXXrrrrrrrrrrrrrrrrrrrrRRRXXX
 19 XrrrrXXXXXXXXXrrrrrrrrrrrrrXRRRRRRRRRXXX
 20 DSrrrXXXXXXXXXrrrrrrrrrrrrrXRRRRRRRRRXXX
 21 XrrrrXXXXXXXXXXXXXXrrrXXXXXXRRRRRRRRRXXX
 22 XrrrrXXXXXXXXXXXXXXrrrXXXXXXRRRRRRRRRXXX
 23 XXXXXXXXXXXXXXXXXXXrrrXXXXXXRRRRRRRRRXXX
 24 XXXXXXXXXXXXXXXXXXXrrrXXXXXXRRRRRRRRRXXX
 25 XXXXXXXXXXXXXXXXXXXrrrXXXXXXXXXXXXXXXXXX
 26 XXXXXXXXXXXXXXXXXXXrSrXXXXXXXXXXXXXXXXXX
 27 XXXXXXXXXXXXXXXXXXXXDXXXXXXXXXXXXXXXXXXX
```

### `bp_camp`: Blackpine Camp (56 x 40, village, small)

```
    00000000001111111111222222222233333333334444444444555555
    01234567890123456789012345678901234567890123456789012345
  0 XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
  1 XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
  2 XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
  3 XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXDXXXXXXXXXXXXXXX
  4 TTTgggggggggggggggggggggggggggggggggggggSgggggggggdddddF
  5 TTTggggggggggggggggggggggggggggggggggggg=gggggggggdddddF
  6 TTTggggggggggggggggggggggggggggggggggggg=gggPPPPPPPPdddF
  7 TTTggggggggggggggggggggggggggPPPPPPPgggg=gggPPPPPPPPdddF
  8 TTTggggggggggggggggggggggggggPPPPPPPgggg=gggPPPPPPPPdddF
  9 TTTggggggggggggggggggggggggggPPPPPPPgggg=gggPPPPPPPPdddF
 10 TTTggSgggggggggggggggggggggggPPPPPPPgggg=gggPPPPPPPPdddF
 11 TTTggggggggggggggggggggggggggPPPDPPPgggg=gggPPPDPPPPdddF
 12 TTTgggggggggggggggggggggggggggggSggggggg=ggggggSggdddddF
 13 TTTdddddPPPPPPPPPPPPPPdddddddddddddddddd=ddddddddddddddF
 14 TTTdddddPPPPPPPPPPPPPPddddddddddddddddddHddddddddddddddF
 15 TTTdddddPPPPPPPPPPPPPPdPdddddddddPdddddddddddddddddddddF
 16 TTTdddddPPPPPPPPPPPPPDSddddddddddddddddddddddddddddddddF
 17 TTTdddddPPPPPPPPPPPPPPdddSddSddSdddddddddddddddddddddddF
 18 TTTdddddPPPPPPPPPPPPPPddddddddddddddddddddddddddddPddddF
 19 TTTdddddPPPPDPPPPPPPPPdSdddddddddSddHddddddddddddddddddF
 20 TTTdddddddddSdddHdddddddddddPdddddddddddddddddddddOOOOOO
 21 TppddddddddddddddddddddddPdddddPddddddddddddddddddOOOOOO
 22 DSpddddddddddddddddddddSdddddddddSddddddddddddddddOOOOOO
 23 TppdddddddddddddddddddddddddPdddddddddddddddddddddOOOOOO
 24 TTTddddddddddddddddddddddSdddddSddPPPPPPPPPPPPddddOOOOOO
 25 TTTdddddddddddddddddddddddddSdddddPPPPPPPPPPPPddddOOOOOO
 26 TTTdPPPPPddddddddddddddPdddddddddPPPPPPPPPPPPPddddOOOOOO
 27 TTTdPPPPPdddddddddddddddddddddddddPPPPPPPPPPPDSdddOOOOOO
 28 TTTdPPPPPdddddddddddddddddddddddddPPPPPPPPPPPPddddOOOOOO
 29 TTTddddddddddHddddddddddddddddddddPPPPPPPPPPPPddddOOOOOO
 30 TTTddddddddKKKKKKdddddddddddddddddPPPPDPPPPPPPddddOOOOOO
 31 TTTddddddddKKKKKKdddddddddddddddddwwwwSwwwwwwwwdddOOOOOO
 32 TTTddddddddKKKKKKdddddddddddddddddwwwwwwwwwwwwwdddOOOOOO
 33 TTTdddddddddddddddddddddddddddddddwwwwwwwwwwwwwdddOOOOOO
 34 TssssssssssssssssssssssssssssssssssssssssssssssssssssssT
 35 OOOOOOOOOOOOOOOOOOPPPOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO
 36 OOOOOOOOOOOOOOOOOOPPPOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO
 37 OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO
 38 OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO
 39 OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO
```

### `bp_lodge`: The Bunkhouse (24 x 12, house, small)

```
    000000000011111111112222
    012345678901234567890123
  0 WWWWWWWWWPWPWWWWWWWWWWWW
  1 WHwwwwwwwwwwWwPPPPPPPHwW
  2 WwwwwwwwwwwwWwPPPPPPPwwW
  3 PwwwwwwwwwwwWwwwwwwwwwwW
  4 WwwwPPPPPPwwWwwwwwwwwwwW
  5 WwwwPPPPPPwwWwwwwwwwwwSD
  6 WwwwwwwwwwwwWwwwwwwwwwwW
  7 WwwwwwwwwwwwWwwwwwwwwwwW
  8 WwwwwwwwwwwwwwwwwwwwwwwW
  9 WwwwwwwwwwBwwwPPPPPPPwwW
 10 WwwwwwSwwwwwwwPPPPPPPHwW
 11 WWWWWWDWWWWWWWWWWWWWWWWW
```

### `bp_mill`: Vane Sawmill (24 x 14, house, small)

```
    000000000011111111112222
    012345678901234567890123
  0 WWWWWWWWWWWWPWWWWWWWWWWW
  1 WwwwwwwwwwwwwwwwwwwwwwwW
  2 WwwHwwwwwwwwwwwwwwwwwwwW
  3 WwwwwwwwwwwwwwwwwwwwwwwW
  4 WwwwwwwwwwwwwwwwwwwwwwwW
  5 WwwwwwwwwwPPPwwwwwwwwwwW
  6 WwwwwwwwwwPPPwwwwwwwwwwW
  7 Ww===================wSD
  8 WwwwwwwwwwwwwwwwwwwwwwwW
  9 WwwwwwwwwwwwwwwwwwwwwwwW
 10 WwwwwwwwwwwwwwwwwwwwwwwW
 11 WBwwwwwwwwwwwwwwwwwwwwwW
 12 WwwwwwSwwwwwwwwwwwPwwwwW
 13 WWWWWWDWWWWWWWWWWWWWWWWW
```

### `bp_woods`: Blackpine Woods (52 x 40, forest, small)

```
    0000000000111111111122222222223333333333444444444455
    0123456789012345678901234567890123456789012345678901
  0 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTDTTTTTTTTTTTTTTTTTTTTT
  1 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTlSlTTTTTTTTTTTTTTTTTTTT
  2 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTlllTTTTTTTTTTTTTTTTTTTT
  3 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTlllTTTTTTTTTTTTTTTTTTTT
  4 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTlllTTTTgggggggggggggTTT
  5 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTlllTTTTgggggggggggggTTT
  6 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTlllTTTTgggggggggggggTTT
  7 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTlllTTTTgggggggggggggTTT
  8 TTTTTTTTTTTTTTTTTTTTTTTTTTTTHlllTTTTgggggggggggggTTT
  9 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTlllTTTTggggggggDggggTTT
 10 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTlllTTTTgggggggggggggTTT
 11 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTlllTTTTgggggggggggggTTT
 12 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTlllTTTTgggggggggggggTTT
 13 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTlllTTTTgggggggggggggTTT
 14 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTlllTTTTgggglllggggggTTT
 15 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTlllTllllllllllllllTTTTT
 16 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTlllTlTTTTTTlllTTTlTTTTT
 17 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTlllTlTTTTTTlllTTTlTTTTT
 18 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTlllTlHTTTTTlllTTTlTTTTT
 19 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTlllTllllllllllllllTTTTT
 20 TTTTTTTTggggggTTTTTTTTTTTTTTTlllTTTTTTTTlllTTTTTTTTT
 21 TTTTTTTTggggggppppppppppppppplllpppppppplllppppppppT
 22 TTTTTTTTggggggppppppppppppppppppppppppppppppppppppSD
 23 TTTTTTTTggggggpppppppppppppppppppppppppppppppppppppT
 24 TTTTTTTTggggggpppTTddddddddddddTTTTTTTTTTTTTTTTTTTTT
 25 TTTTTTTTTTTTTTpppTTddddddddddddTTTTTTTTTTTTTTTTTTTTT
 26 TTTTTTTTTTTTTTpppTTdddPPddPPdddTTTTTTTTTTTTTTTTTTTTT
 27 TTTTTTTTTTTTHTpppTTdddPPddPPdddTTTTTTTTTTTTTTTTTTTTT
 28 TTTTTTTTsssssssssssddddddddddddTTTTTTTTTTTTTTTTTTTTT
 29 TppppppppssssssssRsdddddddddddlllTTTTTTTTTTTTTTTTTTT
 30 DSppppppp~~~~~~~~~~dddddddddddlllTTTTTTTTTTTTTTTTTTT
 31 TppppppppOORssssOOOdddddddddddlllTTTTTTTTTTTTTTTTTTT
 32 TTTTTTTTsOOsssssOOOTTTTTTTTTTTlllllllllllllllllTTTTT
 33 TTTTTTTTTTTTTTTBTTTTTTTTTTTTTTTTlTTTTTTTTTTTTTlTTTTT
 34 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTlTTTTTTTTTTTTTlTTTTT
 35 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTlTTTTTTTTTTTTTlTTTTT
 36 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTlTTTTTTTTTTTTTlTTTTT
 37 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTlllllllllllllllTTTTT
 38 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
 39 TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
```

### `bp_mine`: Blackpine Workings (44 x 30, cave, small)

```
    00000000001111111111222222222233333333334444
    01234567890123456789012345678901234567890123
  0 XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
  1 XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
  2 XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXrrrrrrXX
  3 XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXrrrPrrXX
  4 XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXrrrrrrXX
  5 XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXrrrrrrXX
  6 XXXXXXHXXXXXXXXXXXXXXXXXXXXXXXXXXrrrrrrrrXXX
  7 XwwwwwwwwwwwwXXXXXXXXXXXXXXXXXXXXrrrrrrrrXXX
  8 DSwwwwwwwwwwwXXXXXXXXXXXXXXXXXXXXrrrrOOOrXXX
  9 XwwwwwwwwwwwwXXXXXXXPXXXXXXXXXXXXrrrrOOOrXXX
 10 XXXXXXXXXXXXrrrrrrrrrrrrrrrrrrrrrrrrDOOOrXXX
 11 XXXXXXXXXXXXrrrrrrrrrrrrrrrrrrrrrrrrSOOOrXXX
 12 XXXXXXXXXXXXrrrrrrrrrrrrrrrrrrrrrrrrrOOOrXXX
 13 XXXXXXXXXXXXrrrrrrrrrrrrrrrrrrrrrrrrrrrrrXXX
 14 XXXXXXXXXXXXrrrrPrrrrrrrrHrrrrrrrrrrrrrrrXXX
 15 XXXXXXXXXXXXrrrrrrrrrrrrrrrrrrrrrXXXXXXXXXXX
 16 XXXXXXXXXXXXrrrrrrrrrrrrrrrrrrrrrXXXXXXXXXXX
 17 XXXXXXXXXXXXrrrrrrrrrrrrrrrrrrrrrXXXXXXXXXXX
 18 XXXXXXXXXXXXrrrrrrrrrrrrrrrrrrrrrXXXXXXXXXXX
 19 XXXXXXXXXXXXrrrrrrrrrrrrrrrrrrBrrXXXXXXXXXXX
 20 XXXXXXXXXXXXXXXXXXXXXw=wXXXXXXXXXXXXXXXXXXXX
 21 XXXXXXXXXXXXXXXXXXXXXw=wXXXXXXXXXXXXXXXXXXXX
 22 XXXXXXXXXXXXXXXXXXXXXw=wXXXXXXXXXXXXXXXXXXXX
 23 XXXXXXXXXXXXXXXXXXXXXw=wXXXXXXXXXXXXXXXXXXXX
 24 XXXXXXXXXXXXXXXXXXXXXw=wXXXXXXXXXXXXXXXXXXXX
 25 XXXXXXXXXXXXXXXXXXXXXw=wXXXXXXXXXXXXXXXXXXXX
 26 XXXXXXXXXXXXXXXXXXXXXw=wXXXXXXXXXXXXXXXXXXXX
 27 XXXXXXXXXXXXXXXXXXXXXw=wXXXXXXXXXXXXXXXXXXXX
 28 XXXXXXXXXXXXXXXXXXXXXwSwXXXXXXXXXXXXXXXXXXXX
 29 XXXXXXXXXXXXXXXXXXXXXXDXXXXXXXXXXXXXXXXXXXXX
```

### `bp_office`: Company Office (18 x 11, house, medium)

```
    000000000011111111
    012345678901234567
  0 WWWPWWWWWWPWWWWWWW
  1 WwwwwwwwwWwwBwwwPW
  2 WwwwwwwwwWwwwwwwwW
  3 WwwwwwwwwWwwwPwwwW
  4 WwKKKKKHwWwwwwwwwW
  5 WwwwwwwwwWwwwwwwwW
  6 WwwwwwwwwWwPPwwwwW
  7 WwwwwwwwwwwPPwwwwW
  8 WwwwwwwwwwwwwwwwHW
  9 WwwwwwwwSwwwwwwwwW
 10 WWWWWWWWDWWWWWWWWW
```

### `bp_smithy`: The Forge (16 x 11, house, medium)

```
    0000000000111111
    0123456789012345
  0 WWWWWWWWWWWWWWWW
  1 WfffffPPPffffffW
  2 WffffffffffffHfW
  3 WffPfffffffffffW
  4 WffffffPfffffffW
  5 PffffffffffffffW
  6 WffffffffffffffW
  7 WffffffffffffffW
  8 WffffffffffffffW
  9 WffffffSfffffffW
 10 WWWWWWWDWWWWWWWW
```

### `bp_deep`: The Deep Level (40 x 28, cave, large)

```
    0000000000111111111122222222223333333333
    0123456789012345678901234567890123456789
  0 XXXXXXXXXXXXXXXXXXXXDXXXXXXXXXXXXXXXXXXX
  1 XXXXXXXXXXXXXXXXXXrrSrrXXXXXXXXXXXXXXXXX
  2 XXXXXXXXXXXXXXXXXXrrrrrXXXXXXXXXXXXXXXXX
  3 XXXXXXXXXXXXXXXXXXrrrrrXXXXXXXXXXXXXXXXX
  4 XXXXXXXXXXXXXXXXXXrrrrrXXXXXXXXrrrrrrrrX
  5 XXXXXXXXXXXXXXXXXXrrrrrXXXXXXXXrRrrrrrrX
  6 XXXXXXXXXXXXXXXXXXXrrrXXXXXXXXXrrrPrrrrX
  7 XXXXXXXXXXXXXXXXXXXrrrXXXXXXXXXrrrrrrrrX
  8 XXXXXXXXXX~~~~~~~~~~w~~~~~~~~~~rrrrrrrrX
  9 XXXXXXXXXX~OOOOOOOOOwOOOOOOOOO~rrrrrrrrX
 10 XXXXXXXXXX~OOOOOOOOOwOOOOOOOOO~rrrrrrrrX
 11 XXXXXXXXXX~OOOOOOOOOwOOOOOOOOO~rrrrrrrrX
 12 XXXXXXXXXXwwwwwwwwwwwwwwwwwwwwwrrrHrrrrX
 13 XXXXXXXXXX~OOOOOOOOOwOOOOOOOOO~rrrrrrrrX
 14 XXXXXXXXXX~OOOOOOOOOwOOOOOOOOO~rrrrRrrrX
 15 XXXXXXXXXX~OOOOOOOOOwOOOOOOOOO~rrrrrrrrX
 16 XXXXXXXXXX~OOOOOOOOOwOOOOOOOOO~rrRrrrrrX
 17 XXXXXXXXXX~OOOOOOOOOwOOOOOOOOO~rrrrrrrrX
 18 XXXXXXXXrrr~~~~~~~~~w~~~~~~~~~~rrrrrrrrX
 19 X~~~~~~~~rrXXXXXXXXXXXXXBXXXXXXrrrrrrrrX
 20 DS~~~~~~~rrXXXXXXXXXXXXXXXXXXXXrrrrrrrrX
 21 X~~~~~~~~rrXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
 22 XXXfffPffffXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
 23 XXXffffffffXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
 24 XXXHfffffffXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
 25 XXXffffffffXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
 26 XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
 27 XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```
