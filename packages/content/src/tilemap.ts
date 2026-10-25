// `@wdi/content/tilemap`: a scene's isometric Tiled map (docs/SPRITES.md 10.12), which the client draws from
// apps/client/public/assets/scenes/<id>/tilemap.json. tools/grid/export.ts writes the committed file and the Studio
// server regenerates it on a save (round 9, docs/round9/admin-studio.md 5), so the two cannot drift. The server and
// the nav stay on the square grid; only the tilemap is isometric, for the client to draw. A subpath, not the index:
// nothing that only reads content pays for it.
import {
  BLEND_RANK,
  DEFAULT_FLOOR,
  DEFAULT_SOLID,
  FLOOR_MATERIALS,
  GROUND_ROWS,
  biomeOf,
  mapOf,
  maps,
  metrics,
  type Light,
  type MapId,
  type Scene,
  type SceneId,
} from './index.js';

/** Grid characters that block movement (ASSETS 6.3); `@wdi/shared` `NAV_SOLID_CHARS` is the same set, by test. */
export const GRID_SOLID_CHARS: ReadonlySet<string> = new Set(['#', 'D', 'H', 'B']);
const SOLID = GRID_SOLID_CHARS;
const TILE_PX = metrics.tilePx;

/** Ground tileset cell (SPRITES 10.12): a 128 x 64 diamond; 10 columns, two rows per ground material. */
export const ISO_TILE_W = metrics.iso.tileW;
export const ISO_TILE_H = metrics.iso.tileH;
const COLUMNS = 10;
const CELLS_PER_MATERIAL = 20;
/** Side bits of an edge overlay, world frame. */
export const SIDE = { n: 1, e: 2, s: 4, w: 8 } as const;
/** SPRITES 10.14: static world sprites (solids, slices, props, spots) per scene. */
export const MAX_STATIC_SPRITES = 1200;

export function assertGroundCell(w: number, h: number, what: string): void {
  if (w !== ISO_TILE_W || h !== ISO_TILE_H)
    throw new Error(`${what}: ground cell ${w}x${h}, must be ${ISO_TILE_W}x${ISO_TILE_H}`);
}

const FLOORS = new Set(Object.keys(FLOOR_MATERIALS));
const KIT: Record<string, string> = {
  W: 'wall',
  T: 'tree',
  R: 'boulder',
  X: 'cliff',
  F: 'fence',
  K: 'stack',
};
/** Kit pieces that draw one height everywhere (SPRITES 10.7). */
const ONE_HEIGHT = new Set(['R', 'F', 'K']);
/** Kit pieces tall enough to hide what stands behind them. */
const OCCLUDING = new Set(['W', 'T', 'X']);
const LIGHT_COLOR: Record<Light['kind'], string> = {
  lantern: 'lantern',
  torch: 'lantern',
  lamp: 'lantern',
  fire: 'lantern',
  window: 'lantern',
  moss: 'teal',
  moon: 'moon',
  shaft: 'moon',
};

/** The tiles a building or a multi-tile prop covers. */
function coveredTiles(scene: Scene): Set<string> {
  const out = new Set<string>();
  for (const r of [
    ...(scene.buildings ?? []).map((b) => b.footprint),
    ...scene.props.flatMap((p) => (p.footprint ? [p.footprint] : [])),
  ]) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.add(`${x},${y}`);
  }
  return out;
}

/** The material of every tile: the scene's layer, or its biome's defaults (`P` where something covers it). */
export function materialOf(scene: Scene): string[] {
  if (scene.material) return scene.material;
  const biome = biomeOf(scene);
  const covered = coveredTiles(scene);
  const anchors = new Set(scene.props.map((p) => `${p.x},${p.y}`));
  return scene.grid.map((row, y) =>
    [...row]
      .map((ch, x) => {
        if (!SOLID.has(ch)) return DEFAULT_FLOOR[biome];
        const key = `${x},${y}`;
        return ch === '#' && (covered.has(key) || anchors.has(key)) ? 'P' : DEFAULT_SOLID[biome];
      })
      .join(''),
  );
}

/**
 * Scene facts the tilemap needs per tile: walkability, deep cull, shells. A front-shell tile has nothing
 * walkable south-east of it (no tile at or past its x and y), so it stands in front of every floor; the back
 * shell is the same toward the north-west (SPRITES 10.7; the quadrant reading is DECISIONS A61).
 */
