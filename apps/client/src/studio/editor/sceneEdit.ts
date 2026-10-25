// Round 9 (9T, docs/round9/admin-studio.md 3): the editor's pure edits on a scene document. Every edit returns a new
// scene or an error line; nothing here touches Phaser or the network, so the whole of it is tested.
import type { Scene } from '@wdi/content';

/** Everything a click can select. The first group is placed from the palette; gates and paths have their own tools. */
export const PLACEABLE = [
  'props',
  'portals',
  'spawns',
  'spots',
  'lights',
  'buildings',
  'nodes',
  'spawners',
  'givers',
] as const;
export const KINDS = [...PLACEABLE, 'gates', 'paths'] as const;
export type Kind = (typeof KINDS)[number];
export interface Pick {
  kind: Kind;
  id: string;
}
export interface Obj {
  id: string;
  x: number;
  y: number;
}
export type Edit = { scene: Scene } | { error: string };

const NAME = /^[a-z][a-z0-9_]*$/;

/**
 * A building has no tile of its own and a path none either: the editor reads a building's footprint corner and a
 * path's first corner as one, and `swap` drops it again.
 */
export const listOf = (scene: Scene, kind: Kind): Obj[] =>
  kind === 'buildings'
    ? (scene.buildings ?? []).map((b) => ({ ...b, x: b.footprint.x, y: b.footprint.y }))
    : kind === 'paths'
      ? scene.paths.map((p) => ({ ...p, x: p.points[0]!.x, y: p.points[0]!.y }))
      : ((scene[kind] ?? []) as Obj[]);
export const find = (scene: Scene, pick: Pick): Obj | undefined =>
  listOf(scene, pick.kind).find((o) => o.id === pick.id);

const inside = (scene: Scene, x: number, y: number) =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < scene.size.w && y < scene.size.h;

function swap(scene: Scene, kind: Kind, f: (list: Obj[]) => Obj[]): Scene {
  const next = f(listOf(scene, kind));
  return {
    ...scene,
    [kind]: kind === 'buildings' || kind === 'paths' ? next.map(({ x: _x, y: _y, ...rest }) => rest) : next,
  } as Scene;
}

/** A new object's id: `<prefix>.<name>`, and a spawn's plain `<name>` (spawn ids are local to their scene). */
export function idFor(scene: Scene, kind: Kind, name: string): string | null {
  if (!NAME.test(name)) return null;
  return kind === 'spawns' ? name : `${scene.prefix}.${name}`;
}

/** Moves an object to a tile; a prop's footprint moves with it and must stay inside the scene. */
export function move(scene: Scene, pick: Pick, x: number, y: number): Edit {
  const o = find(scene, pick);
  if (o === undefined) return { error: `${pick.id} is not in this scene` };
  if (!inside(scene, x, y)) return { error: `tile ${x},${y} is outside the scene` };
  const dx = x - o.x;
  const dy = y - o.y;
  const fp = (o as { footprint?: { x: number; y: number; w: number; h: number } }).footprint;
  if (fp !== undefined && !inside(scene, fp.x + dx, fp.y + dy))
    return { error: 'the footprint would leave the scene' };
  if (fp !== undefined && !inside(scene, fp.x + dx + fp.w - 1, fp.y + dy + fp.h - 1)) {
    return { error: 'the footprint would leave the scene' };
  }
  return {
    scene: swap(scene, pick.kind, (l) =>
      l.map((e) =>
        e.id !== pick.id
          ? e
          : { ...e, x, y, ...(fp === undefined ? {} : { footprint: { ...fp, x: fp.x + dx, y: fp.y + dy } }) },
      ),
    ),
  };
}

/** Adds an object from a template (its type-specific fields) at a tile, under a new name. */
export function place(scene: Scene, kind: Kind, name: string, x: number, y: number, template: object): Edit {
  const id = idFor(scene, kind, name);
  if (id === null)
    return { error: 'a name is lowercase letters, digits and underscores, starting with a letter' };
  if (!inside(scene, x, y)) return { error: `tile ${x},${y} is outside the scene` };
  if (KINDS.some((k) => listOf(scene, k).some((o) => o.id === id))) return { error: `${id} already exists` };
  const fp = (template as { footprint?: { w: number; h: number } }).footprint;
  const shape = fp === undefined ? {} : { footprint: { x, y, w: fp.w, h: fp.h } };
  if (fp !== undefined && !inside(scene, x + fp.w - 1, y + fp.h - 1))
    return { error: 'the footprint would leave the scene' };
  return { scene: swap(scene, kind, (l) => [...l, { ...template, id, x, y, ...shape } as Obj]) };
}

/** A copy of an object one tile east (or south at the edge) under a new name. */
export function duplicate(scene: Scene, pick: Pick, name: string): Edit {
  const o = find(scene, pick);
  if (o === undefined) return { error: `${pick.id} is not in this scene` };
  const { id: _id, ...rest } = o;
  const x = o.x + 1 < scene.size.w ? o.x + 1 : o.x;
  const y = x === o.x ? Math.min(o.y + 1, scene.size.h - 1) : o.y;
  return place(scene, pick.kind, name, x, y, rest);
}

/**
 * Deletes an object. An id the committed scene already had is frozen: it goes only when nothing else names it
 * (`refs` are the places that do, from `referencesTo`); an id made in this session goes freely.
 */
export function remove(scene: Scene, pick: Pick, base: Scene, refs: readonly string[]): Edit {
  if (find(scene, pick) === undefined) return { error: `${pick.id} is not in this scene` };
  if (find(base, pick) !== undefined && refs.length > 0) {
    return { error: `${pick.id} is named elsewhere: ${refs.join(', ')}` };
  }
  return { scene: swap(scene, pick.kind, (l) => l.filter((o) => o.id !== pick.id)) };
}

/** Sets plain fields of an object (a portal's target, a light's radius); ids and tiles go through their own edits. */
export function patch(scene: Scene, pick: Pick, fields: Record<string, unknown>): Edit {
  if (find(scene, pick) === undefined) return { error: `${pick.id} is not in this scene` };
  if ('id' in fields || 'x' in fields || 'y' in fields)
    return { error: 'ids are frozen; tiles move with the move tool' };
  return { scene: swap(scene, pick.kind, (l) => l.map((o) => (o.id === pick.id ? { ...o, ...fields } : o))) };
}

/** The portal on the other side: in the target scene, the one whose own target is this scene. */
export function pairedPortal(
  portal: { id: string; from: string; to: string | null },
  scenes: Record<string, Scene>,
) {
  if (portal.to === null) return undefined;
  return scenes[portal.to]?.portals.find((p) => p.to === portal.from && p.id !== portal.id);
}
