// Round 9 (9T, docs/round9/admin-studio.md 3): the diff panel's lines, a scene against its committed self.
import type { Scene } from '@wdi/content';
import { KINDS, listOf, type Obj } from './sceneEdit';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** One line per added (+), removed (-) or changed (~) object, in the order of `KINDS`. */
export function diffScene(base: Scene, cur: Scene): string[] {
  const out: string[] = [];
  for (const kind of KINDS) {
    const was = new Map(listOf(base, kind).map((o) => [o.id, o]));
    const now = new Map(listOf(cur, kind).map((o) => [o.id, o]));
    for (const [id, o] of now) {
      const before = was.get(id);
      if (before === undefined) out.push(`+ ${kind} ${id} at ${o.x},${o.y}`);
      else if (!same(before, o)) out.push(`~ ${kind} ${id} ${changes(before, o)}`);
    }
    for (const id of was.keys()) if (!now.has(id)) out.push(`- ${kind} ${id}`);
  }
  return out;
}

function changes(a: Obj, b: Obj): string {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys
    .filter(
      (k) =>
        !same((a as unknown as Record<string, unknown>)[k], (b as unknown as Record<string, unknown>)[k]),
    )
    .map((k) => {
      const f = (o: Obj) => JSON.stringify((o as unknown as Record<string, unknown>)[k]) ?? 'none';
      return `${k} ${f(a)} -> ${f(b)}`;
    })
    .join(', ');
}
