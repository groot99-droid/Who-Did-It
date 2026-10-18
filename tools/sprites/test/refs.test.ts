import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadImage } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { crop } from '../pixel.ts';
import { REPO, boxInside, loadRgba, referenceList } from '../refs.ts';

describe('style.json reference crops (docs/ASSETS.md 6.4)', () => {
  const refs = referenceList();

  it('name every output once and keep at most four references per composition', () => {
    expect(new Set(refs.map((r) => r.out)).size).toBe(refs.length);
    const per = new Map<string, number>();
    for (const r of refs) per.set(r.composition, (per.get(r.composition) ?? 0) + 1);
    for (const [c, n] of per) expect(n, c).toBeLessThanOrEqual(4);
  });

  it('point at owner images on disk, with every crop inside its image', async () => {
    const sizes = new Map<string, [number, number]>();
    for (const r of refs) {
      expect(existsSync(join(REPO, r.file)), r.file).toBe(true);
      if (!sizes.has(r.file)) {
        const im = await loadImage(readFileSync(join(REPO, r.file)));
        sizes.set(r.file, [im.width, im.height]);
      }
      const [w, h] = sizes.get(r.file)!;
      if (r.crop) expect(boxInside(r.crop, w, h), `${r.out} [${r.crop.join(', ')}] in ${w}x${h}`).toBe(true);
    }
  });

  it('cuts a crop to its box size', async () => {
    const first = refs.find((r) => r.crop)!;
    const img = await loadRgba(first.file);
    const out = crop(img, first.crop, 1, 1);
    expect([out.width, out.height]).toEqual([first.crop![2], first.crop![3]]);
  });

  it('rejects a box outside the image', () => {
    expect(boxInside([2400, 0, 200, 100], 2576, 1438)).toBe(false);
    expect(boxInside([0, 0, 2576, 1438], 2576, 1438)).toBe(true);
  });
});
