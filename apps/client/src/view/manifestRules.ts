// Which manifest entries load when (SPRITES 5 and 10.13). Pure, so it is tested without Phaser.

export interface ManifestEntry {
  key: string;
  type: 'multiatlas' | 'atlas' | 'image' | 'animation';
  url: string;
  path?: string;
  filter?: 'linear' | 'nearest';
  origin?: [number, number];
  /** Map ids: the entry loads with the match's map, not at boot (SPRITES 5, 10.13). */
  maps?: string[];
}

/** Entries without `maps` load at boot (SPRITES 10.13). */
export const loadsAtBoot = (e: ManifestEntry): boolean => e.maps === undefined;

/** Whether an entry loads with this match: its map is listed. */
export const loadsWithMatch = (e: ManifestEntry, mapId: string): boolean => e.maps?.includes(mapId) ?? false;

/** An entry a style manifest re-skinned carries the directory its urls are relative to; others use the manifest's. */
export type LoadedEntry = ManifestEntry & { root?: string };

const ENTRY_TYPES = new Set(['multiatlas', 'atlas', 'image', 'animation']);

const isEntry = (e: unknown): e is ManifestEntry =>
  typeof e === 'object' &&
  e !== null &&
  typeof (e as ManifestEntry).key === 'string' &&
  typeof (e as ManifestEntry).url === 'string' &&
  ENTRY_TYPES.has((e as ManifestEntry).type);

/**
 * Merges a style manifest over the 8-bit one key by key (SPRITES 5, A79). A style entry replaces the 8-bit entry of
 * its key, keeps that entry's `maps` and `origin` where it leaves them out, and takes the style's `filter`
 * where it names none. Any key the style lacks keeps its 8-bit entry. A style that is not a manifest changes nothing.
 */
export function mergeStyleManifest<M extends { entries: LoadedEntry[] }>(
  base: M,
  style: unknown,
  styleRoot: string,
  styleFilter: 'nearest' | 'linear',
): M {
  const list = (style as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(list)) return base;
  const byKey = new Map(base.entries.map((e) => [e.key, e] as const));
  for (const raw of list) {
    if (!isEntry(raw)) continue;
    const old = byKey.get(raw.key);
    const merged: LoadedEntry = { ...raw, root: styleRoot };
    if (old) {
      if (merged.maps === undefined && old.maps !== undefined) merged.maps = old.maps;
      if (merged.origin === undefined && old.origin !== undefined) merged.origin = old.origin;
    }
    if (merged.filter === undefined && merged.type !== 'animation') merged.filter = styleFilter;
    byKey.set(raw.key, merged);
  }
  return { ...base, entries: [...byKey.values()] };
}

/** The entries whose file differs from the one loaded under their key (a texture or animation file not loaded is skipped). */
export function changedEntries(
  entries: readonly LoadedEntry[],
  has: (e: LoadedEntry) => boolean,
  sourceOf: (e: LoadedEntry) => string,
  loaded: (key: string) => string | undefined,
): LoadedEntry[] {
  return entries.filter((e) => has(e) && sourceOf(e) !== loaded(e.key));
}
