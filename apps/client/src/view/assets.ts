import Phaser from 'phaser';
import type { ArtMode } from '../flags';
import { type ManifestEntry, loadsAtBoot, loadsWithMatch, overlay } from './manifestRules';

export { type ManifestEntry, QUICK_MATCH_MAP, loadsAtBoot, loadsWithMatch } from './manifestRules';

// Loads the asset manifest of docs/SPRITES.md 5 by key. Code never names a texture path: it asks for
// `char_villager`, `ovl_villager`, `tiles_cobble` and the manifest says where those live.

export interface Manifest {
  version: number;
  art: string;
  entries: ManifestEntry[];
}

export interface LoadedManifest extends Manifest {
  /** Directory the entry urls are relative to, ending in a slash. */
  root: string;
}

const join = (root: string, rel: string) => `${root}${rel}`;
const rootOf = (manifest: LoadedManifest, e: ManifestEntry) => e.root ?? manifest.root;

/**
 * `?art=placeholder` uses the generated placeholder set. The default is the real (8-bit) art manifest; until the
 * art session ships it the fetch 404s and the placeholder set keeps playtests running. `lowpoly` overlays
 * `assets/lowpoly/manifest.json` on the 8-bit one by key, so a key the low-poly set lacks keeps its 8-bit art.
 */
export async function resolveManifest(art: ArtMode, base: string): Promise<LoadedManifest> {
  const resolved = await fetchManifest(art, base);
  resolvedManifests.set(`${art}|${base}`, resolved);
  return resolved;
}

/** The manifest `resolveManifest` already fetched, for code that cannot wait (a scene's `preload`). */
export function peekManifest(art: ArtMode, base: string): LoadedManifest | null {
  return resolvedManifests.get(`${art}|${base}`) ?? null;
}

const resolvedManifests = new Map<string, LoadedManifest>();

async function fetchManifest(art: ArtMode, base: string): Promise<LoadedManifest> {
  if (art === 'lowpoly') {
    const [over, under] = await Promise.all([
      fetchFrom(`${base}assets/lowpoly/`).catch(() => null),
      fetchManifest('default', base),
    ]);
    return over ? overlay(over, under) : under;
  }
  const candidates = art === 'placeholder' ? ['placeholder/'] : ['', 'placeholder/'];
  for (const dir of candidates) {
    try {
      return await fetchFrom(`${base}assets/${dir}`);
    } catch {
      // try the next candidate
    }
  }
  throw new Error('no asset manifest found');
}

async function fetchFrom(root: string): Promise<LoadedManifest> {
  const res = await fetch(`${root}manifest.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  const body = (await res.json()) as Manifest;
  if (!Array.isArray(body.entries)) throw new Error('manifest has no entries');
  return { ...body, root };
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

function queueEntries(
  load: Phaser.Loader.LoaderPlugin,
  manifest: LoadedManifest,
  entries: ManifestEntry[],
): void {
  for (const e of entries) {
    switch (e.type) {
      case 'multiatlas':
        load.multiatlas(e.key, join(rootOf(manifest, e), e.url), join(rootOf(manifest, e), e.path ?? ''));
        break;
      case 'atlas':
        load.atlas(
          e.key,
          join(rootOf(manifest, e), e.url.replace(/\.json$/, '.png')),
          join(rootOf(manifest, e), e.url),
        );
        break;
      case 'image':
        load.image(e.key, join(rootOf(manifest, e), e.url));
        break;
      case 'animation':
        load.animation(e.key, join(rootOf(manifest, e), e.url));
        break;
    }
  }
}

/** Sets the per-texture filter the manifest asks for (`nearest` for pixel-art stand-ins). */
export function applyFilters(textures: Phaser.Textures.TextureManager, manifest: Manifest): void {
  for (const e of manifest.entries) {
    if (e.filter === undefined || e.type === 'animation' || !textures.exists(e.key)) continue;
    textures
      .get(e.key)
      .setFilter(
        e.filter === 'nearest' ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR,
      );
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
  art: ArtMode,
  base: string,
  keys: readonly string[],
): Promise<Record<string, string>> {
  const id = `${art}|${base}`;
  let pending = manifests.get(id);
  if (!pending) {
    pending = resolveManifest(art, base).catch(() => null);
    manifests.set(id, pending);
  }
  const manifest = await pending;
  const out: Record<string, string> = {};
  for (const e of manifest?.entries ?? []) {
    if (e.type === 'image' && keys.includes(e.key)) out[e.key] = join(rootOf(manifest!, e), e.url);
  }
  return out;
}
