// Round 9 (9U, docs/round9/admin-studio.md 3): the editor's edits on things with a footprint: a building and a multi-tile
// prop. The footprint's tiles are solid `#` and covered `P` in the grid (`validateWorld.ts`), so a move carries the
// block's cells with it, a delete clears them to floor, and a new one is stamped on open floor. What stands in a
// footprint (a building's doors, the plates on a table) rides along. Pure, like `sceneEdit.ts`.
import { biomeOf, DEFAULT_FLOOR, type Scene } from '@wdi/content';
import { materialFor } from './gridEdit';
import { moveGate, movePath, removeRoute } from './routeEdit';
import {
  duplicate,
  find,
  listOf,
  move,
  patch,
  place,
  remove,
  type Edit,
  type Kind,
  type Obj,
  type Pick,
} from './sceneEdit';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const footprintOf = (o: object | undefined): Rect | undefined =>
  (o as { footprint?: Rect } | undefined)?.footprint;
const inRect = (r: Rect, x: number, y: number) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
const tilesOf = (r: Rect): Array<[number, number]> =>
  Array.from({ length: r.w * r.h }, (_, i) => [r.x + (i % r.w), r.y + Math.floor(i / r.w)]);

/** Kinds whose objects stand on a grid tile of their own and ride a block they stand in. */
const RIDERS = ['portals', 'spots', 'lights', 'props'] as const;

/** Resource nodes stand on a block's tiles (the plates on the Wake Table) and ride with it. */
const nodesIn = (scene: Scene, fp: Rect) => (scene.nodes ?? []).filter((n) => inRect(fp, n.x, n.y));

const floorMaterial = (scene: Scene) => materialFor(scene, false) ?? DEFAULT_FLOOR[biomeOf(scene)];

/** Everything but the block itself that stands inside its footprint. */
function ridersOf(scene: Scene, self: Pick, fp: Rect): Pick[] {
  return RIDERS.flatMap((kind) =>
    listOf(scene, kind)
      .filter((o) => inRect(fp, o.x, o.y) && !(kind === self.kind && o.id === self.id))
      .filter((o) => footprintOf(o) === undefined)
      .map((o) => ({ kind, id: o.id })),
  );
}

/** Why `to` cannot hold a block, or null. Tiles of `from` (the block's own, when it moves) count as free. */
function blocked(
  scene: Scene,
  to: Rect,
  from: Rect | null,
  self: string,
  riders: readonly Pick[],
): string | null {
  const ride = new Set(riders.map((r) => r.id));
  for (const [x, y] of tilesOf(to)) {
    if (x < 0 || y < 0 || x >= scene.size.w || y >= scene.size.h)
      return 'the footprint would leave the scene';
    if (from !== null && inRect(from, x, y)) continue;
    const ch = scene.grid[y]![x]!;
    if (ch !== '.') return `${x},${y} is ${ch === '#' ? 'a wall' : 'not open floor'}; clear it first`;
    for (const kind of ['props', 'buildings'] as const)
      for (const o of listOf(scene, kind)) {
        const fp = footprintOf(o);
        if (o.id !== self && fp !== undefined && inRect(fp, x, y)) return `it would overlap ${o.id}`;
      }
    for (const kind of ['portals', 'spawns', 'spots', 'props'] as const) {
      const hit = listOf(scene, kind).find((o) => o.x === x && o.y === y && o.id !== self && !ride.has(o.id));
      if (hit !== undefined) return `${hit.id} stands at ${x},${y}`;
    }
  }
  return null;
}

type Cells = { grid: string[][]; material: string[][] | null };
const cellsOf = (scene: Scene): Cells => ({
  grid: scene.grid.map((r) => r.split('')),
  material: scene.material?.map((r) => r.split('')) ?? null,
});
const withCells = (scene: Scene, c: Cells): Scene => ({
  ...scene,
  grid: c.grid.map((r) => r.join('')),
  ...(c.material === null ? {} : { material: c.material.map((r) => r.join('')) }),
});

