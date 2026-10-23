// The placement rules of round 8 (docs/round8/art.md 4.1), as one pure check over a scene. Each map's test
// (`placement.<map>.test.ts`) gives the classes of its own prop kinds, spot variants and light holders, because
// what a prop needs (a wall behind it, floor in front, a table under it) is a fact of its art, not of the rules.
//
// Props stand on solid `#` tiles (their material is `P`) unless their class is `floor` or an overlay. The art
// of every prop and spot faces south (its front is the -Y face, `tools/blender/env/kitbash.py`), so "faces out of
// the wall" means: a wall-hung thing has a solid tile north of it and floor south of it, and a fronted thing has
// floor south of it.
import type { Scene } from '../src/index.js';

/**
 * - `hung`: on a wall (a solid tile behind it, to the north) and facing the floor south of it;
 * - `hungEast`: on a west wall (a solid tile behind it, to the west) and facing the floor east of it;
 * - `front`: free-standing with a front, used from the floor south of it;
 * - `frontEast`: free-standing with a front, used from the floor east of it;
 * - `free`: free-standing, used or seen from any side;
 * - `floor`: flat on a walkable tile (a mark, a rug), never solid;
 * - `overlay`: one tile inside a `surface` prop's footprint (the plates on the Wake Table);
 * - `doorOverlay`: one tile over a building's door (the mourning crepe);
 * - `surface`: a table or ledge that overlays stand on; free otherwise.
 */
export type PlaceClass =
  'hung' | 'hungEast' | 'front' | 'frontEast' | 'free' | 'floor' | 'overlay' | 'doorOverlay' | 'surface';

export interface PlacementRules {
  /** The class of a prop, by kind, or by id tail for `decor` and `taskSource` (whose art is keyed by the tail). */
  props: Record<string, PlaceClass>;
  /** The class of a spot variant (hiding and body spots stand on their own `H` or `B` tile). */
  spots: Record<string, Exclude<PlaceClass, 'floor' | 'overlay' | 'doorOverlay' | 'surface'>>;
  /**
   * What holds a light of each kind: prop classes keys (kind or tail) that carry one, and whether a wall tile or
   * a building may (a torch on a bracket, a lit window). A kind missing here may stand anywhere (moss, shafts).
   */
  lights: Partial<
    Record<
      string,
      { props: readonly string[]; wall?: boolean; building?: boolean; floor?: boolean; outdoors?: boolean }
    >
  >;
  /** Kinds whose ids are economy props (seams.md 2): placed by 8C and 8D, kept clear and reachable here. */
  economyTails?: readonly string[];
}

const WALKABLE = new Set(['.', 'S']);
const NEIGHBOURS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;

/** The art key of a prop: its kind, or its id tail for the kinds whose art is keyed by the tail. */
export const propKey = (p: { id: string; kind: string }): string =>
  p.kind === 'decor' || p.kind === 'taskSource' ? p.id.slice(p.id.indexOf('.') + 1) : p.kind;

const ECONOMY = ['shop_', 'bank_', 'altar_', 'rack_', 'mailbag_', 'hq_'];
const isEconomy = (id: string) => ECONOMY.some((e) => id.slice(id.indexOf('.') + 1).startsWith(e));

/**
 * Every placement problem of one scene, each a sentence naming the object. `taskProps` are the ids of the props
 * that are a task's node in this scene (tasks.json), which must stay reachable like a station.
 */
