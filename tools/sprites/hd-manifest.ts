// Builds `assets/hd/manifest.json` from the HD files present under `assets/hd/` (docs/round8/art.md 3, SPRITES 5,
// DECISIONS A164). Every texture entry of the 8-bit manifest whose HD file exists is listed with the same key,
// type, url, path and `maps`, the `linear` filter and its texel factor, measured: an HD image against the 8-bit
// image, an HD atlas's frames against the 8-bit atlas's (the same frame names, A79). The manifest's top-level
// `texels` is the commonest factor and an entry names its own only where it differs. Keys without HD files are
// reported, not listed: the client falls back to their 8-bit entries (A80). Animations are never listed; their
// json is the same in every style.
//
//   tsx hd-manifest.ts            writes apps/client/public/assets/hd/manifest.json and lists the missing keys
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS, imageSize } from './test/realAssets.ts';

export interface BaseEntry {
  key: string;
  type: 'multiatlas' | 'atlas' | 'image' | 'animation';
  url: string;
  path?: string;
  maps?: string[];
}

export interface Sized {
  width: number;
  height: number;
}

/** The TexturePacker-style json the packer writes (`pack.ts` `atlasJson`): `sourceSize` is the cell. */
export interface Atlas {
  textures: Array<{
    image: string;
    frames: Array<{ filename: string; sourceSize: { w: number; h: number } }>;
  }>;
}

/** Where the builder reads from: the 8-bit manifest and the files of a style root ('' is the 8-bit root). */
export interface HdSources {
  base: BaseEntry[];
  imageAt(root: string, rel: string): Sized | null;
  atlasAt(root: string, rel: string): Atlas | null;
}

export interface HdEntry {
  key: string;
  type: 'multiatlas' | 'atlas' | 'image';
  url: string;
  path?: string;
  maps?: string[];
  filter: 'linear';
  texels?: number;
}

export interface HdManifest {
  version: 1;
  art: 'hd';
  texels: number;
  entries: HdEntry[];
}

/** The whole factor `hd` is larger than `base` by, the same on both axes. */
export function texelFactor(hd: Sized, base: Sized, what: string): number {
  const t = hd.width / base.width;
  if (!Number.isInteger(t) || t < 1 || hd.height !== base.height * t) {
    throw new Error(
      `hd-manifest: ${what} is ${hd.width}x${hd.height} against ${base.width}x${base.height} in 8-bit, not a whole factor`,
    );
  }
  return t;
}

const frameSizes = (a: Atlas): Map<string, Sized> =>
  new Map(
    a.textures.flatMap((t) =>
      t.frames.map((f) => [f.filename, { width: f.sourceSize.w, height: f.sourceSize.h }] as const),
    ),
  );

/** The texel factor of one HD entry, or null when its files are not there. */
function measure(e: BaseEntry, src: HdSources, root: string): number | null {
  if (e.type === 'image') {
    const hd = src.imageAt(root, e.url);
    if (hd === null) return null;
    const base = src.imageAt('', e.url);
    if (base === null) throw new Error(`hd-manifest: ${e.key}: the 8-bit image ${e.url} is missing`);
    return texelFactor(hd, base, e.key);
  }
  const hd = src.atlasAt(root, e.url);
  if (hd === null) return null;
  const base = src.atlasAt('', e.url);
  if (base === null) throw new Error(`hd-manifest: ${e.key}: the 8-bit atlas ${e.url} is missing`);
  const dir = e.type === 'multiatlas' ? (e.path ?? '') : e.url.replace(/[^/]*$/, '');
  for (const t of hd.textures) {
    if (src.imageAt(root, join(dir, t.image)) === null)
      throw new Error(`hd-manifest: ${e.key}: page ${t.image} is listed but missing`);
  }
  const baseFrames = frameSizes(base);
  const hdFrames = frameSizes(hd);
  const first = [...hdFrames.keys()].find((f) => baseFrames.has(f));
  if (first === undefined)
    throw new Error(`hd-manifest: ${e.key}: no frame name in common with the 8-bit atlas`);
  const t = texelFactor(hdFrames.get(first)!, baseFrames.get(first)!, `${e.key} ${first}`);
  for (const [name, size] of hdFrames) {
    const b = baseFrames.get(name);
    if (b === undefined) throw new Error(`hd-manifest: ${e.key}: frame ${name} is not in the 8-bit atlas`);
    if (texelFactor(size, b, `${e.key} ${name}`) !== t)
      throw new Error(`hd-manifest: ${e.key}: frame ${name} is not at factor ${t} like ${first}`);
  }
  return t;
}

/** The HD manifest from the files present, and the 8-bit texture keys without HD files. */
export function buildHdManifest(src: HdSources, root = 'hd/'): { manifest: HdManifest; missing: string[] } {
  const measured: Array<{ e: BaseEntry; texels: number }> = [];
  const missing: string[] = [];
  for (const e of src.base) {
    if (e.type === 'animation') continue;
    const t = measure(e, src, root);
    if (t === null) missing.push(e.key);
    else measured.push({ e, texels: t });
  }
  const counts = new Map<number, number>();
  for (const m of measured) counts.set(m.texels, (counts.get(m.texels) ?? 0) + 1);
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 2;
  const entries = measured.map(({ e, texels }) => {
    const out: HdEntry = { key: e.key, type: e.type as HdEntry['type'], url: e.url, filter: 'linear' };
    if (e.path !== undefined) out.path = e.path;
    if (e.maps !== undefined) out.maps = e.maps;
    if (texels !== common) out.texels = texels;
    return out;
  });
  return { manifest: { version: 1, art: 'hd', texels: common, entries }, missing };
}

/** The real sources: `apps/client/public/assets` and its `hd/` folder. */
export function diskSources(assets = ASSETS): HdSources {
  const at = (root: string, rel: string) => join(assets, root, rel);
  return {
    base: (JSON.parse(readFileSync(at('', 'manifest.json'), 'utf8')) as { entries: BaseEntry[] }).entries,
    imageAt: (root, rel) => (existsSync(at(root, rel)) ? imageSize(readFileSync(at(root, rel))) : null),
    atlasAt: (root, rel) =>
      existsSync(at(root, rel)) ? (JSON.parse(readFileSync(at(root, rel), 'utf8')) as Atlas) : null,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { manifest, missing } = buildHdManifest(diskSources());
  const file = join(ASSETS, 'hd', 'manifest.json');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`hd-manifest: ${manifest.entries.length} entries at texels ${manifest.texels} -> ${file}`);
  if (missing.length > 0)
    console.log(`hd-manifest: ${missing.length} keys fall back to 8-bit: ${missing.join(', ')}`);
}