/** Moves a building or a multi-tile prop to a tile, taking its grid and material cells and what stands in it. */
export function moveBlock(scene: Scene, pick: Pick, x: number, y: number): Edit {
  const o = find(scene, pick);
  const fp = footprintOf(o);
  if (o === undefined || fp === undefined) return { error: `${pick.id} is not in this scene` };
  const dx = x - o.x;
  const dy = y - o.y;
  if (dx === 0 && dy === 0) return { scene };
  const to = { ...fp, x: fp.x + dx, y: fp.y + dy };
  const riders = ridersOf(scene, pick, fp);
  const why = blocked(scene, to, fp, pick.id, riders);
  if (why !== null) return { error: why };
  const c = cellsOf(scene);
  const floor = floorMaterial(scene);
  const cells = tilesOf(fp).map(([tx, ty]) => ({ tx, ty, g: c.grid[ty]![tx]!, m: c.material?.[ty]![tx] }));
  for (const k of cells) {
    c.grid[k.ty]![k.tx] = '.';
    if (c.material !== null) c.material[k.ty]![k.tx] = floor;
  }
  for (const k of cells) {
    c.grid[k.ty + dy]![k.tx + dx] = k.g;
    if (c.material !== null) c.material[k.ty + dy]![k.tx + dx] = k.m ?? floor;
  }
  const rides = (kind: Kind, id: string) => riders.some((r) => r.kind === kind && r.id === id);
  const shift = (kind: Kind) => (e: Obj) => {
    const self = kind === pick.kind && e.id === pick.id;
    if (!self && !rides(kind, e.id)) return e;
    return { ...e, x: e.x + dx, y: e.y + dy, ...(self && kind === 'props' ? { footprint: to } : {}) };
  };
  const next = withCells(scene, c);
  return {
    scene: {
      ...next,
      portals: next.portals.map((p) => shift('portals')(p) as never),
      spots: next.spots.map((p) => shift('spots')(p) as never),
      props: next.props.map((p) => shift('props')(p) as never),
      ...(next.nodes === undefined
        ? {}
        : { nodes: next.nodes.map((n) => (inRect(fp, n.x, n.y) ? { ...n, x: n.x + dx, y: n.y + dy } : n)) }),
      ...(next.lights === undefined ? {} : { lights: next.lights.map((p) => shift('lights')(p) as never) }),
      ...(next.buildings === undefined
        ? {}
        : { buildings: next.buildings.map((b) => (b.id === pick.id ? { ...b, footprint: to } : b)) }),
    },
  };
}

/** Makes the tiles of a new block solid and covered; they must be open floor. */
function stamp(scene: Scene, r: Rect, self: string): Edit {
  const why = blocked(scene, r, null, self, []);
  if (why !== null) return { error: why };
  const c = cellsOf(scene);
  for (const [tx, ty] of tilesOf(r)) {
    c.grid[ty]![tx] = '#';
    if (c.material !== null) c.material[ty]![tx] = 'P';
  }
  return { scene: withCells(scene, c) };
}

/** Deletes a block and turns its tiles back to floor; what stands in it must be moved or deleted first. */
function removeBlock(scene: Scene, pick: Pick, base: Scene, refs: readonly string[]): Edit {
  const fp = footprintOf(find(scene, pick))!;
  const riders = [
    ...ridersOf(scene, pick, fp),
    ...nodesIn(scene, fp).map((n) => ({ kind: pick.kind, id: n.id })),
  ];
  if (riders.length > 0)
    return { error: `${riders.map((r) => r.id).join(', ')} stands in ${pick.id}; move or delete it first` };
  const gone = remove(scene, pick, base, refs);
  if ('error' in gone) return gone;
  const c = cellsOf(gone.scene);
  const floor = floorMaterial(scene);
  for (const [tx, ty] of tilesOf(fp)) {
    c.grid[ty]![tx] = '.';
    if (c.material !== null) c.material[ty]![tx] = floor;
  }
  return { scene: withCells(gone.scene, c) };
}

/** The nearest open place for a copy of a block, scanning outward from the original. */
function roomFor(scene: Scene, fp: Rect, self: string): Rect | null {
  let best: { r: Rect; d: number } | null = null;
  for (let y = 0; y + fp.h <= scene.size.h; y++)
    for (let x = 0; x + fp.w <= scene.size.w; x++) {
      const r = { ...fp, x, y };
      const d = Math.abs(x - fp.x) + Math.abs(y - fp.y);
      if ((best === null || d < best.d) && blocked(scene, r, null, self, []) === null) best = { r, d };
    }
  return best?.r ?? null;
}

export const isBlock = (scene: Scene, pick: Pick) => footprintOf(find(scene, pick)) !== undefined;

/** `move`, `place`, `duplicate` and `remove` for any object: a block goes through its footprint's cells. */
export function moveAny(scene: Scene, pick: Pick, x: number, y: number): Edit {
  if (pick.kind === 'gates') return moveGate(scene, pick.id, x, y);
  if (pick.kind === 'paths') return movePath(scene, pick.id, x, y);
  return isBlock(scene, pick) ? moveBlock(scene, pick, x, y) : move(scene, pick, x, y);
}

const ROUTE = new Set<Kind>(['gates', 'paths']);