export interface SceneGeometry {
  walkable: (x: number, y: number) => boolean;
  solid: (x: number, y: number) => boolean;
  culled: (x: number, y: number) => boolean;
  front: (x: number, y: number) => boolean;
  back: (x: number, y: number) => boolean;
}

export function geometryOf(scene: Scene): SceneGeometry {
  const { w, h } = scene.size;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const solid = (x: number, y: number) => !inside(x, y) || SOLID.has(scene.grid[y]![x]!);
  const walkable = (x: number, y: number) => inside(x, y) && !SOLID.has(scene.grid[y]![x]!);
  // Chebyshev distance to the nearest walkable tile, by two sweeps of a chessboard distance transform.
  const far = w + h;
  const dist = Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => (walkable(x, y) ? 0 : far)),
  );
  const relax = (x: number, y: number, dx: number[], dy: number[]) => {
    for (let i = 0; i < dx.length; i++) {
      const nx = x + dx[i]!;
      const ny = y + dy[i]!;
      if (inside(nx, ny)) dist[y]![x] = Math.min(dist[y]![x]!, dist[ny]![nx]! + 1);
    }
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) relax(x, y, [-1, -1, 0, 1], [0, -1, -1, -1]);
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) relax(x, y, [1, 1, 0, -1], [0, 1, 1, 1]);
  // Walkable tiles in the quadrant south-east (and north-west) of each tile, by 2D suffix and prefix sums.
  const quad = (sx: number, sy: number) => {
    const sum = Array.from({ length: h + 2 }, () => new Array<number>(w + 2).fill(0));
    const xs = sx > 0 ? [...Array(w).keys()].reverse() : [...Array(w).keys()];
    const ys = sy > 0 ? [...Array(h).keys()].reverse() : [...Array(h).keys()];
    const at = (x: number, y: number) => sum[y + 1]![x + 1]!;
    for (const y of ys)
      for (const x of xs)
        sum[y + 1]![x + 1] = (walkable(x, y) ? 1 : 0) + at(x + sx, y) + at(x, y + sy) - at(x + sx, y + sy);
    return at;
  };
  const se = quad(1, 1);
  const nw = quad(-1, -1);
  return {
    walkable,
    solid,
    culled: (x, y) => dist[y]![x]! > metrics.iso.deepCullTiles,
    front: (x, y) => solid(x, y) && se(x, y) === 0,
    back: (x, y) => solid(x, y) && nw(x, y) === 0,
  };
}

/** Neighbours in the order south, east, north, west (SPRITES 10.12), with their side bit. */
const AROUND = [
  { dx: 0, dy: 1, side: SIDE.s, face: 's' },
  { dx: 1, dy: 0, side: SIDE.e, face: 'e' },
  { dx: 0, dy: -1, side: SIDE.n, face: 'n' },
  { dx: -1, dy: 0, side: SIDE.w, face: 'w' },
] as const;

const variant = (x: number, y: number) => (x * 7 + y * 13) % 4;
export const gidOf = (material: string, cell: number) =>
  1 + CELLS_PER_MATERIAL * GROUND_ROWS.indexOf(material) + cell;

/** The ground material each tile draws, or null for a deep-culled tile. */
export function groundOf(scene: Scene, geo = geometryOf(scene)): Array<Array<string | null>> {
  const mat = materialOf(scene);
  const floor = DEFAULT_FLOOR[biomeOf(scene)];
  return mat.map((row, y) =>
    [...row].map((m, x) => {
      if (geo.walkable(x, y)) return m;
      if (geo.culled(x, y)) return null;
      // A floor letter under a door or spot, and deep water, draw themselves; other solids take a neighbour's.
      if (FLOORS.has(m) || m === 'O') return m;
      for (const a of AROUND) {
        if (geo.walkable(x + a.dx, y + a.dy)) return mat[y + a.dy]![x + a.dx]!;
      }
      return floor;
    }),
  );
}

