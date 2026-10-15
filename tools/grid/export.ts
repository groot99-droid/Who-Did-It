// pnpm grid:export            writes every scene's tilemap and nav bitmap
// pnpm grid:export --check    fails when a committed output is stale (CI)
//
// Until the Tiled pass of M6 every scene is an ASCII grid in packages/content/data/scenes/<id>.json
// (`#` wall, `D` door, `S` spawn, `H` hiding spot, `B` body spot, `.` floor). This turns each one into
//   apps/client/public/assets/scenes/<id>/tilemap.json   Phaser tilemap (Tiled JSON), 64 px tiles
//   packages/content/data/scenes/<id>.nav.json           the nav bitmap both sides load
// Tiled replaces the grid later with the same `.nav.json` contract.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAV_VERSION, type NavData, type NavGate, TILE_PX, navProblem } from '@wdi/shared';
import { formatJson } from '../../packages/content/scripts/lint-data.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
export const SCENES_DIR = join(root, 'packages/content/data/scenes');
export const TILEMAP_DIR = join(root, 'apps/client/public/assets/scenes');

type Profile = 'small' | 'medium' | 'large';
export interface SceneJson {
  id: string;
  kind: 'exterior' | 'interior';
  size: { w: number; h: number };
  portals: Array<{ id: string; x: number; y: number; kind: string; minProfile: Profile }>;
  spawns: Array<{ id: string; x: number; y: number; facing: string }>;
  spots: Array<{ id: string; kind: string; x: number; y: number }>;
  gates: NavGate[];
  grid: string[];
}

/** Floor tileset per scene (`tiles_<biome>` in docs/SPRITES.md 8); an art choice, not a rule. */
const BIOME: Record<string, string> = {
  overworld: 'grass',
  forest: 'forestfloor',
  cave_entry: 'caverock',
  cellar: 'caverock',
};
const biomeOf = (scene: SceneJson): string => BIOME[scene.id] ?? 'floorboards';

/** gids of the generated greybox tileset (first tileset, firstgid 1); the client draws it at boot. */
export const GREYBOX = { wall: 1, door: 2, spawn: 3, hide: 4, body: 5, gate: 6 } as const;
export const GREYBOX_TILES = 6;
const FLOOR_VARIANTS = 4;
const FLOOR_FIRSTGID = GREYBOX_TILES + 1;

export function assertTileSize(tilewidth: number, tileheight: number, what: string): void {
  if (tilewidth !== TILE_PX || tileheight !== TILE_PX)
    throw new Error(`${what}: tile size ${tilewidth}x${tileheight}, must be ${TILE_PX}x${TILE_PX}`);
}

const SOLID = new Set(['#', 'D', 'H', 'B']);

export function navFor(scene: SceneJson): NavData {
  const { w, h } = scene.size;
  if (scene.grid.length !== h)
    throw new Error(`${scene.id}: grid has ${scene.grid.length} rows, size.h is ${h}`);
  const solid = scene.grid.map((row, y) => {
    if (row.length !== w) throw new Error(`${scene.id}: row ${y} has ${row.length} columns, size.w is ${w}`);
    return [...row].map((ch) => (SOLID.has(ch) ? '1' : '0')).join('');
  });
  const nav: NavData = {
    version: NAV_VERSION,
    sceneId: scene.id,
    tile: TILE_PX,
    w,
    h,
    solid,
    gates: scene.gates.map((g) => ({ id: g.id, minProfile: g.minProfile, x: g.x, y: g.y, w: g.w, h: g.h })),
  };
  const problem = navProblem(nav);
  if (problem !== null) throw new Error(`${scene.id}: ${problem}`);
  return nav;
}

