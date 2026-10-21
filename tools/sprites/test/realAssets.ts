/**
 * The real manifest's textures for palette.test.ts and budget.test.ts (art plan 1.4, 1.7): every image and
 * atlas page with its key, file and size, the LEGACY keys (legacy.ts) left out. A style other than the 8-bit
 * one (art plan 1.9) reads `<root>manifest.json`, and a key it lacks falls back to its 8-bit entry.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LEGACY } from './legacy.ts';

export const ASSETS = join(import.meta.dirname, '../../../apps/client/public/assets');

export interface Entry {
  key: string;
  type: string;
  url: string;
  path?: string;
  maps?: string[];
  modes?: Array<'main' | 'onub'>;
  /** The folder the entry's urls are relative to (the style root, or the 8-bit root for a fallback). */
  dir?: string;
}

export interface Page {
  key: string;
  entry: Entry;
  file: string;
  width: number;
  height: number;
  bytes: number;
}

/** Width and height from a PNG's IHDR, or a WebP's VP8 / VP8L / VP8X header. */
export function imageSize(buf: Buffer): { width: number; height: number } {
  if (buf.readUInt32BE(0) === 0x89504e47)
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
    if (chunk === 'VP8 ')
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  throw new Error('not a PNG or WebP');
}

const readEntries = (root: string): Entry[] =>
  (JSON.parse(readFileSync(join(ASSETS, root, 'manifest.json'), 'utf8')) as { entries: Entry[] }).entries.map(
    (e) => ({ ...e, dir: join(ASSETS, root) }),
  );

/** True when the style rooted at `root` has a manifest yet (the 8-bit root always has). */
export const hasManifest = (root: string): boolean => existsSync(join(ASSETS, root, 'manifest.json'));

export function realEntries(root = ''): Entry[] {
  const own = root === '' ? [] : readEntries(root);
  const keys = new Set(own.map((e) => e.key));
  const merged = [...readEntries('').filter((e) => !keys.has(e.key)), ...own];
  return merged.filter((e) => !LEGACY.includes(e.key));
}

/** Every page of every non-LEGACY image or multiatlas entry of the real manifest of the style at `root`. */
export function realPages(root = ''): Page[] {
  const pages: Page[] = [];
  for (const entry of realEntries(root)) {
    const dir = entry.dir ?? ASSETS;
    let files: string[];
    if (entry.type === 'image') files = [join(dir, entry.url)];
    else if (entry.type === 'multiatlas') {
      const atlas = JSON.parse(readFileSync(join(dir, entry.url), 'utf8')) as {
        textures: { image: string }[];
      };
      files = atlas.textures.map((t) => join(dir, entry.path ?? '', t.image));
    } else continue;
    for (const file of files) {
      const buf = readFileSync(file);
      pages.push({ key: entry.key, entry, file, ...imageSize(buf), bytes: statSync(file).size });
    }
  }
  return pages;
}
