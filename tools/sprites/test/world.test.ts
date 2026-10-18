import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from '../bleed.ts';
import type { MultiAtlas } from '../pack.ts';
import { pageCap, type StaticAtlas } from '../pack-static.ts';
import { artStyles } from '../palette.ts';
import { SHEET_H, SHEET_W } from '../tileset.ts';
import { WORLD_KEYS } from '../world.ts';

const ASSETS = join(import.meta.dirname, '../../../apps/client/public/assets');

interface Entry {
  key: string;
  type: string;
  url: string;
  filter?: string;
}
const entries = (root: string) =>
  new Map(
    (
      JSON.parse(readFileSync(join(ASSETS, root, 'manifest.json'), 'utf8')) as { entries: Entry[] }
    ).entries.map((e) => [e.key, e]),
  );

/** frame name -> source size and pivot in px, the parts a style must keep (DECISIONS A79). */
function frames(file: string): Map<string, string> {
  const atlas = JSON.parse(readFileSync(file, 'utf8')) as MultiAtlas;
  const out = new Map<string, string>();
  for (const t of atlas.textures) {
    for (const f of t.frames) {
      const p = f.pivot ? `${f.pivot.x * f.sourceSize.w},${f.pivot.y * f.sourceSize.h}` : 'centre';
      out.set(f.filename, `${f.sourceSize.w}x${f.sourceSize.h} @ ${p}`);
    }
  }
  return out;
}

describe('the 5K world keys in every art style (DECISIONS A79, art plan 1.9)', () => {
  const base = entries('');
  for (const style of artStyles()) {
    it.runIf(existsSync(join(ASSETS, style.root, 'manifest.json')))(
      `${style.id} ships every 5K key with the 8-bit frames, pivots and sizes, within the page caps`,
      () => {
        const m = entries(style.root);
        for (const key of WORLD_KEYS) {
          const e = m.get(key);
          expect(e, `${style.id} lacks ${key}`).toBeDefined();
          const b = base.get(key)!;
          expect(e!.url, key).toBe(b.url);
          const file = join(ASSETS, style.root, e!.url);
          if (e!.type === 'multiatlas') {
            expect(frames(file), key).toEqual(frames(join(ASSETS, b.url)));
            const cap = pageCap(key as StaticAtlas)!;
            for (const t of (JSON.parse(readFileSync(file, 'utf8')) as MultiAtlas).textures) {
              expect(t.size.w, t.image).toBeLessThanOrEqual(cap[0]);
              expect(t.size.h, t.image).toBeLessThanOrEqual(cap[1]);
            }
          } else if (key.startsWith('iso_ground_')) {
            const img = decodePng(readFileSync(file));
            expect([img.width, img.height], key).toEqual([SHEET_W, SHEET_H]);
          } else {
            expect(statSync(file).size, key).toBeLessThanOrEqual(100_000); // two thumbnails <= 0.2 MB
          }
        }
      },
    );
  }
});
