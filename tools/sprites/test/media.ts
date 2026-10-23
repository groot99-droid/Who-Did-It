/**
 * The media budgets of ASSETS 6.8 and docs/round6/media.md 2 and 3, as pure checks over the manifests: each returns
 * the problems it found, so `media.test.ts` can also run them on constructed oversize entries.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BUDGET, PRE_MATCH_PLAYLISTS } from './budgets.ts';
import { ASSETS } from './realAssets.ts';

export { BUDGET, MB, PRE_MATCH_PLAYLISTS } from './budgets.ts';

/** The size of a file under `assets/`, or null when it does not exist. */
export type SizeOf = (relPath: string) => number | null;

export const diskSize: SizeOf = (rel) => {
  const file = join(ASSETS, rel);
  return existsSync(file) ? statSync(file).size : null;
};

const readJson = <T>(rel: string): T | null => {
  const file = join(ASSETS, rel);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : null;
};

export interface SfxManifest {
  entries: Array<{ key: string; url: string }>;
}

/** SFX and ambience: every entry of `audio/manifest.json` must exist and the sum stays within the budget. */
export function checkSfx(m: SfxManifest, sizeOf: SizeOf = diskSize): string[] {
  const problems: string[] = [];
  let total = 0;
  for (const e of m.entries) {
    const bytes = sizeOf(`audio/${e.url}`);
    if (bytes === null) problems.push(`audio/${e.url} (${e.key}) is listed but missing`);
    else total += bytes;
  }
  if (total > BUDGET.sfxBytes)
    problems.push(`SFX and ambience come to ${total} bytes, over ${BUDGET.sfxBytes}`);
  return problems;
}

export interface MusicManifest {
  tracks: Array<{ key: string; url: string; bytes: number; map?: string }>;
  playlists: Array<{ id: string; tracks: string[] }>;
}

/**
 * Music has its own budget (A81): all tracks together, and per map the tracks it names itself (`map`) plus the
 * tracks of the playlists `music.json` assigns to it (`byMap`). A track's declared `bytes` must match its file.
 */
export function checkMusic(
  m: MusicManifest,
  byMap: Record<string, Partial<Record<string, string>>>,
  sizeOf: SizeOf = diskSize,
): string[] {
  const problems: string[] = [];
  const bytesOf = new Map<string, number>();
  let total = 0;
  for (const t of m.tracks) {
    const actual = sizeOf(`audio/music/${t.url}`);
    if (actual !== null && actual !== t.bytes)
      problems.push(`track ${t.key} declares ${t.bytes} bytes, the file has ${actual}`);
    const bytes = actual ?? t.bytes;
    bytesOf.set(t.key, bytes);
    total += bytes;
  }
  if (total > BUDGET.musicBytes) problems.push(`music comes to ${total} bytes, over ${BUDGET.musicBytes}`);
  const playlistTracks = new Map(m.playlists.map((p) => [p.id, p.tracks] as const));
  const maps = new Set([
    ...Object.keys(byMap),
    ...m.tracks.flatMap((t) => (t.map === undefined ? [] : [t.map])),
  ]);
  for (const map of maps) {
    const keys = new Set(m.tracks.filter((t) => t.map === map).map((t) => t.key));
    for (const id of Object.values(byMap[map] ?? {})) {
      if (PRE_MATCH_PLAYLISTS.includes(id ?? '')) continue;
      for (const key of playlistTracks.get(id ?? '') ?? []) keys.add(key);
    }
    const sum = [...keys].reduce((n, k) => n + (bytesOf.get(k) ?? 0), 0);
    if (sum > BUDGET.musicPerMapBytes)
      problems.push(`music of ${map} comes to ${sum} bytes, over ${BUDGET.musicPerMapBytes}`);
  }
  return problems;
}

export interface VideoManifest {
  version: number;
  entries: Array<{ key: string; url: string; poster?: string; durationS: number; bytes: number }>;
}

/** The manifest key allowed the larger cap. */
export const INTRO_VIDEO_KEY = 'intro';

