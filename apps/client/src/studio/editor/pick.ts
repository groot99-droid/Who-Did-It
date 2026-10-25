// Round 9 (9T): which object a click on a tile means. Smaller things win over the bigger ones around them.
import type { Scene } from '@wdi/content';
import { listOf, type Pick } from './sceneEdit';

const covers = (
  o: { x: number; y: number; footprint?: { x: number; y: number; w: number; h: number } },
  tx: number,
  ty: number,
) =>
  o.footprint === undefined
    ? o.x === tx && o.y === ty
    : tx >= o.footprint.x &&
      ty >= o.footprint.y &&
      tx < o.footprint.x + o.footprint.w &&
      ty < o.footprint.y + o.footprint.h;

/** The object at a tile: a single-tile object before a footprint prop, lights last (they cover no tile but their own). */
export function pickAt(scene: Scene, tx: number, ty: number): Pick | null {
  const order = ['spawns', 'portals', 'spots', 'lights', 'props', 'buildings'] as const;
  for (const kind of order) {
    const hit = listOf(scene, kind).find((o) => covers(o as never, tx, ty));
    if (hit !== undefined) return { kind, id: hit.id };
  }
  return null;
}
