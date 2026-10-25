// Round 9 (9T, docs/round9/admin-studio.md 3): where else an id is named. A frozen id that anything names cannot go.
/** Every place in `haystack` that holds one of `needles` as a whole string value, as `file.path`. */
export function referencesTo(
  needles: readonly string[],
  haystack: Readonly<Record<string, unknown>>,
): string[] {
  const hits: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === 'string') {
      if (needles.includes(v)) hits.push(path);
    } else if (Array.isArray(v)) {
      v.forEach((e, i) => walk(e, `${path}[${i}]`));
    } else if (v !== null && typeof v === 'object') {
      for (const [k, e] of Object.entries(v)) walk(e, `${path}.${k}`);
    }
  };
  for (const [file, data] of Object.entries(haystack)) walk(data, file);
  return hits;
}

/** What names an object: its own id, and for a spawn `<scene>.<spawn>`, the only form other data writes it in. */
export const needlesOf = (sceneId: string, kind: string, id: string): string[] =>
  kind === 'spawns' ? [`${sceneId}.${id}`] : [id];

interface PortalLike {
  id: string;
  to: string | null;
  toSpawn: string | null;
}

/** The portals, in any scene, that land on a spawn: a portal names its target as `to` and `toSpawn` side by side. */
export function portalsTo(
  sceneId: string,
  spawnId: string,
  scenes: Readonly<Record<string, { portals: readonly PortalLike[] }>>,
): string[] {
  return Object.entries(scenes).flatMap(([sid, s]) =>
    s.portals.filter((p) => p.to === sceneId && p.toSpawn === spawnId).map((p) => `${sid}.${p.id}`),
  );
}
