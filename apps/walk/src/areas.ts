// A world in many files (docs/walk-areas.md, v1.1): a `walk-index.json` and one `walk-<areaId>.glb` per area, in one
// folder. This module reads the index and answers where things are; it loads nothing and imports nothing but types.

/** The index format this viewer reads. An index with another number is refused with a message on screen (section 3). */
export const INDEX_FORMAT = 1;

export interface IndexSpawn {
  id: string;
  label: string;
  name: string;
  group: string;
  /** False keeps an arrival-only spawn (a seam's) out of the picker. */
  picker: boolean;
}

export interface IndexPortal {
  /** The id the viewer reads (`umeast_in` for `Portal_um.east_in`). */
  id: string;
  to: string;
  toSpawn: string;
  kind: string;
  /** The area that holds the target, or null when its scene is pending. Tools read it; the viewer looks the spawn up. */
  targetArea: string | null;
}

export interface IndexArea {
  id: string;
  /** The file's name, in the index's folder. */
  file: string;
  bytes: number;
  sha256: string;
  kind: string;
  scene: string;
  /** Plain words (the Area's `wdi_name`). */
  name: string;
  spawns: IndexSpawn[];
  portals: IndexPortal[];
}

export interface WalkIndex {
  format: typeof INDEX_FORMAT;
  /** The spawn to start at when the address names none. */
  start: string;
  /** In the index's order (by id). */
  areas: IndexArea[];
  /** Scene ids that are not built yet. */
  pending: string[];
  /** Plain words of the walk-only scenes (`undermere` -> `The Undermere`), from `walk_scenes`. */
  sceneNames: Map<string, string>;
  /** Spawn id to the area that holds it. Spawn ids are unique in the whole index. */
  spawnArea: Map<string, IndexArea>;
}

export type IndexResult = { ok: true; index: WalkIndex } | { ok: false; reason: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

/** A file name with no folder, as the index writes it: never a path out of the index's folder. */
function plainFileName(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    v.length > 0 &&
    !/[\\/]/.test(v) &&
    v !== '.' &&
    v !== '..' &&
    !/^[a-z]+:/i.test(v)
  );
}

/** Reads a parsed `walk-index.json`. Fields the viewer does not use are ignored (section 3). */
export function parseIndex(raw: unknown): IndexResult {
  if (!isObject(raw)) return { ok: false, reason: 'the index is not a JSON object' };
  if (raw.format !== INDEX_FORMAT)
    return {
      ok: false,
      reason: `the index says format ${JSON.stringify(raw.format)}; this viewer reads format 1`,
    };
  if (typeof raw.start !== 'string' || !raw.start)
    return { ok: false, reason: 'the index has no start spawn' };
  if (!isObject(raw.areas)) return { ok: false, reason: 'the index has no areas' };
  const areas: IndexArea[] = [];
  const spawnArea = new Map<string, IndexArea>();
  for (const [id, entry] of Object.entries(raw.areas)) {
    if (!isObject(entry)) return { ok: false, reason: `area ${id} is not an object` };
    if (!plainFileName(entry.file))
      return { ok: false, reason: `area ${id} has no file name in the index's folder` };
    const spawns: IndexSpawn[] = [];
    for (const s of Array.isArray(entry.spawns) ? entry.spawns : []) {
      if (!isObject(s) || typeof s.id !== 'string' || !s.id)
        return { ok: false, reason: `area ${id} has a spawn with no id` };
      const name = text(s.name, s.id);
      spawns.push({
        id: s.id,
        label: text(s.label, name),
        name,
        group: text(s.group),
        picker: s.picker !== false,
      });
    }
    const portals: IndexPortal[] = [];
    for (const p of Array.isArray(entry.portals) ? entry.portals : []) {
      if (!isObject(p) || typeof p.to !== 'string' || typeof p.toSpawn !== 'string') continue;
      portals.push({
        id: text(p.id),
        to: p.to,
        toSpawn: p.toSpawn,
        kind: text(p.kind, 'door'),
        targetArea: typeof p.target_area === 'string' ? p.target_area : null,
      });
    }
    const area: IndexArea = {
      id,
      file: entry.file,
      bytes: typeof entry.bytes === 'number' && entry.bytes > 0 ? entry.bytes : 0,
      sha256: text(entry.sha256),
      kind: text(entry.kind),
      scene: text(entry.scene),
      name: text(entry.name, id),
      spawns,
      portals,
    };
    for (const s of spawns) {
      const other = spawnArea.get(s.id);
      if (other) return { ok: false, reason: `the spawn ${s.id} is in both ${other.id} and ${id}` };
      spawnArea.set(s.id, area);
    }
    areas.push(area);
  }
  if (areas.length === 0) return { ok: false, reason: 'the index lists no area' };
  const sceneNames = new Map<string, string>();
  if (isObject(raw.walk_scenes))
    for (const [scene, entry] of Object.entries(raw.walk_scenes))
      if (isObject(entry) && typeof entry.name === 'string' && entry.name) sceneNames.set(scene, entry.name);
  const pending = Array.isArray(raw.pending)
    ? raw.pending.filter((p): p is string => typeof p === 'string')
    : [];
  return {
    ok: true,
    index: { format: INDEX_FORMAT, start: raw.start, areas, pending, sceneNames, spawnArea },
  };
}

export function areaById(index: WalkIndex, id: string | null | undefined): IndexArea | null {
  return (id && index.areas.find((a) => a.id === id)) || null;
}

/** The area that holds a spawn id, or null when no area of the index has it. */
export function areaOfSpawn(index: WalkIndex, spawnId: string | null | undefined): IndexArea | null {
  return (spawnId && index.spawnArea.get(spawnId)) || null;
}