export function placeAny(
  scene: Scene,
  kind: Kind,
  name: string,
  x: number,
  y: number,
  template: object,
): Edit {
  if (ROUTE.has(kind)) return { error: 'gates and paths are drawn with their own tools' };
  const made = place(scene, kind, name, x, y, template);
  const fp = footprintOf(template);
  if ('error' in made || fp === undefined) return made;
  return stamp(made.scene, { x, y, w: fp.w, h: fp.h }, `${scene.prefix}.${name}`);
}

export function duplicateAny(scene: Scene, pick: Pick, name: string): Edit {
  if (ROUTE.has(pick.kind)) return { error: 'draw a gate or a path again to make another' };
  const fp = footprintOf(find(scene, pick));
  if (fp === undefined) return duplicate(scene, pick, name);
  const at = roomFor(scene, fp, pick.id);
  if (at === null) return { error: 'there is no open floor for a copy' };
  const { id: _id, x: _x, y: _y, ...rest } = find(scene, pick)!;
  return placeAny(scene, pick.kind, name, at.x, at.y, rest);
}

export function removeAny(scene: Scene, pick: Pick, base: Scene, refs: readonly string[]): Edit {
  if (ROUTE.has(pick.kind)) return removeRoute(scene, pick.id, base);
  return isBlock(scene, pick) ? removeBlock(scene, pick, base, refs) : remove(scene, pick, base, refs);
}

const FACINGS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
const withRot = (o: object, rot: number): object => {
  const { rot: _r, ...rest } = o as { rot?: number };
  return rot === 0 ? rest : { ...rest, rot };
};

/**
 * A quarter turn clockwise (WORLD 4.3). A spawn or a quest giver turns its facing two steps; a prop or building
 * takes the next `rot`. A 90 or 270 turn of a block swaps its footprint's sides at its corner: what stands in it
 * (plates, lights) is transposed with it, a door cannot be and stops the turn; the new tiles must be open floor.
 */
export function rotate(scene: Scene, pick: Pick): Edit {
  const o = find(scene, pick);
  if (o === undefined) return { error: `${pick.id} is not in this scene` };
  if (pick.kind === 'spawns' || pick.kind === 'givers') {
    const i = FACINGS.indexOf((o as unknown as { facing: (typeof FACINGS)[number] }).facing);
    return patch(scene, pick, { facing: FACINGS[(i + 2) % 8] });
  }
  if (pick.kind !== 'props' && pick.kind !== 'buildings')
    return { error: `a ${pick.kind} object does not turn` };
  const rot = (((o as { rot?: number }).rot ?? 0) + 90) % 360;
  const fp = footprintOf(o);
  const turned = (s: Scene, to?: Rect): Scene => {
    const set = (e: { id: string }) =>
      e.id === pick.id ? withRot({ ...e, ...(to === undefined ? {} : { footprint: to }) }, rot) : e;
    return pick.kind === 'props'
      ? { ...s, props: s.props.map((e) => set(e) as never) }
      : { ...s, buildings: (s.buildings ?? []).map((e) => set(e) as never) };
  };
  if (fp === undefined || rot % 180 === 0) return { scene: turned(scene) };
  const to = { x: fp.x, y: fp.y, w: fp.h, h: fp.w };
  const riders = ridersOf(scene, pick, fp);
  const door = riders.find((r) => r.kind === 'portals');
  if (door !== undefined) return { error: `${door.id} is a door of ${pick.id}; move it before turning` };
  const why = blocked(scene, to, fp, pick.id, riders);
  if (why !== null) return { error: why };
  const c = cellsOf(scene);
  const floor = floorMaterial(scene);
  for (const [tx, ty] of tilesOf(fp)) {
    c.grid[ty]![tx] = '.';
    if (c.material !== null) c.material[ty]![tx] = floor;
  }
  for (const [tx, ty] of tilesOf(to)) {
    c.grid[ty]![tx] = '#';
    if (c.material !== null) c.material[ty]![tx] = 'P';
  }
  const flip = <T extends { x: number; y: number }>(e: T): T => ({
    ...e,
    x: fp.x + (e.y - fp.y),
    y: fp.y + (e.x - fp.x),
  });
  const rides = (kind: Kind) => (e: { id: string }) => riders.some((r) => r.kind === kind && r.id === e.id);
  const next = turned(withCells(scene, c), to);
  return {
    scene: {
      ...next,
      spots: next.spots.map((e) => (rides('spots')(e) ? flip(e) : e)),
      props: next.props.map((e) => (rides('props')(e) ? flip(e) : e)),
      ...(next.lights === undefined
        ? {}
        : { lights: next.lights.map((e) => (rides('lights')(e) ? flip(e) : e)) }),
      ...(next.nodes === undefined
        ? {}
        : { nodes: next.nodes.map((n) => (inRect(fp, n.x, n.y) ? flip(n) : n)) }),
    },
  };
}
