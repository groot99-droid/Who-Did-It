import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PROFILE_RANK, type Profile, type Scene } from '../src/index.js';

export const dataDir = fileURLToPath(new URL('../data/', import.meta.url));

export function sceneFiles(): string[] {
  return readdirSync(new URL('../data/scenes/', import.meta.url))
    .filter((f) => f.endsWith('.json') && !f.endsWith('.nav.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

export const opensAt = (min: Profile, at: Profile) => PROFILE_RANK[min] <= PROFILE_RANK[at];

/** Walkable at a profile: floor or spawn, and not inside a gate that is still shut. */
export function walkable(scene: Scene, profile: Profile, x: number, y: number): boolean {
  const ch = scene.grid[y]?.[x];
  if (ch !== '.' && ch !== 'S') return false;
  return !scene.gates.some(
    (g) => !opensAt(g.minProfile, profile) && x >= g.x && x < g.x + g.w && y >= g.y && y < g.y + g.h,
  );
}

/** 4-connected flood fill of walkable tiles from a start tile. */
export function flood(scene: Scene, profile: Profile, x0: number, y0: number): Set<string> {
  const seen = new Set<string>();
  const stack: Array<[number, number]> = [[x0, y0]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const key = `${x},${y}`;
    if (seen.has(key) || !walkable(scene, profile, x, y)) continue;
    seen.add(key);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;
}

export const touches = (reached: Set<string>, x: number, y: number) =>
  [
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1],
  ].some(([a, b]) => reached.has(`${a},${b}`));

export function binomial(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}