/** Base cell of a tile: its variant, or for rails the variant pair of the track's axis. */
function baseCell(ground: Array<Array<string | null>>, x: number, y: number): number {
  if (ground[y]![x] !== '=') return variant(x, y);
  const rail = (dx: number, dy: number) => ground[y + dy]?.[x + dx] === '=';
  const pick = (x * 7 + y * 13) % 2;
  if (rail(-1, 0) || rail(1, 0)) return pick;
  if (rail(0, -1) || rail(0, 1)) return 2 + pick;
  return 0;
}

/** The three tile layers: ground, then up to two edge overlays from higher-ranked neighbours. */
export function tileLayers(
  scene: Scene,
  geo = geometryOf(scene),
): { ground: number[]; blend1: number[]; blend2: number[] } {
  const ground = groundOf(scene, geo);
  const { w, h } = scene.size;
  const out = { ground: [] as number[], blend1: [] as number[], blend2: [] as number[] };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const m = ground[y]![x]!;
      if (m === null) {
        out.ground.push(0);
        out.blend1.push(0);
        out.blend2.push(0);
        continue;
      }
      out.ground.push(gidOf(m, baseCell(ground, x, y)));
      const masks = new Map<string, number>();
      for (const a of AROUND) {
        const n = ground[y + a.dy]?.[x + a.dx];
        if (n == null || BLEND_RANK.indexOf(n) <= BLEND_RANK.indexOf(m)) continue;
        masks.set(n, (masks.get(n) ?? 0) | a.side);
      }
      const ranked = [...masks.keys()].sort((a, b) => BLEND_RANK.indexOf(b) - BLEND_RANK.indexOf(a));
      const cell = (n: string | undefined) => (n === undefined ? 0 : gidOf(n, 3 + masks.get(n)!));
      out.blend1.push(cell(ranked[0]));
      out.blend2.push(cell(ranked[1]));
    }
  }
  return out;
}

/** The kit frame of a drawn solid tile (`wall/half/2`), or null when it draws nothing of its own. */
export function kitFrameOf(scene: Scene, x: number, y: number, geo = geometryOf(scene)): string | null {
  const m = materialOf(scene)[y]![x]!;
  if (scene.grid[y]![x] !== '#' || !(m in KIT) || geo.culled(x, y)) return null;
  let height: 'full' | 'half' | 'stub';
  if (ONE_HEIGHT.has(m)) height = 'full';
  else if (geo.front(x, y)) height = 'stub';
  else if (scene.kind === 'exterior' || geo.back(x, y)) height = 'full';
  else height = 'half';
  // Trees have a full height and a stump only; a height without a frame falls back to full.
  if (m === 'T' && height === 'half') height = 'full';
  return `${KIT[m]}/${height}/${variant(x, y)}`;
}

/** Where a portal opens: `s` and `e` draw a full frame, an opening toward north or west draws a sill. */
export function portalFace(scene: Scene, x: number, y: number, geo = geometryOf(scene)): 's' | 'e' | 'sill' {
  for (const a of AROUND) {
    if (geo.walkable(x + a.dx, y + a.dy)) return a.face === 's' || a.face === 'e' ? a.face : 'sill';
  }
  return 'sill';
}

type Prop = { name: string; type: 'string' | 'bool' | 'float'; value: string | boolean | number };
const str = (name: string, value: string): Prop => ({ name, type: 'string', value });

