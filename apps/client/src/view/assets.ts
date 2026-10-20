import Phaser from 'phaser';
import { currentStyleId, styleOf } from './artStyle';
import { type LoadedEntry, loadsAtBoot, loadsWithMatch, mergeStyleManifest } from './manifestRules';

export {
  type LoadedEntry,
  type ManifestEntry,
  QUICK_MATCH_MAP,
  loadsAtBoot,
  loadsWithMatch,
  changedEntries,
  mergeStyleManifest,
} from './manifestRules';

// Loads the asset manifest of docs/SPRITES.md 5 by key. Code never names a texture path: it asks for
// `char_villager`, `ovl_villager`, `tiles_cobble` and the manifest says where those live.

export interface Manifest {
  version: number;
  art: string;
  entries: LoadedEntry[];
}

export interface LoadedManifest extends Manifest {
  /** Directory the entry urls are relative to, ending in a slash. */
  root: string;
}

const join = (root: string, rel: string) => `${root}${rel}`;

/**
 * `?art=placeholder` uses the generated placeholder set and overrides every style. Otherwise the real 8-bit manifest
 * is the base and the player's style (`styleId`, default the current pick) merges over it; a style manifest that is
 * missing or fails to load leaves the 8-bit set. Until the art session ships the real manifest the fetch 404s and the
 * placeholder set keeps playtests running.
 */
export async function resolveManifest(
  art: 'default' | 'placeholder',
  base: string,
  styleId: string = currentStyleId(),
): Promise<LoadedManifest> {
  const resolved = await fetchManifest(art, base, styleId);
  resolvedManifests.set(`${art}|${base}|${styleId}`, resolved);
  return resolved;
}

/** The manifest `resolveManifest` already fetched, for code that cannot wait (a scene's `preload`). */
export function peekManifest(
  art: 'default' | 'placeholder',
  base: string,
  styleId: string = currentStyleId(),
): LoadedManifest | null {
  return resolvedManifests.get(`${art}|${base}|${styleId}`) ?? null;
}

const resolvedManifests = new Map<string, LoadedManifest>();

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function fetchManifest(
  art: 'default' | 'placeholder',
  base: string,
  styleId: string,
): Promise<LoadedManifest> {
  const candidates = art === 'placeholder' ? ['placeholder/'] : ['', 'placeholder/'];
  for (const dir of candidates) {
    const root = `${base}assets/${dir}`;
    try {
      const body = (await fetchJson(`${root}manifest.json`)) as Manifest;
      if (!Array.isArray(body.entries)) continue;
      const loaded: LoadedManifest = { ...body, root };
      const style = styleOf(styleId);
      if (art === 'placeholder' || dir !== '' || style.root === '') return loaded;
      try {
        const styleRoot = `${root}${style.root}`;
        return mergeStyleManifest(
          loaded,
          await fetchJson(`${styleRoot}manifest.json`),
          styleRoot,
          style.filter,
        );
      } catch {
        return loaded;
      }
    } catch {
      // try the next candidate
    }
  }
  throw new Error('no asset manifest found');
}

export function queueManifest(load: Phaser.Loader.LoaderPlugin, manifest: LoadedManifest): void {
  queueEntries(load, manifest, manifest.entries.filter(loadsAtBoot));
}

/**
 * Queues the entries a match adds to the boot set: those listing the match's map or mode, and not loaded yet. The
 * World's `preload` calls it; a `key` already in the texture manager, the animation cache or the JSON cache is skipped.
 */
export function queueMatchEntries(
  load: Phaser.Loader.LoaderPlugin,
  scene: Phaser.Scene,
  manifest: LoadedManifest,
  mapId: string,
  mode: 'main' | 'onub',
): void {
  const missing = manifest.entries.filter((e) => {
    if (!loadsWithMatch(e, mapId, mode)) return false;
    return e.type === 'animation' ? !scene.cache.json.exists(e.key) : !scene.textures.exists(e.key);
  });
  queueEntries(load, manifest, missing);
}

/** The url each loaded key came from, so a style switch knows which textures actually change. */
const loadedFrom = new Map<string, string>();

/** The full url of an entry's main file. */
export const entryUrl = (manifest: LoadedManifest, e: LoadedEntry): string =>
  join(e.root ?? manifest.root, e.url);

export const loadedSource = (key: string): string | undefined => loadedFrom.get(key);

/** Queues entries; `stageKey` loads them under a temporary key (the style switch) and records nothing yet. */
export function queueEntries(
  load: Phaser.Loader.LoaderPlugin,
  manifest: LoadedManifest,
  entries: LoadedEntry[],
  stageKey?: (key: string) => string,
): void {
  for (const e of entries) {
    const root = e.root ?? manifest.root;
    const key = stageKey ? stageKey(e.key) : e.key;
    if (!stageKey) loadedFrom.set(e.key, join(root, e.url));
    switch (e.type) {
      case 'multiatlas':
        load.multiatlas(key, join(root, e.url), join(root, e.path ?? ''));
        break;
      case 'atlas':
        load.atlas(key, join(root, e.url.replace(/\.json$/, '.png')), join(root, e.url));
        break;
      case 'image':
        load.image(key, join(root, e.url));
        break;
      case 'animation':
        load.animation(key, join(root, e.url));
        break;
    }
  }
}

/** Records that a staged entry now lives under its real key. */
export const markLoaded = (manifest: LoadedManifest, e: LoadedEntry): void => {
  loadedFrom.set(e.key, entryUrl(manifest, e));
};

/** `nearest` or `linear` as Phaser's filter mode. */
export const filterMode = (f: 'nearest' | 'linear'): Phaser.Textures.FilterMode =>
  f === 'nearest' ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR;

/** Sets the per-texture filter the manifest asks for (`nearest` for pixel-art stand-ins). */
export function applyFilters(textures: Phaser.Textures.TextureManager, manifest: Manifest): void {
  for (const e of manifest.entries) {
    if (e.filter === undefined || e.type === 'animation' || !textures.exists(e.key)) continue;
    textures.get(e.key).setFilter(filterMode(e.filter));
  }
}

/** Where the grid exporter writes a scene's tilemap (tools/grid/export.ts). */
export const sceneMapUrl = (base: string, sceneId: string) => `${base}assets/scenes/${sceneId}/tilemap.json`;
export const sceneMapKey = (sceneId: string) => `map_${sceneId}`;

const manifests = new Map<string, Promise<LoadedManifest | null>>();

/**
 * The urls of manifest entries of `type: image` by key, for DOM screens that set them as CSS backgrounds
 * (the loft's backdrop and bedrolls). A key the manifest lacks is simply absent: the caller keeps its CSS
 * fallback. The manifest is fetched once per art mode.
 */
export async function manifestImageUrls(
  art: 'default' | 'placeholder',
  base: string,
  keys: readonly string[],
  styleId: string = currentStyleId(),
): Promise<Record<string, string>> {
  const id = `${art}|${base}|${styleId}`;
  let pending = manifests.get(id);
  if (!pending) {
    pending = resolveManifest(art, base, styleId).catch(() => null);
    manifests.set(id, pending);
  }
  const manifest = await pending;
  const out: Record<string, string> = {};
  for (const e of manifest?.entries ?? []) {
    if (e.type === 'image' && keys.includes(e.key)) out[e.key] = entryUrl(manifest!, e);
  }
  return out;
}