/** Each video at most 2 MB (the `intro` key 5 MB), its poster under 60 KB, `bytes` equal to the file, `durationS` positive. */
export function checkVideos(m: VideoManifest, sizeOf: SizeOf = diskSize): string[] {
  const problems: string[] = [];
  for (const e of m.entries) {
    if (!(e.durationS > 0)) problems.push(`video ${e.key} has no durationS`);
    const actual = sizeOf(`video/${e.url}`);
    if (actual !== null && actual !== e.bytes)
      problems.push(`video ${e.key} declares ${e.bytes} bytes, the file has ${actual}`);
    const bytes = actual ?? e.bytes;
    const cap = e.key === INTRO_VIDEO_KEY ? BUDGET.introVideoBytes : BUDGET.videoBytes;
    if (bytes > cap) problems.push(`video ${e.key} is ${bytes} bytes, over ${cap}`);
    if (e.poster !== undefined) {
      const poster = sizeOf(`video/${e.poster}`);
      if (poster === null) problems.push(`poster ${e.poster} of ${e.key} is missing`);
      else if (poster > BUDGET.posterBytes)
        problems.push(`poster ${e.poster} is ${poster} bytes, over ${BUDGET.posterBytes}`);
    }
  }
  return problems;
}

interface ArtEntry {
  type: string;
  url: string;
  path?: string;
  maps?: string[];
}

/** The boot entries plus those that load with the match's map. */
export const loadsInFirstLoad = (e: ArtEntry, map: string): boolean =>
  e.maps === undefined || e.maps.includes(map);

/** Bytes of the files an art entry loads: its image, or its atlas json and pages, or its animation json. */
export function entryBytes(e: ArtEntry, dir: string, sizeOf: SizeOf = diskSize): number {
  const size = (rel: string) => sizeOf(join(dir, rel)) ?? 0;
  if (e.type === 'multiatlas') {
    const atlas = readJson<{ textures: Array<{ image: string }> }>(join(dir, e.url));
    return size(e.url) + (atlas?.textures ?? []).reduce((n, t) => n + size(join(e.path ?? '', t.image)), 0);
  }
  if (e.type === 'atlas') return size(e.url) + size(e.url.replace(/\.json$/, '.png'));
  return size(e.url);
}

/**
 * The first load: every art entry `Preload` queues (the manifest's entries without `maps`) plus the
 * entries of the Hollowmere map, for the style at `styleRoot` merged over the 8-bit one as the client does. The
 * SFX manifest and the engine bundle are not in it (the brief counts what `Preload` queues and the map); the
 * test below reports them beside it.
 */
export function firstLoadBytes(styleRoot = '', map = 'hollowmere', sizeOf: SizeOf = diskSize): number {
  type Row = ArtEntry & { key: string };
  const base = readJson<{ entries: Row[] }>('manifest.json')?.entries ?? [];
  const own =
    styleRoot === '' ? [] : (readJson<{ entries: Row[] }>(`${styleRoot}manifest.json`)?.entries ?? []);
  const merged = new Map<string, { e: ArtEntry; dir: string }>();
  for (const e of base) merged.set(e.key, { e, dir: '' });
  for (const e of own) {
    const old = merged.get(e.key)?.e;
    const maps = e.maps ?? old?.maps;
    merged.set(e.key, {
      e: { ...e, ...(maps === undefined ? {} : { maps }) },
      dir: styleRoot,
    });
  }
  let total = 0;
  for (const { e, dir } of merged.values()) if (loadsInFirstLoad(e, map)) total += entryBytes(e, dir, sizeOf);
  return total;
}

/** The SFX files the first load also fetches (the UI audio), for the report beside the art figure. */
export function sfxBytes(sizeOf: SizeOf = diskSize): number {
  const sfx = readJson<SfxManifest>('audio/manifest.json')?.entries ?? [];
  return sfx.reduce((n, s) => n + (sizeOf(`audio/${s.url}`) ?? 0), 0);
}

/** Every file under `public/assets`, summed. */
export function siteBytes(dir = ASSETS): number {
  let total = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    total += name.isDirectory() ? siteBytes(path) : statSync(path).size;
  }
  return total;
}

export const readManifest = readJson;
