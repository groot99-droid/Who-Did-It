// Round 9 (9T, docs/round9/admin-studio.md 3): the editor's pure edits on a scene's grid (and its material rows, when
// it has them): paint a rectangle, flood fill, resize. The result is a new scene or an error line, like `sceneEdit.ts`.
import {
  biomeOf,
  DEFAULT_FLOOR,
  DEFAULT_SOLID,
  FLOOR_MATERIALS,
  GROUND_ROWS,
  SOLID_MATERIALS,
  type Scene,
} from '@wdi/content';
import { listOf, PLACEABLE, type Edit } from './sceneEdit';

export const GRID_CHARS = ['.', '#', 'D', 'S', 'H', 'B'] as const;
export type Cell = (typeof GRID_CHARS)[number];
export type Tool = 'objects' | 'brush' | 'rect' | 'fill' | 'gate' | 'path';

export const MAX_SIDE = 200;

const SOLID = '#';
const at = (scene: Scene, x: number, y: number): string => scene.grid[y]?.[x] ?? '';
const inside = (scene: Scene, x: number, y: number) =>
  x >= 0 && y >= 0 && x < scene.size.w && y < scene.size.h;

/** The material character a tile of the other class gets: the commonest one of its class in the scene's own rows. */
export function materialFor(scene: Scene, solid: boolean): string | null {
  if (scene.material === undefined) return null;
  const count = new Map<string, number>();
  for (let y = 0; y < scene.size.h; y++)
    for (let x = 0; x < scene.size.w; x++) {
      if ((at(scene, x, y) === SOLID) !== solid) continue;
      const m = scene.material[y]?.[x];
      if (m !== undefined) count.set(m, (count.get(m) ?? 0) + 1);
    }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Sets the tiles in the list to `cell`; a tile that changes between floor and solid takes a material of its new class. */
export function paint(scene: Scene, tiles: Array<{ x: number; y: number }>, cell: Cell): Edit {
  const grid = scene.grid.map((r) => r.split(''));
  const material = scene.material?.map((r) => r.split(''));
  const toSolid = materialFor(scene, true);
  const toFloor = materialFor(scene, false);
  for (const { x, y } of tiles) {
    if (!inside(scene, x, y)) return { error: `tile ${x},${y} is outside the scene` };
    const was = grid[y]![x]!;
    if (was === cell) continue;
    grid[y]![x] = cell;
    const m = (cell === SOLID ? toSolid : toFloor) ?? undefined;
    if (
      material !== undefined &&
      (was === SOLID) !== (cell === SOLID) &&
      cell !== 'D' &&
      cell !== 'H' &&
      cell !== 'B'
    ) {
      if (m === undefined) return { error: 'the scene has no material of that class to copy' };
      material[y]![x] = m;
    }
  }
  return {
    scene: {
      ...scene,
      grid: grid.map((r) => r.join('')),
      ...(material === undefined ? {} : { material: material.map((r) => r.join('')) }),
    },
  };
}

export function rectTiles(a: { x: number; y: number }, b: { x: number; y: number }) {
  const out: Array<{ x: number; y: number }> = [];
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++)
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) out.push({ x, y });
  return out;
}

/** The 4-connected run of tiles with the same grid character as the one at x,y. */
export function regionTiles(scene: Scene, x: number, y: number) {
  const want = at(scene, x, y);
  const seen = new Set<number>();
  const out: Array<{ x: number; y: number }> = [];
  const stack = [{ x, y }];
  while (stack.length > 0) {
    const t = stack.pop()!;
    const key = t.y * scene.size.w + t.x;
    if (!inside(scene, t.x, t.y) || seen.has(key) || at(scene, t.x, t.y) !== want) continue;
    seen.add(key);
    out.push(t);
    stack.push(
      { x: t.x + 1, y: t.y },
      { x: t.x - 1, y: t.y },
      { x: t.x, y: t.y + 1 },
      { x: t.x, y: t.y - 1 },
    );
  }
  return out;
}

/** Ids of what a shrink to w x h would cut: any object, gate, path or building with a tile outside. */
export function cutBy(scene: Scene, w: number, h: number): string[] {
  const out: string[] = [];
  for (const kind of PLACEABLE)
    for (const o of listOf(scene, kind)) {
      const fp = (o as { footprint?: { x: number; y: number; w: number; h: number } }).footprint;
      const far = fp === undefined ? { x: o.x, y: o.y } : { x: fp.x + fp.w - 1, y: fp.y + fp.h - 1 };
      if (far.x >= w || far.y >= h || o.x >= w || o.y >= h) out.push(o.id);
    }
  for (const g of scene.gates) if (g.x + g.w > w || g.y + g.h > h) out.push(g.id);
  for (const p of scene.paths) if (p.points.some((q) => q.x >= w || q.y >= h)) out.push(p.id);
  return out;
}

