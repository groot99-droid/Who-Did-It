import { describe, expect, it } from 'vitest';
import { decodePng, encodePng } from '../bleed.ts';
import { finishImages, IMAGE_SETS, IMAGE_SIZES, TILE_VARIANTS } from '../images.ts';
import { BUILDING_KEYS, LOFT_KEYS, TILESET_KEYS } from '../keys.ts';

function image(w: number, h: number, shade = 217): Buffer {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(i % 7 ? [0, 0, 0, 0] : [shade, 210, 194, 255], i * 4);
  return encodePng({ width: w, height: h, data });
}

const flat = (keys: readonly string[]) => new Map(keys.map((k) => [k, image(...IMAGE_SIZES[k]!)]));

describe('finishImages', () => {
  it('sizes every loft, building and tileset key', () => {
    expect(IMAGE_SETS.flatMap((s) => s.keys).sort()).toEqual(
      [...LOFT_KEYS, ...BUILDING_KEYS, ...TILESET_KEYS].sort(),
    );
    for (const s of IMAGE_SETS) for (const k of s.keys) expect(IMAGE_SIZES[k]).toBeDefined();
  });

  it('writes one PNG per key at its size, deterministically', () => {
    const a = finishImages(LOFT_KEYS, flat(LOFT_KEYS));
    expect([...a.keys()].sort()).toEqual(LOFT_KEYS.map((k) => `${k}.png`).sort());
    for (const k of LOFT_KEYS) {
      const img = decodePng(a.get(`${k}.png`)!);
      expect([img.width, img.height]).toEqual(IMAGE_SIZES[k]);
    }
    const b = finishImages(LOFT_KEYS, flat(LOFT_KEYS));
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
    const missing = flat(LOFT_KEYS);
    missing.delete('prop_bedroll_self');
    expect(() => finishImages(LOFT_KEYS, missing)).toThrow(/missing prop_bedroll_self/);
    const wrong = flat(LOFT_KEYS);
    wrong.set('prop_bedroll', image(56, 92));
    expect(() => finishImages(LOFT_KEYS, wrong)).toThrow(/56x92, want 112x184/);
  });
});