export function tilemapFor(scene: SceneJson): unknown {
  const { w, h } = scene.size;
  const biome = biomeOf(scene);
  const data: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = scene.grid[y]?.[x];
      if (ch === '#') data.push(GREYBOX.wall);
      else if (ch === 'D') data.push(GREYBOX.door);
      else if (ch === 'H') data.push(GREYBOX.hide);
      else if (ch === 'B') data.push(GREYBOX.body);
      else data.push(FLOOR_FIRSTGID + ((x * 7 + y * 13) % FLOOR_VARIANTS));
    }
  }
  const tilesets = [
    tileset('tiles_greybox', 1, GREYBOX_TILES),
    tileset(`tiles_${biome}`, FLOOR_FIRSTGID, FLOOR_VARIANTS),
  ];
  for (const t of tilesets) assertTileSize(t.tilewidth, t.tileheight, `${scene.id} tileset ${t.name}`);
  const px = (n: number) => n * TILE_PX;
  let nextId = 1;
  const obj = (name: string, type: string, x: number, y: number, props: Record<string, string> = {}) => ({
    id: nextId++,
    name,
    type,
    x: px(x),
    y: px(y),
    width: TILE_PX,
    height: TILE_PX,
    properties: Object.entries(props).map(([k, v]) => ({ name: k, type: 'string', value: v })),
  });
  const group = (id: number, name: string, objects: unknown[]) => ({
    id,
    name,
    type: 'objectgroup',
    visible: false,
    opacity: 1,
    x: 0,
    y: 0,
    objects,
  });
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.11.0',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    compressionlevel: -1,
    nextlayerid: 6,
    nextobjectid: 1,
    width: w,
    height: h,
    tilewidth: TILE_PX,
    tileheight: TILE_PX,
    properties: [
      { name: 'sceneId', type: 'string', value: scene.id },
      { name: 'kind', type: 'string', value: scene.kind },
      { name: 'biome', type: 'string', value: biome },
    ],
    tilesets,
    layers: [
      {
        id: 1,
        name: 'ground',
        type: 'tilelayer',
        width: w,
        height: h,
        x: 0,
        y: 0,
        opacity: 1,
        visible: true,
        data,
      },
      group(
        2,
        'portals',
        scene.portals.map((p) => obj(p.id, p.kind, p.x, p.y, { minProfile: p.minProfile })),
      ),
      group(
        3,
        'spawns',
        scene.spawns.map((s) => obj(s.id, 'spawn', s.x, s.y, { facing: s.facing })),
      ),
      group(
        4,
        'interact',
        scene.spots.map((s) => obj(s.id, s.kind, s.x, s.y)),
      ),
      group(
        5,
        'gates',
        scene.gates.map((g) => ({
          ...obj(g.id, 'gate', g.x, g.y, { minProfile: g.minProfile }),
          width: px(g.w),
          height: px(g.h),
        })),
      ),
    ],
  };
}

function tileset(name: string, firstgid: number, count: number) {
  return {
    firstgid,
    name,
    image: `${name}.png`,
    imagewidth: count * TILE_PX,
    imageheight: TILE_PX,
    tilewidth: TILE_PX,
    tileheight: TILE_PX,
    columns: count,
    tilecount: count,
    margin: 0,
    spacing: 0,
  };
}

export function loadScenes(dir = SCENES_DIR): SceneJson[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.nav.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as SceneJson);
}

export interface Output {
  path: string;
  text: string;
}

export function buildOutputs(scenes: SceneJson[]): Output[] {
  return scenes.flatMap((scene) => [
    { path: join(SCENES_DIR, `${scene.id}.nav.json`), text: formatJson(navFor(scene)) },
    { path: join(TILEMAP_DIR, scene.id, 'tilemap.json'), text: JSON.stringify(tilemapFor(scene)) + '\n' },
  ]);
}

function main(): void {
  const check = process.argv.includes('--check');
  const outputs = buildOutputs(loadScenes());
  const stale: string[] = [];
  for (const o of outputs) {
    const current = existsSync(o.path) ? readFileSync(o.path, 'utf8') : null;
    if (current === o.text) continue;
    stale.push(relative(root, o.path));
    if (!check) {
      mkdirSync(dirname(o.path), { recursive: true });
      writeFileSync(o.path, o.text);
    }
  }
  if (check && stale.length > 0) {
    console.error(`stale grid exports (run pnpm grid:export):\n  ${stale.join('\n  ')}`);
    process.exit(1);
  }
  console.log(
    `${check ? 'checked' : 'exported'} ${outputs.length / 2} scenes, ${stale.length} ${check ? 'stale' : 'written'}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
