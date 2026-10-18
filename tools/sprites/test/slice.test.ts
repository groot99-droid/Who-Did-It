import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng, type Rgba } from '../bleed.ts';
import type { MultiAtlas } from '../pack.ts';
import { SLICE_RE } from '../pack-static.ts';
import { finishEnabled, paletteFile } from '../palette.ts';
import { audit } from '../pixel.ts';
import { sliceFrame, tileIndex } from '../slice.ts';

const ASSETS = join(import.meta.dirname, '../../../apps/client/public/assets');

/** A 2-tile-wide fake: the left half of the canvas stands over tile (0, 0), the right over (1, 0). */
function fixture(): { finished: Rgba; tiles: Rgba } {
  const w = 8;
  const h = 4;
  const finished: Rgba = { width: w, height: h, data: new Uint8Array(w * h * 4) };
  const tiles: Rgba = { width: 2 * w, height: 2 * h, data: new Uint8Array(4 * w * h * 4) };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) finished.data.set([90, 60, 40, 255], (y * w + x) * 4);
  }
  for (let y = 0; y < 2 * h; y++) {
    for (let x = 0; x < 2 * w; x++) {
      if (x === 0) continue; // an uncoded column at the edge, like anti-aliasing the tile map does not cover
      tiles.data.set([x < w ? 1 : 2, 1, 0, 255], (y * 2 * w + x) * 4);
    }
  }
  return { finished, tiles };
}

describe('slice.ts (docs/SPRITES.md 10.5)', () => {
  it('maps packed pixels to the tile most of their 2 x 2 block stands over', () => {
    const { finished, tiles } = fixture();
    const index = tileIndex(tiles, finished.width, finished.height);
    expect(index[1]).toBe(0);
    expect(index[5]).toBe(1);
    expect(index[0]).toBe(0); // one coded pixel of four is enough
  });

  it('cuts one full-canvas slice per tile, every opaque pixel in exactly one', () => {
    const { finished, tiles } = fixture();
    const slices = sliceFrame(finished, tileIndex(tiles, finished.width, finished.height), [2, 1]);
    expect([...slices.keys()].sort()).toEqual(['#0_0', '#1_0']);
    let covered = 0;
    for (const img of slices.values()) {
      expect([img.width, img.height]).toEqual([finished.width, finished.height]);
      for (let i = 3; i < img.data.length; i += 4) covered += img.data[i] === 255 ? 1 : 0;
    }
    expect(covered).toBe(finished.width * finished.height);
  });

  it('clamps an overhang to the footprint', () => {
    const { finished, tiles } = fixture();
    const slices = sliceFrame(finished, tileIndex(tiles, finished.width, finished.height), [1, 1]);
    expect([...slices.keys()]).toEqual(['#0_0']);
  });
});

describe('the shipped building atlases (art plan 3.4, 1.4)', () => {
  for (const map of ['hollowmere', 'blackpine']) {
    const file = join(ASSETS, 'buildings', `bld_${map}.json`);
    it.runIf(existsSync(file))(
      `bld_${map} holds slices that share their building's pivot, within 2048 x 1024`,
      () => {
        const atlas = JSON.parse(readFileSync(file, 'utf8')) as MultiAtlas;
        const pivots = new Map<string, string>();
        for (const t of atlas.textures) {
          expect(t.size.w, t.image).toBeLessThanOrEqual(2048);
          expect(t.size.h, t.image).toBeLessThanOrEqual(1024);
          for (const f of t.frames) {
            expect(f.filename).toMatch(SLICE_RE);
            const art = f.filename.split('#')[0]!;
            const pivot = `${f.pivot!.x * f.sourceSize.w},${f.pivot!.y * f.sourceSize.h}`;
            expect(pivots.get(art) ?? pivot, f.filename).toBe(pivot);
            pivots.set(art, pivot);
          }
          if (!finishEnabled('main')) continue;
          const a = audit(decodePng(readFileSync(join(ASSETS, 'buildings', t.image))));
          expect(a.offPalette, t.image).toBe(0);
          expect(a.partialAlpha, t.image).toBe(0);
          expect(a.saturatedShare, t.image).toBeLessThanOrEqual(paletteFile.rules.maxSaturatedAccentShare);
        }
      },
    );
  }
});