/**
 * Where a world opened from the index starts (section 7, "Start"): `spawn` when the index has it, in whatever area
 * holds it (it wins over `area`); else in `area` when the index has that area: the index's start if it is there, else
 * the area's first picker spawn, else its first spawn; else the index's start; else the first spawn of the first
 * area that has one. The spawn is null only when the area picked holds none (the walker drops at its origin).
 */
export function startOf(
  index: WalkIndex,
  asked: { spawn?: string | null; area?: string | null } = {},
): { area: IndexArea; spawn: string | null } {
  const bySpawn = areaOfSpawn(index, asked.spawn);
  if (bySpawn) return { area: bySpawn, spawn: asked.spawn! };
  const area = areaById(index, asked.area);
  if (area) {
    if (areaOfSpawn(index, index.start) === area) return { area, spawn: index.start };
    const first = area.spawns.find((s) => s.picker) ?? area.spawns[0];
    return { area, spawn: first?.id ?? null };
  }
  const startArea = areaOfSpawn(index, index.start);
  if (startArea) return { area: startArea, spawn: index.start };
  const firstArea = index.areas.find((a) => a.spawns.length > 0) ?? index.areas[0]!;
  return { area: firstArea, spawn: firstArea.spawns[0]?.id ?? null };
}

/** An area file's address: the index's folder plus its file, with the first 8 characters of its hash as `v`, so a
 * new export is never mixed with a cached old file (section 7). `indexUrl` is absolute. */
export function areaUrl(indexUrl: string, area: IndexArea): string {
  const url = new URL(area.file, indexUrl);
  if (area.sha256) url.searchParams.set('v', area.sha256.slice(0, 8));
  return url.href;
}

/** `station_street` -> `Station street`, as spawn.ts does (kept here so this module imports nothing). */
function plainWords(raw: string): string {
  const t = raw.replace(/[_-]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** A scene in plain words for the door prompt and its notice: a walk-only scene's own name (`The Undermere`), the
 * village for `overworld`, else the id in plain words (`Mine`). */
export function sceneWords(index: WalkIndex | null, scene: string): string {
  const named = index?.sceneNames.get(scene);
  if (named) return named;
  return scene === 'overworld' ? 'The village' : plainWords(scene);
}

/** What the walker is told at a door whose target is in no area of the index. */
export function notBuiltWords(index: WalkIndex | null, scene: string): string {
  return `${sceneWords(index, scene)} is not built yet`;
}

/** Where a target leads, with an index: into the area that is open, across to another area's file, or nowhere. */
export type Route =
  | { kind: 'here'; spawn: string; area: IndexArea }
  | { kind: 'cross'; spawn: string; area: IndexArea }
  | { kind: 'missing'; words: string };

/** Where the spawn `spawnId` is, seen from the open area `openArea`. */
export function routeToSpawn(index: WalkIndex, openArea: string | null, spawnId: string): Route {
  const area = areaOfSpawn(index, spawnId);
  if (!area) return { kind: 'missing', words: `${plainWords(spawnId)} is not in this world` };
  return { kind: area.id === openArea ? 'here' : 'cross', spawn: spawnId, area };
}

/**
 * Where a portal leads with an index (section 5): to the spawn whose id is exactly `<to>_<toSpawn>`, looked up in
 * every area. The bare `toSpawn` is never tried; that fallback stays in single-file mode (resolvePortal). A target in
 * no area, a scene that is pending or a cave mouth into a village that is not in the index, is "not built yet".
 */
export function routePortal(
  index: WalkIndex,
  openArea: string | null,
  portal: { to: string; toSpawn: string },
): Route {
  const exact = `${portal.to}_${portal.toSpawn}`;
  if (!areaOfSpawn(index, exact)) return { kind: 'missing', words: notBuiltWords(index, portal.to) };
  return routeToSpawn(index, openArea, exact);
}

/** The picker's spawns: every spawn of the index but the arrival-only ones, area by area. */
export function pickerSpawns(index: WalkIndex): IndexSpawn[] {
  return index.areas.flatMap((a) => a.spawns.filter((s) => s.picker));
}

/** The world an address names (section 2): `?glb=` wins and opens one file as today; else `?index=`; else the build's
 * index; else the build's single file; else nothing. */
export function worldFromQuery(
  search: string,
  defaults: { index: string | null; glb: string | null },
): { kind: 'index'; url: string } | { kind: 'glb'; url: string } | null {
  const q = new URLSearchParams(search);
  const glb = q.get('glb')?.trim();
  if (glb) return { kind: 'glb', url: glb };
  const index = q.get('index')?.trim();
  if (index) return { kind: 'index', url: index };
  if (defaults.index) return { kind: 'index', url: defaults.index };
  if (defaults.glb) return { kind: 'glb', url: defaults.glb };
  return null;
}

/** The query parameters a crossing by page load carries over; everything else is dropped. */
const KEPT = ['index', 'debug', 'exposure', 'cross'] as const;

/**
 * Option 0 (section 7): the address of the same page opened at `spawn` in `area`. It keeps `index` (when the address
 * gave one; else the new page opens the build's index too), `debug`, `exposure` and `cross`. The spawn's `wdi_mode`
 * in the new file starts the walker in its mode, so nothing else needs carrying.
 */
export function crossingAddress(href: string, area: string, spawn: string): string {
  const url = new URL(href);
  const next = new URLSearchParams();
  for (const k of KEPT) {
    const v = url.searchParams.get(k);
    if (v !== null) next.set(k, v);
  }
  next.set('area', area);
  next.set('spawn', spawn);
  url.search = next.toString();
  url.hash = '';
  return url.href;
}