/**
 * Resizes the scene, keeping the top-left corner. New tiles are floor (`.`) with the scene's commonest floor
 * material. A shrink that would cut any object is refused with the list of ids, so the owner moves or deletes them.
 */
export function resize(scene: Scene, w: number, h: number): Edit {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > MAX_SIDE || h > MAX_SIDE)
    return { error: `a scene is 1 to ${MAX_SIDE} tiles each way` };
  const cut = cutBy(scene, w, h);
  if (cut.length > 0) return { error: `a ${w}x${h} scene would cut ${cut.join(', ')}` };
  const floor = materialFor(scene, false) ?? '.';
  const row = (r: string, fill: string, n: number) => r.slice(0, n).padEnd(n, fill);
  const rows = (list: string[], fill: string): string[] =>
    Array.from({ length: h }, (_, y) => row(list[y] ?? '', fill, w));
  return {
    scene: {
      ...scene,
      size: { w, h },
      grid: rows(scene.grid, '.'),
      ...(scene.material === undefined ? {} : { material: rows(scene.material, floor) }),
    },
  };
}

export interface MaterialInfo {
  /** The character in a scene's `material` rows. */
  ch: string;
  name: string;
  solid: boolean;
  /** Row of this material in an isometric ground tileset, when the tileset draws it (`GROUND_ROWS`). */
  groundRow: number | null;
}

/** Every material of the legend, floors first and then solids, as the palette lists them. */
export const MATERIALS: readonly MaterialInfo[] = [
  ...Object.entries(FLOOR_MATERIALS).map(([ch, name]) => ({ ch, name: name as string, solid: false })),
  ...Object.entries(SOLID_MATERIALS).map(([ch, name]) => ({ ch, name: name as string, solid: true })),
].map((m) => ({ ...m, groundRow: GROUND_ROWS.includes(m.ch) ? GROUND_ROWS.indexOf(m.ch) : null }));

const isSolidMaterial = (ch: string) => ch in SOLID_MATERIALS;

/** The scene's material rows, or the biome's defaults for every tile (a solid on `#`, a floor elsewhere). */
export function materialRows(scene: Scene): string[] {
  if (scene.material !== undefined) return scene.material;
  const biome = biomeOf(scene);
  return scene.grid.map((row) =>
    [...row].map((ch) => (ch === SOLID ? DEFAULT_SOLID[biome] : DEFAULT_FLOOR[biome])).join(''),
  );
}

/**
 * Paints a material on the tiles. The grid follows the legend: a floor material turns a `#` tile to floor, a solid one
 * turns a `.` or `S` tile to `#`; `D`, `H` and `B` accept either class. A scene without `material` rows gets them from
 * its biome's defaults first.
 */
export function paintMaterial(scene: Scene, tiles: Array<{ x: number; y: number }>, ch: string): Edit {
  if (!MATERIALS.some((m) => m.ch === ch)) return { error: `${ch} is not a material` };
  const solid = isSolidMaterial(ch);
  const grid = scene.grid.map((r) => r.split(''));
  const rows = materialRows(scene).map((r) => r.split(''));
  for (const { x, y } of tiles) {
    if (!inside(scene, x, y)) return { error: `tile ${x},${y} is outside the scene` };
    const was = grid[y]![x]!;
    if (solid && (was === '.' || was === 'S')) grid[y]![x] = SOLID;
    else if (!solid && was === SOLID) grid[y]![x] = '.';
    rows[y]![x] = ch;
  }
  return { scene: { ...scene, grid: grid.map((r) => r.join('')), material: rows.map((r) => r.join('')) } };
}

/** The 4-connected run of tiles with the same material as the one at x,y. */
export function materialRegion(scene: Scene, x: number, y: number) {
  const rows = materialRows(scene);
  const want = rows[y]?.[x];
  const seen = new Set<number>();
  const out: Array<{ x: number; y: number }> = [];
  const stack = [{ x, y }];
  while (stack.length > 0) {
    const t = stack.pop()!;
    const key = t.y * scene.size.w + t.x;
    if (!inside(scene, t.x, t.y) || seen.has(key) || rows[t.y]?.[t.x] !== want) continue;
    seen.add(key);
    out.push(t);
    stack.push(
      { x: t.x + 1, y: t.y },
      { x: t.x - 1, y: t.y },
      { x: t.x, y: t.y + 1 },
      { x: t.x, y: t.y - 1 },
    );
  }
  return out;
}
