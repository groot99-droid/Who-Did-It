// What the sprite world draws for one scene (round 11, R1; sprite-world.md 1). Pure: it reads the same tilemap and the
// same static defs as the Phaser path (`readSceneMap`, `mapStatics`) and says where each ground tile, box and
// billboard stands, in world px. `SpriteWorld` turns it into Three.js objects. It adds no id: every node carries the
// id of the tilemap object it came from.
import { TILE_PX } from '@wdi/shared/constants';
import type { TiledMap, SceneMap } from '../view/sceneMap';
import type { StaticDef } from '../view/statics';
import { parseKitFrame } from '../view/statics';
import { groundColour, materialOfGid, shade, tokenColour } from '../view/greyboxColours';
import { unitsOfRise } from './frame';

/** An upright box on a footprint: a wall, a building, or the greybox block of a def whose art is missing. */
export interface BoxNode {
  kind: 'box';
  id: string;
  /** Centre of the footprint, world px, and its size along world x (`w`) and y (`d`). */
  x: number;
  y: number;
  w: number;
  d: number;
  /** Height in scene units. */
  h: number;
  colour: number;
  hidden: boolean;
  /** A kit wall, which drops to a sill when it stands between the camera and the player (R4, `cutaway.ts`). */
  wall: boolean;
}

/** An upright billboard of an atlas frame, standing on its pivot at (x, y). */
export interface BillboardNode {
  kind: 'billboard';
  id: string;
  x: number;
  y: number;
  atlas: string;
  frame: string;
  /** The unlit frame of a lantern post (`StaticDef.frameAlt`). */
  frameAlt?: string;
  flipX: boolean;
  hidden: boolean;
}

/** A named point of the scene graph that draws nothing yet: a portal or a spawn. */
export interface MarkNode {
  kind: 'mark';
  id: string;
  what: 'portal' | 'spawn';
  x: number;
  y: number;
}

export type SceneNode = BoxNode | BillboardNode | MarkNode;

export interface SceneBuild {
  /** Size in tiles. */
  w: number;
  h: number;
  voidColour: number;
  /** One flat tile per ground cell that has a material. */
  ground: Array<{ tx: number; ty: number; colour: number }>;
  nodes: SceneNode[];
}

/** Kit kinds drawn as boxes; trees, boulders and stacks stand as billboards (sprite-world 1). */
const BOX_KITS = new Set(['wall', 'cliff', 'fence']);

/** The spawns of a tilemap (its `spawns` object group), at their tile's centre in world px. */
export function readSpawns(m: TiledMap): Array<{ id: string; x: number; y: number }> {
  const group = m.layers?.find((l) => l.name === 'spawns' && l.type === 'objectgroup');
  return (group?.objects ?? []).map((o) => ({
    id: o.name,
    x: (o.x ?? 0) + TILE_PX / 2,
    y: (o.y ?? 0) + TILE_PX / 2,
  }));
}

/** The id of the tilemap object a def came from: a slice `name#dx_dy` and an overlay `name~boarded` share it. */
export const sourceId = (defId: string): string => defId.split(/[#~]/)[0]!;

const boxOf = (d: StaticDef, colour: number): BoxNode => ({
  kind: 'box',
  id: d.id,
  x: d.x,
  y: d.y,
  w: d.tilesW * TILE_PX,
  d: d.tilesH * TILE_PX,
  h: unitsOfRise(d.heightPx),
  colour,
  hidden: d.hidden === true,
  wall: false,
});

/**
 * The sprite world of one scene. `hasArt(atlas, frame)` says whether a frame is loaded (the texture source's
 * answer); a def without art stands as its greybox block, as on the Phaser path (SPRITES 10.13).
 */
export function buildScene(
  map: SceneMap,
  spawns: Array<{ id: string; x: number; y: number }>,
  defs: StaticDef[],
  hasArt: (atlas: string, frame: string) => boolean,
): SceneBuild {
  const ground: SceneBuild['ground'] = [];
  for (let ty = 0; ty < map.h; ty++)
    for (let tx = 0; tx < map.w; tx++) {
      if (map.ground.length === 0) {
        ground.push({ tx, ty, colour: shade(tokenColour('slate'), 1.3) });
        continue;
      }
      const material = materialOfGid(map.ground[ty * map.w + tx] ?? 0);
      if (material !== null) ground.push({ tx, ty, colour: groundColour(material) });
    }

  const nodes: SceneNode[] = [];
  const buildings = new Map(map.buildings.map((b) => [b.name, b]));
  const placed = new Set<string>();
  for (const d of defs) {
    const building = buildings.get(sourceId(d.id));
    if (building && d.id.includes('#')) {
      // A building is one box on its footprint (its slices share the footprint's centre ground point).
      if (placed.has(building.name)) continue;
      placed.add(building.name);
      nodes.push({
        ...boxOf(d, tokenColour('slate')),
        id: building.name,
        w: building.width,
        d: building.height,
      });
      continue;
    }
    const kit = d.id.startsWith('solid.') ? parseKitFrame(d.frame) : null;
    if (kit && BOX_KITS.has(kit.kind)) {
      const box = boxOf(d, shade(tokenColour('slate'), kit.kind === 'fence' ? 0.8 : 1));
      nodes.push({ ...box, wall: kit.kind === 'wall' });
      continue;
    }
    if (d.atlas !== '' && hasArt(d.atlas, d.frame)) {
      nodes.push({
        kind: 'billboard',
        id: d.id,
        x: d.x,
        y: d.y,
        atlas: d.atlas,
        frame: d.frame,
        ...(d.frameAlt !== undefined ? { frameAlt: d.frameAlt } : {}),
        flipX: d.flipX === true,
        hidden: d.hidden === true,
      });
      continue;
    }
    if (d.heightPx > 0) nodes.push(boxOf(d, tokenColour(d.colour ?? (d.occluder ? 'slate' : 'ink'))));
  }
  for (const p of map.portals) nodes.push({ kind: 'mark', id: p.id, what: 'portal', x: p.x, y: p.y });
  for (const s of spawns) nodes.push({ kind: 'mark', id: s.id, what: 'spawn', x: s.x, y: s.y });
  return { w: map.w, h: map.h, voidColour: tokenColour(map.voidColour), ground, nodes };
}
