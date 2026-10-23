import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadImage } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { decodePng, encodePng } from '../bleed.ts';
import { finishImages, IMAGE_SETS, IMAGE_SIZES, TILE_VARIANTS } from '../images.ts';
import { TILESET_KEYS } from '../keys.ts';

function image(w: number, h: number, shade = 217): Buffer {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(i % 7 ? [0, 0, 0, 0] : [shade, 210, 194, 255], i * 4);
  return encodePng({ width: w, height: h, data });
}

const flat = (keys: readonly string[]) => new Map(keys.map((k) => [k, image(...IMAGE_SIZES[k]!)]));

describe('finishImages', () => {
  it('sizes every tileset key', () => {
    expect(IMAGE_SETS.flatMap((s) => s.keys).sort()).toEqual([...TILESET_KEYS].sort());
    for (const s of IMAGE_SETS) for (const k of s.keys) expect(IMAGE_SIZES[k]).toBeDefined();
  });

  it('writes one PNG per key at its size, deterministically', () => {
    const a = finishImages(TILESET_KEYS, flat(TILESET_KEYS));
    expect([...a.keys()].sort()).toEqual(TILESET_KEYS.map((k) => `${k}.png`).sort());
    for (const k of TILESET_KEYS) {
      const img = decodePng(a.get(`${k}.png`)!);
      expect([img.width, img.height]).toEqual(IMAGE_SIZES[k]);
    }
    const b = finishImages(TILESET_KEYS, flat(TILESET_KEYS));
    for (const [name, bytes] of a) expect(bytes.equals(b.get(name)!)).toBe(true);
  });

  it('joins a tileset from its four variants, left to right', () => {
    const variants = Array.from({ length: TILE_VARIANTS }, (_, v) => image(64, 64, 10 + v));
    const out = finishImages(['tiles_grass'], new Map([['tiles_grass', variants]]));
    const row = decodePng(out.get('tiles_grass.png')!);
    expect([row.width, row.height]).toEqual([256, 64]);
    for (let v = 0; v < TILE_VARIANTS; v++) expect(row.data[v * 64 * 4]).toBe(10 + v);
  });

  it('refuses a missing key or a wrong size', () => {
    const missing = flat(TILESET_KEYS);
    missing.delete('tiles_grass');
    expect(() => finishImages(TILESET_KEYS, missing)).toThrow(/missing tiles_grass/);
    const wrong = flat(TILESET_KEYS);
    wrong.set('tiles_grass', image(64, 64));
    expect(() => finishImages(TILESET_KEYS, wrong)).toThrow(/64x64, want 256x64/);
  });
});

describe('the lobby thumbnails (art plan 3.9, 1.4)', () => {
  const ASSETS = join(import.meta.dirname, '../../../apps/client/public/assets');
  it.each(['', 'placeholder/'])('%sthumb_<mapId> are 480 x 270 WebP within 0.2 MB together', async (dir) => {
    let bytes = 0;
    for (const map of ['hollowmere', 'blackpine']) {
      const file = readFileSync(join(ASSETS, dir, 'thumbs', `thumb_${map}.webp`));
      bytes += file.length;
      const img = await loadImage(file);
      expect([img.width, img.height], map).toEqual([480, 270]);
    }
    expect(bytes).toBeLessThanOrEqual(200 * 1024);
  });
});
