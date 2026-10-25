// Round 9 (9T, docs/round9/admin-studio.md 3): the editor's live checks. The errors are the ones S3 re-runs before it
// opens a PR: the scene's zod schema, `checkGrid`, `checkSceneWorld`, and `validateContent` over the whole content with
// the edited scene swapped in. The warnings are the ones that do not refuse a save.
import { checkGrid, checkSceneWorld, content, Scene, validateContent } from '@wdi/content';

export interface Checks {
  errors: string[];
  warnings: string[];
}

const WALKABLE = '.S';

/** The tiles reachable from a start tile over floor (`.`) and spawn (`S`) tiles, 4-connected. */
function reach(scene: Scene, from: { x: number; y: number }): Set<string> {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const t = stack.pop()!;
    const ch = scene.grid[t.y]?.[t.x];
    const key = `${t.x},${t.y}`;
    if (ch === undefined || !WALKABLE.includes(ch) || seen.has(key)) continue;
    seen.add(key);
    stack.push(
      { x: t.x + 1, y: t.y },
      { x: t.x - 1, y: t.y },
      { x: t.x, y: t.y + 1 },
      { x: t.x, y: t.y - 1 },
    );
  }
  return seen;
}

/** A door, spot or prop is reached from the floor tile beside it. */
function warnUnreachable(scene: Scene): string[] {
  const out: string[] = [];
  const from = scene.spawns[0];
  if (from === undefined) return out;
  const seen = reach(scene, from);
  const touches = (x: number, y: number) =>
    [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`, `${x},${y}`].some((k) =>
      seen.has(k),
    );
  for (const s of scene.spawns)
    if (!seen.has(`${s.x},${s.y}`)) out.push(`spawn ${s.id} cannot be reached from ${from.id}`);
  for (const o of [...scene.portals, ...scene.spots, ...scene.props])
    if (!touches(o.x, o.y)) out.push(`${o.id} cannot be reached from ${from.id}`);
  return out;
}

const issue = (i: { path: PropertyKey[]; message: string }) =>
  `${i.path.map(String).join('.') || 'scene'}: ${i.message}`;

export function checkScene(scene: Scene): Checks {
  const parsed = Scene.safeParse(scene);
  if (!parsed.success) return { errors: parsed.error.issues.map(issue), warnings: [] };
  const errors = new Set([
    ...checkGrid(scene),
    ...checkSceneWorld(scene),
    ...validateContent({ ...content, scenes: { ...content.scenes, [scene.id]: scene } }),
  ]);
  return { errors: [...errors], warnings: warnUnreachable(scene) };
}
