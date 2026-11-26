import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCENE_IDS, scenes } from '@wdi/content';
import { TILE_PX } from '@wdi/shared/constants';
import { mapStatics } from '../view/mapDefs';
import { INTERACTABLE_PROPS } from '../view/mapDefs';
import { type TiledMap, readSceneMap } from '../view/sceneMap';
import { buildScene, readSpawns, sourceId } from './build';

const tilemapPath = (id: string) => new URL(`../../public/assets/scenes/${id}/tilemap.json`, import.meta.url);
const withMaps = SCENE_IDS.filter((id) => existsSync(tilemapPath(id)));

function built(id: string, art: boolean) {
  const tiled = JSON.parse(readFileSync(tilemapPath(id), 'utf8')) as TiledMap;
  const map = readSceneMap(tiled);
  const defs = mapStatics(map, {
    mapId: map.mapId ?? 'hollowmere',
    theme: map.theme ?? '',
    hasFrame: () => art,
  });
  return { tiled, map, build: buildScene(map, readSpawns(tiled), defs, () => art) };
}

interface GraphScene {
  portals: Array<{ id: string }>;
  spawns: Array<{ id: string }>;
  props: Array<{ id: string; kind: string }>;
  spots: Array<{ id: string }>;
}
const graph = (id: string) => (scenes as unknown as Record<string, GraphScene>)[id]!;

describe('buildScene (round 11, R1)', () => {
  it('has a tilemap for most scenes', () => {
    expect(withMaps.length).toBeGreaterThan(20);
  });

  it.each(withMaps)('%s: places every portal, spawn and prop id of the scene file', (id) => {
    const g = graph(id);
    const { build } = built(id, true);
    const placed = new Set(build.nodes.map((n) => sourceId(n.id)));
    for (const p of g.portals) expect(placed, `portal ${p.id}`).toContain(p.id);
    for (const s of g.spawns) expect(placed, `spawn ${s.id}`).toContain(s.id);
    for (const p of g.props) expect(placed, `prop ${p.id}`).toContain(p.id);
    // Without art, the interactable props still stand as their greybox blocks (SPRITES 10.13).
    const grey = new Set(built(id, false).build.nodes.map((n) => sourceId(n.id)));
    for (const p of g.props) if (INTERACTABLE_PROPS[p.kind] !== undefined) expect(grey).toContain(p.id);
  });

  it.each(withMaps)('%s: reads no id the scene file does not have', (id) => {
    const g = graph(id);
    const { map, build } = built(id, true);
    const known = new Set([
      ...g.portals.map((p) => p.id),
      ...g.spawns.map((s) => s.id),
      ...g.props.map((p) => p.id),
      ...g.spots.map((s) => s.id),
      ...map.buildings.map((b) => b.name),
      ...map.solids.map((o) => `solid.${Math.round(o.x / TILE_PX)},${Math.round(o.y / TILE_PX)}`),
    ]);
    for (const n of build.nodes) expect(known, n.id).toContain(sourceId(n.id));
  });

  it('lays one ground tile per cell with a material, inside the scene', () => {
    const { map, build } = built('bakery', false);
    expect(build.ground.length).toBe(map.ground.filter((gid) => gid > 0).length);
    for (const t of build.ground) {
      expect(t.tx).toBeLessThan(map.w);
      expect(t.ty).toBeLessThan(map.h);
    }
  });

  it('draws walls as boxes and a building as one box on its footprint', () => {
    const { map, build } = built('overworld', true);
    const b = map.buildings[0]!;
    const boxes = build.nodes.filter((n) => n.kind === 'box' && n.id === b.name);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ w: b.width, d: b.height });
    const walls = build.nodes.filter((n) => n.id.startsWith('solid.') && n.kind === 'box');
    expect(walls.length).toBeGreaterThan(0);
    // Only kit walls drop to a sill (R4): a building keeps its height.
    expect(boxes[0]).toMatchObject({ wall: false });
    expect(walls.some((n) => n.kind === 'box' && n.wall)).toBe(true);
  });
});
