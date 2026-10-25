// pnpm grid:export            writes every scene's tilemap and nav bitmap
// pnpm grid:export --check    fails when a committed output is stale (CI)
//
// Until the Tiled pass of M6 every scene is an ASCII grid plus a material layer in
// packages/content/data/scenes/<id>.json (GDD 3.13, docs/round5/world.md 2). This turns each one into
//   apps/client/public/assets/scenes/<id>/tilemap.json   Tiled 1.10 isometric map (docs/SPRITES.md 10.12)
//   packages/content/data/scenes/<id>.nav.json           the nav bitmap both sides load (64 px, world frame)
// The server and the nav stay on the square grid; only the tilemap is isometric, for the client to draw.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type NavData, TILE_PX, navFromGrid } from '@wdi/shared';
import { SCENE_IDS, scenes, type Scene } from '@wdi/content';
import { tilemapFor } from '@wdi/content/tilemap';
import { formatJson } from '../../packages/content/scripts/lint-data.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
export const SCENES_DIR = join(root, 'packages/content/data/scenes');
export const TILEMAP_DIR = join(root, 'apps/client/public/assets/scenes');

/** The tilemap builder lives in `@wdi/content/tilemap` so the Studio server writes the same file (round 9). */
export {
  ISO_TILE_H,
  ISO_TILE_W,
  MAX_STATIC_SPRITES,
  SIDE,
  assertGroundCell,
  geometryOf,
  gidOf,
  groundOf,
  kitFrameOf,
  materialOf,
  portalFace,
  tileLayers,
  tilemapFor,
  type SceneGeometry,
} from '@wdi/content/tilemap';

export function assertNavTile(tile: number, what: string): void {
  if (tile !== TILE_PX) throw new Error(`${what}: nav tile ${tile}, must be ${TILE_PX}`);
}

/** The scene's nav (the function lives in @wdi/shared so the Studio can regenerate it; round 9). */
export function navFor(scene: Scene): NavData {
  const nav = navFromGrid(scene);
  assertNavTile(nav.tile, scene.id);
  return nav;
}

/** Every scene of every map, in `SCENE_IDS` order (validated by `@wdi/content` at import). */
export function loadScenes(): Scene[] {
  return SCENE_IDS.map((id) => scenes[id]);
}

export interface Output {
  path: string;
  text: string;
}

export function buildOutputs(list: Scene[]): Output[] {
  return list.flatMap((scene) => [
    { path: join(SCENES_DIR, `${scene.id}.nav.json`), text: formatJson(navFor(scene)) },
    { path: join(TILEMAP_DIR, scene.id, 'tilemap.json'), text: JSON.stringify(tilemapFor(scene)) + '\n' },
  ]);
}

/** The outputs whose committed file differs from what the exporter writes. */
export function staleOutputs(outputs: Output[]): Output[] {
  return outputs.filter((o) => !existsSync(o.path) || readFileSync(o.path, 'utf8') !== o.text);
}

function main(): void {
  const check = process.argv.includes('--check');
  const outputs = buildOutputs(loadScenes());
  const stale = staleOutputs(outputs);
  if (!check) {
    for (const o of stale) {
      mkdirSync(dirname(o.path), { recursive: true });
      writeFileSync(o.path, o.text);
    }
  }
  if (check && stale.length > 0) {
    console.error(
      `stale grid exports (run pnpm grid:export):\n  ${stale.map((o) => relative(root, o.path)).join('\n  ')}`,
    );
    process.exit(1);
  }
  console.log(
    `${check ? 'checked' : 'exported'} ${outputs.length / 2} scenes, ${stale.length} ${check ? 'stale' : 'written'}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
