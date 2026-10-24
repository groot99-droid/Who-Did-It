import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { artStyles, finishEnabled } from '../palette.ts';
import { villagerLooks } from '../placeholder-chars.ts';
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

/**
 * The villager family (round 8, A161): resident in every real manifest for the ambient townsfolk, while the
 * placeholder manifest keeps the plain villager only. Until round 8 the villager loaded only with ?art=placeholder
 * (ruling C11).
 */
const FAMILY = villagerLooks().map((l) => l.id);
const familyKeys = (id: string) => [`char_${id}`, `ovl_${id}`, `anims_${id}`];
const FAMILY_KEYS = FAMILY.flatMap(familyKeys);
/** World textures whose filter follows style.json `pixelFinish.enabled.main` (SPRITES 5, 10.3). */
const WORLD_PREFIXES = ['iso_ground_', 'iso_kit_', 'bld_', 'props', 'char_', 'ovl_', 'vfx'];

describe('asset manifests (docs/SPRITES.md 5, 10.13)', () => {
  const real = read('manifest.json');
  const placeholder = read('placeholder/manifest.json');
  const byKey = (m: Manifest) => new Map(m.entries.map((e) => [e.key, e]));

  it('give the real and the placeholder art the same keys and types, the villager family aside', () => {
    const shape = (m: Manifest) =>
      m.entries
        .filter((e) => !FAMILY_KEYS.includes(e.key))
        .map((e) => `${e.key}:${e.type}`)
        .sort();
    expect(real.art).toBe('real');
    expect(placeholder.art).toBe('placeholder');
    expect(shape(placeholder)).toEqual(shape(real));
  });

  it('carry exactly the looks.json villager family in every real manifest, with full frames', () => {
    expect(FAMILY).toContain('villager');
    for (const style of artStyles()) {
      const m = read(join(style.root, 'manifest.json'));
      const keys = m.entries.map((e) => e.key).filter((k) => /^(?:char|ovl|anims)_villager/.test(k));
      expect(keys.sort(), style.id).toEqual([...FAMILY_KEYS].sort());
      for (const id of FAMILY) {
        const atlas = JSON.parse(readFileSync(join(ASSETS, style.root, `chars/char_${id}.json`), 'utf8')) as {
          textures: Array<{ frames: unknown[] }>;
        };
        expect(
          atlas.textures.reduce((n, t) => n + t.frames.length, 0),
          `${style.id} ${id}`,
        ).toBe(304);
      }
    }
  });

  it('keep the plain villager, and no family member, in the placeholder manifest', () => {
    const p = byKey(placeholder);
    for (const k of familyKeys('villager')) expect(p.has(k), k).toBe(true);
    for (const k of FAMILY_KEYS) if (!familyKeys('villager').includes(k)) expect(p.has(k), k).toBe(false);
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

describe('character atlas json (A161, #184 request 4)', () => {
  const roots = [...artStyles().map((s) => s.root), 'placeholder/'];
  it('is written on one line in every style, so a re-pack never grows the first load back', () => {
    const files = roots.flatMap((root) =>
      readdirSync(join(ASSETS, root, 'chars'))
        .filter((f) => /^(char|ovl)_[a-z0-9]+\.json$/.test(f))
        .map((f) => join(root, 'chars', f)),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const text = readFileSync(join(ASSETS, f), 'utf8');
      expect(text.slice(0, -1), f).not.toContain('\n');
      expect(JSON.parse(text).textures.length, f).toBeGreaterThan(0);
    }
  });
});
