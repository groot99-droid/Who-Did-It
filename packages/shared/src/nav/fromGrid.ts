// The ASCII grid of a scene to its `.nav.json` (docs/ASSETS.md 6.3). One function for the three places that
// need it: tools/grid/export.ts writes the committed file, the Studio server regenerates it on save, and the
// Studio client checks an edit live. It is typed by shape so @wdi/shared needs nothing from @wdi/content.

import { TILE_PX } from '../constants';
import { NAV_VERSION, type NavData, type NavGate, navProblem } from './index';

/** Grid characters that block movement (`#` wall, `D` door, `H` hiding spot, `B` body spot; ASSETS 6.3). The rest is walkable. */
export const NAV_SOLID_CHARS: ReadonlySet<string> = new Set(['#', 'D', 'H', 'B']);

/** What the nav needs from a scene. */
export interface NavSource {
  id: string;
  size: { w: number; h: number };
  grid: readonly string[];
  gates: readonly NavGate[];
}

/** Builds the nav of a scene; throws on a grid that does not match its size or a nav that fails `navProblem`. */
export function navFromGrid(scene: NavSource): NavData {
  const { w, h } = scene.size;
  if (scene.grid.length !== h)
    throw new Error(`${scene.id}: grid has ${scene.grid.length} rows, size.h is ${h}`);
  const solid = scene.grid.map((row, y) => {
    if (row.length !== w) throw new Error(`${scene.id}: row ${y} has ${row.length} columns, size.w is ${w}`);
    return [...row].map((ch) => (NAV_SOLID_CHARS.has(ch) ? '1' : '0')).join('');
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
