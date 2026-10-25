// Round 9 (9T, docs/round9/admin-studio.md 3): the editor's pure edits on a scene's gates and paths. Like
// `sceneEdit.ts`, each returns a new scene or an error line; the prefix and the id rules are the same.
import type { Gate, Path, Scene } from '@wdi/content';
import type { Edit } from './sceneEdit';

const NAME = /^[a-z][a-z0-9_]*$/;
type Tile = { x: number; y: number };

const taken = (scene: Scene, id: string) =>
  [scene.portals, scene.spots, scene.props, scene.gates, scene.paths].some((l) =>
    (l as Array<{ id: string }>).some((o) => o.id === id),
  );

function newId(scene: Scene, name: string): string | { error: string } {
  if (!NAME.test(name))
    return { error: 'a name is lowercase letters, digits and underscores, starting with a letter' };
  const id = `${scene.prefix}.${name}`;
  return taken(scene, id) ? { error: `${id} already exists` } : id;
}

/** A gate over the rectangle between two tiles; it must lie on floor, as `checkGrid` requires. */
export function addGate(scene: Scene, name: string, a: Tile, b: Tile, minProfile: Gate['minProfile']): Edit {
  const id = newId(scene, name);
  if (typeof id !== 'string') return id;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x) + 1;
  const h = Math.abs(a.y - b.y) + 1;
  if (x < 0 || y < 0 || x + w > scene.size.w || y + h > scene.size.h)
    return { error: 'the gate would leave the scene' };
  for (let j = y; j < y + h; j++)
    for (let i = x; i < x + w; i++)
      if (scene.grid[j]?.[i] !== '.') return { error: `tile ${i},${j} is not floor` };
  return { scene: { ...scene, gates: [...scene.gates, { id, minProfile, x, y, w, h }] } };
}

/** A closed loop of corners joined by straight orthogonal runs: each corner shares a row or column with the next. */
export function addPath(scene: Scene, name: string, kind: Path['kind'], points: Tile[]): Edit {
  const id = newId(scene, name);
  if (typeof id !== 'string') return id;
  if (points.length < 4) return { error: 'a path needs at least 4 corners' };
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    if (p.x < 0 || p.y < 0 || p.x >= scene.size.w || p.y >= scene.size.h)
      return { error: `corner ${p.x},${p.y} is outside the scene` };
    if ((p.x === q.x) === (p.y === q.y))
      return { error: `corners ${p.x},${p.y} and ${q.x},${q.y} are not in a straight run` };
  }
  return {
    scene: { ...scene, paths: [...scene.paths, { id, kind, points: points.map(({ x, y }) => ({ x, y })) }] },
  };
}

/** Removes a gate or path. A path or gate id can be named by routines or the server, so a committed one stays. */
export function removeRoute(scene: Scene, id: string, base: Scene): Edit {
  const inBase = [...base.gates, ...base.paths].some((o) => o.id === id);
  if (inBase) return { error: `${id} is in the committed scene; its id is frozen` };
  if (![...scene.gates, ...scene.paths].some((o) => o.id === id))
    return { error: `${id} is not in this scene` };
  return {
    scene: {
      ...scene,
      gates: scene.gates.filter((g) => g.id !== id),
      paths: scene.paths.filter((p) => p.id !== id),
    },
  };
}

/** Changes a gate's profile. */
export function setGateProfile(scene: Scene, id: string, minProfile: Gate['minProfile']): Edit {
  if (!scene.gates.some((g) => g.id === id)) return { error: `${id} is not a gate of this scene` };
  return { scene: { ...scene, gates: scene.gates.map((g) => (g.id === id ? { ...g, minProfile } : g)) } };
}
