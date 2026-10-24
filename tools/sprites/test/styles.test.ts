import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { artStyle, artStyles, defaultArtStyle } from '../palette.ts';

const ASSETS = join(import.meta.dirname, '../../../apps/client/public/assets');

interface Entry {
  key: string;
  type: string;
  url?: string;
  filter?: 'linear' | 'nearest';
  maps?: string[];
}
interface Manifest {
  art: string;
  entries: Entry[];
}
const read = (rel: string) => JSON.parse(readFileSync(join(ASSETS, rel), 'utf8')) as Manifest;

describe('art styles (DECISIONS A79, SPRITES 5)', () => {
  it('ship 8-bit (finished, nearest, root manifest), low poly and HD (unfinished, linear), 8-bit by default', () => {
    expect(artStyles().map((s) => s.id)).toEqual(['8bit', 'lowpoly', 'hd']);
    expect(defaultArtStyle().id).toBe('8bit');
    expect(artStyle('8bit')).toMatchObject({ pixelFinish: true, filter: 'nearest', root: '' });
    expect(artStyle('lowpoly')).toMatchObject({ pixelFinish: false, filter: 'linear', root: 'lowpoly/' });
    expect(artStyle('hd')).toMatchObject({ pixelFinish: false, filter: 'linear', root: 'hd/' });
    expect(() => artStyle('vaporwave')).toThrow(/unknown art style/);
  });

  // A style manifest other than the root one is optional while its art is made: a key it lacks falls back to
  // the 8-bit entry. Once it exists, it may only re-skin keys the 8-bit manifest has.
  for (const style of artStyles().filter((s) => s.root !== '')) {
    const rel = `${style.root}manifest.json`;
    it.runIf(existsSync(join(ASSETS, rel)))(`keeps ${rel} a re-skin of manifest.json`, () => {
      const base = new Map(read('manifest.json').entries.map((e) => [e.key, e]));
      const m = read(rel);
      expect(m.art).toBe(style.id);
      for (const e of m.entries) {
        const b = base.get(e.key);
        expect(b, `${e.key} is not in manifest.json`).toBeDefined();
        if (!b) continue;
        expect(e.type, `${e.key} type`).toBe(b.type);
        expect(e.maps, `${e.key} maps`).toEqual(b.maps);
        if (b.filter) expect(e.filter, `${e.key} filter`).toBe(style.filter);
        if (e.url) expect(existsSync(join(ASSETS, style.root, e.url)), `${e.key} url ${e.url}`).toBe(true);
      }
    });
  }
});
