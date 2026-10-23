import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { finishEnabled } from '../palette.ts';
import { LEGACY } from './legacy.ts';

const ASSETS = join(import.meta.dirname, '../../../apps/client/public/assets');

interface Entry {
  key: string;
  type: string;
  filter?: 'linear' | 'nearest';
  maps?: string[];
  modes?: unknown;
}
interface Manifest {
  art: string;
  entries: Entry[];
}
const read = (rel: string) => JSON.parse(readFileSync(join(ASSETS, rel), 'utf8')) as Manifest;

/** In round 5 the villager loads only with ?art=placeholder (ruling C11); the real one leaves with L4. */
const PLACEHOLDER_ONLY = ['char_villager', 'ovl_villager', 'anims_villager'];
/** World textures whose filter follows style.json `pixelFinish.enabled.main` (SPRITES 5, 10.3). */
const WORLD_PREFIXES = ['iso_ground_', 'iso_kit_', 'bld_', 'props', 'char_', 'ovl_', 'vfx'];

describe('asset manifests (docs/SPRITES.md 5, 10.13)', () => {
  const real = read('manifest.json');
  const placeholder = read('placeholder/manifest.json');
  const byKey = (m: Manifest) => new Map(m.entries.map((e) => [e.key, e]));

  it('give the real and the placeholder art the same keys and types, the villager aside', () => {
    const shape = (m: Manifest) =>
      m.entries
        .filter((e) => !PLACEHOLDER_ONLY.includes(e.key))
        .map((e) => `${e.key}:${e.type}`)
        .sort();
    expect(real.art).toBe('real');
    expect(placeholder.art).toBe('placeholder');
    expect(shape(placeholder)).toEqual(shape(real));
  });

  it('keep the villager in the placeholder manifest, and in the real one only while it is LEGACY', () => {
    const p = byKey(placeholder);
    for (const k of PLACEHOLDER_ONLY) expect(p.has(k), k).toBe(true);
    const r = byKey(real);
    if (!LEGACY.includes('char_villager')) for (const k of PLACEHOLDER_ONLY) expect(r.has(k), k).toBe(false);
  });

  it('give every key the same maps in both manifests', () => {
    const p = byKey(placeholder);
    for (const e of real.entries) {
      const q = p.get(e.key);
      if (!q) continue;
      expect(q.maps, `${e.key} maps`).toEqual(e.maps);
    }
  });

  it('carry no `modes` (the quick mode left in round 7, A115)', () => {
    for (const e of [...real.entries, ...placeholder.entries]) expect(e.modes, e.key).toBeUndefined();
  });

  it('filter the round-5 world textures by the pixel-finish switch, and clues linear', () => {
    const want = finishEnabled('main') ? 'nearest' : 'linear';
    for (const e of real.entries) {
      if (LEGACY.includes(e.key) || (e.type !== 'image' && e.type !== 'multiatlas')) continue;
      if (e.key === 'clues') expect(e.filter, e.key).toBe('linear');
      else if (WORLD_PREFIXES.some((p) => e.key.startsWith(p))) expect(e.filter, e.key).toBe(want);
    }
  });

  it('list the props and vfx atlases', () => {
    const keys = placeholder.entries.map((e) => e.key);
    expect(keys).toEqual(expect.arrayContaining(['props', 'vfx', 'anims_vfx']));
  });
});
