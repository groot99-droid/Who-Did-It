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
  /**
   * How many times larger this entry's frames are than the 8-bit frames of the same key (the HD style, A164): a
   * view draws the texture at its usual scale divided by this. Absent, 1.
   */
  texels?: number;
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

/** A texel factor is a whole number of at least 1; anything else reads as none. */
const texelsOrNone = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 ? v : undefined;

/** The texel factor of a loaded entry: its own, else 1 (the 8-bit frame size). */
export const entryTexels = (e: ManifestEntry): number => texelsOrNone(e.texels) ?? 1;

/**
 * Merges a style manifest over the 8-bit one key by key (SPRITES 5, A79). A style entry replaces the 8-bit entry of
 * its key, keeps that entry's `maps` and `origin` where it leaves them out, and takes the style's `filter`
 * where it names none. Any key the style lacks keeps its 8-bit entry. A style that is not a manifest changes nothing.
 * A style manifest's top-level `texels` is the factor of every texture entry that names none (A164); a texture of
 * the 8-bit set, or of a style without the field, is at factor 1, so a key HD lacks is drawn at the 8-bit scale.
 */
export function mergeStyleManifest<M extends { entries: LoadedEntry[] }>(
  base: M,
  style: unknown,
  styleRoot: string,
  styleFilter: 'nearest' | 'linear',
): M {
  const list = (style as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(list)) return base;
  const styleTexels = texelsOrNone((style as { texels?: unknown }).texels);
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
    if (merged.type === 'animation') delete merged.texels;
    else {
      const t = texelsOrNone(merged.texels) ?? styleTexels;
      if (t === undefined) delete merged.texels;
      else merged.texels = t;
    }
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
