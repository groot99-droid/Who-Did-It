import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../bleed.ts';
import type { MultiAtlas } from '../pack.ts';
import { KIT_CELLS, KIT_THEMES, kitFrameNames } from '../pack-static.ts';
import { finishEnabled, paletteFile } from '../palette.ts';
import { audit } from '../pixel.ts';

const ASSETS = join(import.meta.dirname, '../../../apps/client/public/assets');

describe.each(['', 'placeholder/'])('iso_kit atlases %s(docs/SPRITES.md 10.13, art plan 3.3)', (dir) => {
  it.each(KIT_THEMES)(
    'iso_kit_%s holds the 44 frames, each pivoted on its tile centre, within 1024²',
    (theme) => {
      const file = join(ASSETS, dir, 'kit', `iso_kit_${theme}.json`);
      expect(existsSync(file), file).toBe(true);
      const atlas = JSON.parse(readFileSync(file, 'utf8')) as MultiAtlas;
      const frames = atlas.textures.flatMap((t) => t.frames);
      expect(frames.map((f) => f.filename).sort()).toEqual(kitFrameNames());
      for (const f of frames) {
        const [w, h] = KIT_CELLS[f.filename.split('/').slice(0, 2).join('/')]!;
        expect([f.sourceSize.w, f.sourceSize.h], f.filename).toEqual([w, h]);
        expect(f.pivot!.x * w, f.filename).toBeCloseTo(w / 2, 1);
        expect(f.pivot!.y * h, f.filename).toBeCloseTo(h - 16, 1);
      }
      for (const t of atlas.textures) {
        expect(t.size.w, t.image).toBeLessThanOrEqual(1024);
        expect(t.size.h, t.image).toBeLessThanOrEqual(1024);
      }
    },
  );
});

describe('the shipped kit pages', () => {
  it.each(KIT_THEMES)('iso_kit_%s is world colours with hard alpha while the finish is on', (theme) => {
    if (!finishEnabled('main')) return;
    const atlas = JSON.parse(
      readFileSync(join(ASSETS, 'kit', `iso_kit_${theme}.json`), 'utf8'),
    ) as MultiAtlas;
    for (const t of atlas.textures) {
      const a = audit(decodePng(readFileSync(join(ASSETS, 'kit', t.image))));
      expect(a.offPalette, t.image).toBe(0);
      expect(a.partialAlpha, t.image).toBe(0);
      expect(a.saturatedShare, t.image).toBeLessThanOrEqual(paletteFile.rules.maxSaturatedAccentShare);
    }
  });
});