export function tilemapFor(scene: Scene, mapId: MapId = mapOf(scene.id as SceneId)): unknown {
  const { w, h } = scene.size;
  const theme = maps[mapId].theme;
  const biome = biomeOf(scene);
  const geo = geometryOf(scene);
  const layers = tileLayers(scene, geo);
  const tileset = {
    firstgid: 1,
    name: `iso_ground_${theme}`,
    image: `iso_ground_${theme}.png`,
    imagewidth: COLUMNS * ISO_TILE_W,
    imageheight: 2 * GROUND_ROWS.length * ISO_TILE_H,
    tilewidth: ISO_TILE_W,
    tileheight: ISO_TILE_H,
    columns: COLUMNS,
    tilecount: CELLS_PER_MATERIAL * GROUND_ROWS.length,
    margin: 0,
    spacing: 0,
  };
  assertGroundCell(tileset.tilewidth, tileset.tileheight, `${scene.id} tileset ${tileset.name}`);
  const px = (n: number) => n * TILE_PX;
  let nextId = 1;
  const obj = (name: string, type: string, x: number, y: number, props: Prop[] = [], tw = 1, th = 1) => ({
    id: nextId++,
    name,
    type,
    x: px(x),
    y: px(y),
    width: px(tw),
    height: px(th),
    properties: props,
  });
  let layerId = 1;
  const tiles = (name: string, data: number[]) => ({
    id: layerId++,
    name,
    type: 'tilelayer',
    width: w,
    height: h,
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    data,
  });
  const group = (name: string, objects: unknown[]) => ({
    id: layerId++,
    name,
    type: 'objectgroup',
    visible: false,
    opacity: 1,
    x: 0,
    y: 0,
    objects,
  });

  const solids: unknown[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const frame = kitFrameOf(scene, x, y, geo);
      if (frame === null) continue;
      const occluder = OCCLUDING.has(materialOf(scene)[y]![x]!) && !frame.includes('/stub/');
      solids.push(obj(`${x},${y}`, frame, x, y, [{ name: 'occluder', type: 'bool', value: occluder }]));
    }
  }
  const slices = [...coveredTiles(scene)].length;
  const sprites =
    solids.length + slices + scene.props.filter((p) => !p.footprint).length + scene.spots.length;
  if (sprites > MAX_STATIC_SPRITES)
    throw new Error(`${scene.id}: ${sprites} static world sprites, the budget is ${MAX_STATIC_SPRITES}`);

  const buildings = scene.buildings ?? [];
  const inBuilding = (x: number, y: number) =>
    buildings.some(
      (b) =>
        x >= b.footprint.x &&
        y >= b.footprint.y &&
        x < b.footprint.x + b.footprint.w &&
        y < b.footprint.y + b.footprint.h,
    );
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.11.0',
    orientation: 'isometric',
    renderorder: 'right-down',
    infinite: false,
    compressionlevel: -1,
    nextlayerid: 12,
    nextobjectid: 1,
    width: w,
    height: h,
    tilewidth: ISO_TILE_W,
    tileheight: ISO_TILE_H,
    properties: [
      str('sceneId', scene.id),
      str('kind', scene.kind),
      str('biome', biome),
      { name: 'dark', type: 'bool', value: scene.dark === true },
      str('map', mapId),
      str('theme', theme),
      str('void', scene.kind === 'exterior' && biome !== 'cave' ? 'slate' : 'ink'),
    ],
    tilesets: [tileset],
    layers: [
      tiles('ground', layers.ground),
      tiles('blend_1', layers.blend1),
      tiles('blend_2', layers.blend2),
      group('solids', solids),
      group(
        'buildings',
        buildings.map((b) =>
          obj(
            b.id,
            'building',
            b.footprint.x,
            b.footprint.y,
            [str('art', b.art)],
            b.footprint.w,
            b.footprint.h,
          ),
        ),
      ),
      group(
        'props',
        scene.props.map((p) => {
          const f = p.footprint;
          return obj(p.id, p.kind, p.x, p.y, f ? [str('footprint', `${f.x},${f.y},${f.w},${f.h}`)] : []);
        }),
      ),
      group(
        'portals',
        scene.portals.map((p) =>
          obj(p.id, p.kind, p.x, p.y, [
            str('minProfile', p.minProfile),
            str('face', portalFace(scene, p.x, p.y, geo)),
            { name: 'inBuilding', type: 'bool', value: inBuilding(p.x, p.y) },
          ]),
        ),
      ),
      group(
        'spawns',
        scene.spawns.map((s) => obj(s.id, 'spawn', s.x, s.y, [str('facing', s.facing)])),
      ),
      group(
        'interact',
        scene.spots.map((s) => obj(s.id, s.kind, s.x, s.y, [str('variant', s.variant)])),
      ),
      group(
        'gates',
        scene.gates.map((g) => obj(g.id, 'gate', g.x, g.y, [str('minProfile', g.minProfile)], g.w, g.h)),
      ),
      group(
        'lights',
        (scene.lights ?? []).map((l) =>
          obj(l.id, l.kind, l.x, l.y, [
            { name: 'radiusTiles', type: 'float', value: l.radiusTiles },
            str('color', l.color ?? LIGHT_COLOR[l.kind]),
            str('phases', (l.phases ?? []).join(',')),
          ]),
        ),
      ),
    ],
  };
}
