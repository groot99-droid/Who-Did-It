import Phaser from 'phaser';

// Loads the asset manifest of docs/SPRITES.md 5 by key. Code never names a texture path: it asks for
// `char_villager`, `ovl_villager`, `tiles_cobble` and the manifest says where those live.

export interface ManifestEntry {
  key: string;
  type: 'multiatlas' | 'atlas' | 'image' | 'animation';
  url: string;
  path?: string;
  filter?: 'linear' | 'nearest';
  origin?: [number, number];
}

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

/**
 * `?art=placeholder` uses the generated placeholder set. The default is the real art manifest; until the
 * art session ships it the fetch 404s and the placeholder set keeps playtests running.
 */
export async function resolveManifest(art: 'default' | 'placeholder', base: string): Promise<LoadedManifest> {
  const candidates = art === 'placeholder' ? ['placeholder/'] : ['', 'placeholder/'];
  for (const dir of candidates) {
    const root = `${base}assets/${dir}`;
    try {
      const res = await fetch(`${root}manifest.json`, { cache: 'no-cache' });
      if (!res.ok) continue;
      const body = (await res.json()) as Manifest;
      if (Array.isArray(body.entries)) return { ...body, root };
    } catch {
      // try the next candidate
    }
  }
  throw new Error('no asset manifest found');
}

export function queueManifest(load: Phaser.Loader.LoaderPlugin, manifest: LoadedManifest): void {
  for (const e of manifest.entries) {
    switch (e.type) {
      case 'multiatlas':
        load.multiatlas(e.key, join(manifest.root, e.url), join(manifest.root, e.path ?? ''));
        break;
      case 'atlas':
        load.atlas(e.key, join(manifest.root, e.url.replace(/\.json$/, '.png')), join(manifest.root, e.url));
        break;
      case 'image':
        load.image(e.key, join(manifest.root, e.url));
        break;
      case 'animation':
        load.animation(e.key, join(manifest.root, e.url));
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