export function placementProblems(
  scene: Scene,
  rules: PlacementRules,
  taskProps: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  const { w, h } = scene.size;
  const grid = (x: number, y: number) => scene.grid[y]?.[x];
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h;
  const walkable = (x: number, y: number) => WALKABLE.has(grid(x, y) ?? '#');
  const solid = (x: number, y: number) => !inside(x, y) || !walkable(x, y);
  const key = (x: number, y: number) => `${x},${y}`;

  // Reachability from the first spawn, with every gate open (the scene at its largest profile).
  const reached = new Set<string>();
  const start = scene.spawns[0]!;
  const stack: Array<[number, number]> = [[start.x, start.y]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (reached.has(key(x, y)) || !inside(x, y) || !walkable(x, y)) continue;
    reached.add(key(x, y));
    for (const [dx, dy] of NEIGHBOURS) stack.push([x + dx, y + dy]);
  }
  const unreached: string[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (walkable(x, y) && !reached.has(key(x, y))) unreached.push(key(x, y));
  if (unreached.length)
    out.push(
      `floor ${unreached.slice(0, 6).join(' ')}${unreached.length > 6 ? ' …' : ''} is unreachable from spawn ${start.id}`,
    );
  const reachableFrom = (x: number, y: number) =>
    NEIGHBOURS.some(([dx, dy]) => reached.has(key(x + dx, y + dy)));

  // The tiles each prop takes, and who holds every tile.
  const tilesOf = (p: Scene['props'][number]): Array<[number, number]> => {
    if (!p.footprint) return [[p.x, p.y]];
    const t: Array<[number, number]> = [];
    for (let y = p.footprint.y; y < p.footprint.y + p.footprint.h; y++)
      for (let x = p.footprint.x; x < p.footprint.x + p.footprint.w; x++) t.push([x, y]);
    return t;
  };
  const buildingAt = new Map<string, string>();
  for (const b of scene.buildings ?? [])
    for (let y = b.footprint.y; y < b.footprint.y + b.footprint.h; y++)
      for (let x = b.footprint.x; x < b.footprint.x + b.footprint.w; x++) buildingAt.set(key(x, y), b.id);
  const classOf = (p: Scene['props'][number]): PlaceClass | undefined => rules.props[propKey(p)];
  const holder = new Map<string, Scene['props'][number]>();
  const overlays: Array<Scene['props'][number]> = [];
  for (const p of scene.props) {
    const cls = classOf(p);
    if (cls === undefined && !isEconomy(p.id)) {
      out.push(`prop ${p.id} (${propKey(p)}) has no placement class`);
      continue;
    }
    if (cls === 'overlay' || cls === 'doorOverlay') {
      overlays.push(p);
      continue;
    }
    for (const [x, y] of tilesOf(p)) {
      const other = holder.get(key(x, y));
      if (other) out.push(`prop ${p.id} overlaps ${other.id} at ${key(x, y)}`);
      else holder.set(key(x, y), p);
      if (buildingAt.has(key(x, y)))
        out.push(`prop ${p.id} stands inside building ${buildingAt.get(key(x, y))}`);
    }
  }

  // Overlays sit on a surface's footprint, or on a building's door; nothing else shares a tile.
  for (const p of overlays) {
    const cls = classOf(p);
    const under = holder.get(key(p.x, p.y));
    if (cls === 'overlay' && (!under || classOf(under) !== 'surface'))
      out.push(`overlay ${p.id} is not on a table or ledge`);
    if (cls === 'doorOverlay' && !(grid(p.x, p.y) === 'D' && buildingAt.has(key(p.x, p.y))))
      out.push(`overlay ${p.id} is not on a building's door`);
  }

  // What each prop stands on, and which way it faces.
  for (const p of scene.props) {
    const cls = classOf(p);
    if (cls === undefined || cls === 'overlay' || cls === 'doorOverlay') continue;
    const tiles = tilesOf(p);
    if (cls === 'floor') {
      if (!tiles.every(([x, y]) => walkable(x, y))) out.push(`floor prop ${p.id} is not on a walkable tile`);
    } else if (!tiles.every(([x, y]) => grid(x, y) === '#'))
      out.push(
        `prop ${p.id} stands on a walkable tile or a door or spot (it is solid, so it needs a "#" tile)`,
      );
    const edge = (dx: number, dy: number) =>
      tiles.filter(([x, y]) => !tiles.some(([a, b]) => a === x + dx && b === y + dy));
    if ((cls === 'hung' || cls === 'front') && !edge(0, 1).some(([x, y]) => walkable(x, y + 1)))
      out.push(`prop ${p.id} faces south into no floor (its front is hidden)`);
    if ((cls === 'hungEast' || cls === 'frontEast') && !edge(1, 0).some(([x, y]) => walkable(x + 1, y)))
      out.push(`prop ${p.id} faces east into no floor (its front is hidden)`);
    if (cls === 'hung' && !edge(0, -1).every(([x, y]) => solid(x, y - 1)))
      out.push(`wall-hung prop ${p.id} has no wall behind it`);
    if (cls === 'hungEast' && !edge(-1, 0).every(([x, y]) => solid(x - 1, y)))
      out.push(`wall-hung prop ${p.id} has no wall behind it`);
    if (cls !== 'floor' && !tiles.some(([x, y]) => reachableFrom(x, y)))
      out.push(`prop ${p.id} has no reachable floor beside it`);
  }
  for (const s of scene.spots) {
    const cls = rules.spots[s.variant];
    if (cls === undefined) out.push(`spot ${s.id} (${s.variant}) has no placement class`);
    if ((cls === 'hung' || cls === 'front') && !walkable(s.x, s.y + 1))
      out.push(`spot ${s.id} faces south into no floor`);
    if ((cls === 'hungEast' || cls === 'frontEast') && !walkable(s.x + 1, s.y))
      out.push(`spot ${s.id} faces east into no floor`);
    if (cls === 'hung' && !solid(s.x, s.y - 1)) out.push(`wall-hung spot ${s.id} has no wall behind it`);
    if (cls === 'hungEast' && !solid(s.x - 1, s.y)) out.push(`wall-hung spot ${s.id} has no wall behind it`);
  }

  // Nothing blocks the things a player must reach: doors, spawns, spots, task nodes, resource nodes, stations
  // and economy props each keep a reachable floor tile beside them, and no prop stands on a door's approach.
  const props = new Map(scene.props.map((p) => [p.id, p]));
  for (const d of scene.portals) {
    const approach = NEIGHBOURS.map(([dx, dy]) => [d.x + dx, d.y + dy] as const).filter(([x, y]) =>
      walkable(x, y),
    );
    if (!approach.some(([x, y]) => reached.has(key(x, y))))
      out.push(`portal ${d.id} has no reachable approach`);
    for (const [x, y] of approach) {
      const p = holder.get(key(x, y));
      if (p && classOf(p) !== 'floor') out.push(`prop ${p.id} stands on the approach of portal ${d.id}`);
    }
  }
  for (const s of scene.spawns) {
    if (!reached.has(key(s.x, s.y))) out.push(`spawn ${s.id} is unreachable`);
    const p = holder.get(key(s.x, s.y));
    if (p && classOf(p) !== 'floor') out.push(`prop ${p.id} stands on spawn ${s.id}`);
  }
  for (const s of scene.spots)
    if (!reachableFrom(s.x, s.y)) out.push(`spot ${s.id} has no reachable floor beside it`);
  for (const n of scene.nodes ?? []) {
    const ok = walkable(n.x, n.y) ? reached.has(key(n.x, n.y)) : reachableFrom(n.x, n.y);
    if (!ok) out.push(`node ${n.id} is unreachable`);
    const p = holder.get(key(n.x, n.y));
    if (p) out.push(`prop ${p.id} stands on node ${n.id}`);
  }
  for (const id of taskProps) {
    const p = props.get(id);
    if (p && !tilesOf(p).some(([x, y]) => reachableFrom(x, y))) out.push(`task prop ${id} is unreachable`);
  }
  for (const p of scene.props)
    if (isEconomy(p.id) && !tilesOf(p).some(([x, y]) => reachableFrom(x, y) || reached.has(key(x, y))))
      out.push(`economy prop ${p.id} is unreachable`);
  for (const g of scene.givers ?? [])
    if (!reached.has(key(g.x, g.y))) out.push(`giver ${g.id} is unreachable`);

  // Lights hang on something that could hold them.
  for (const l of scene.lights ?? []) {
    const need = rules.lights[l.kind];
    if (!need) continue;
    const p = holder.get(key(l.x, l.y)) ?? overlays.find((o) => o.x === l.x && o.y === l.y);
    const onProp = p !== undefined && need.props.includes(propKey(p));
    const onWall =
      need.wall === true && grid(l.x, l.y) === '#' && p === undefined && !buildingAt.has(key(l.x, l.y));
    const onBuilding = need.building === true && buildingAt.has(key(l.x, l.y));
    const onFloor = need.floor === true && walkable(l.x, l.y);
    const outdoors = need.outdoors === true && scene.kind === 'exterior';
    if (!onProp && !onWall && !onBuilding && !onFloor && !outdoors)
      out.push(`light ${l.id} (${l.kind}) at ${key(l.x, l.y)} hangs on nothing that could hold it`);
  }
  return out;
}
