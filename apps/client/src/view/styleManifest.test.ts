import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type LoadedEntry, changedEntries, mergeStyleManifest } from './manifestRules';

const base = {
  entries: [
    { key: 'char_a', type: 'multiatlas', url: 'chars/char_a.json', path: 'chars/', filter: 'nearest' },
    { key: 'tiles_grass', type: 'image', url: 'tiles/grass.png', filter: 'nearest' },
    { key: 'anims_a', type: 'animation', url: 'chars/a.anims.json' },
    { key: 'onub_kitchen', type: 'image', url: 'onub/kitchen.webp', modes: ['onub'] },
    { key: 'iso_ground_harbour', type: 'image', url: 'iso/harbour.png', maps: ['harbour'], origin: [0.5, 1] },
  ] as LoadedEntry[],
};
const ROOT = '/Who-Did-It/assets/lowpoly/';
const byKey = (m: { entries: LoadedEntry[] }, key: string) => m.entries.find((e) => e.key === key);

describe('mergeStyleManifest', () => {
  it('replaces the entries the style has and keeps the 8-bit entry of every key it lacks', () => {
    const merged = mergeStyleManifest(
      base,
      { entries: [{ key: 'tiles_grass', type: 'image', url: 'tiles/grass.png', filter: 'linear' }] },
      ROOT,
      'linear',
    );
    expect(merged.entries).toHaveLength(base.entries.length);
    expect(byKey(merged, 'tiles_grass')).toMatchObject({ root: ROOT, filter: 'linear' });
    expect(byKey(merged, 'char_a')).toBe(base.entries[0]);
    expect(byKey(merged, 'char_a')?.root).toBeUndefined();
  });

  it('falls back to the base when the style file is missing or is not a manifest', () => {
    for (const bad of [null, undefined, 'x', 42, {}, { entries: 'no' }]) {
      expect(mergeStyleManifest(base, bad, ROOT, 'linear')).toBe(base);
    }
  });

  it('skips malformed style entries without dropping the good ones', () => {
    const merged = mergeStyleManifest(
      base,
      {
        entries: [
          { key: 'tiles_grass' },
          { key: 7, type: 'image', url: 'x.png' },
          { key: 'char_a', type: 'sprite', url: 'x.png' },
          { key: 'tiles_grass', type: 'image', url: 'tiles/lp.png' },
        ],
      },
      ROOT,
      'linear',
    );
    expect(byKey(merged, 'tiles_grass')?.url).toBe('tiles/lp.png');
    expect(byKey(merged, 'char_a')).toBe(base.entries[0]);
  });

  it('keeps the 8-bit maps, modes and origin where the style leaves them out', () => {
    const merged = mergeStyleManifest(
      base,
      {
        entries: [
          { key: 'onub_kitchen', type: 'image', url: 'k.webp' },
          { key: 'iso_ground_harbour', type: 'image', url: 'h.png' },
        ],
      },
      ROOT,
      'linear',
    );
    expect(byKey(merged, 'onub_kitchen')?.modes).toEqual(['onub']);
    expect(byKey(merged, 'iso_ground_harbour')).toMatchObject({ maps: ['harbour'], origin: [0.5, 1] });
  });

  it("gives a style texture the style's filter unless it names one, and never to an animation", () => {
    const merged = mergeStyleManifest(
      base,
      {
        entries: [
          { key: 'char_a', type: 'multiatlas', url: 'c.json' },
          { key: 'tiles_grass', type: 'image', url: 'g.png', filter: 'nearest' },
          { key: 'anims_a', type: 'animation', url: 'a.json' },
        ],
      },
      ROOT,
      'linear',
    );
    expect(byKey(merged, 'char_a')?.filter).toBe('linear');
    expect(byKey(merged, 'tiles_grass')?.filter).toBe('nearest');
    expect(byKey(merged, 'anims_a')?.filter).toBeUndefined();
  });

  it('adds a key only the style has', () => {
    const merged = mergeStyleManifest(
      base,
      { entries: [{ key: 'extra', type: 'image', url: 'e.png' }] },
      ROOT,
      'linear',
    );
    expect(byKey(merged, 'extra')).toMatchObject({ root: ROOT, filter: 'linear' });
  });
});

describe('changedEntries', () => {
  const entries: LoadedEntry[] = [
    { key: 'a', type: 'image', url: 'a.png' },
    { key: 'b', type: 'image', url: 'b.png' },
    { key: 'c', type: 'image', url: 'c.png' },
  ];
  const sourceOf = (e: LoadedEntry) => `/lp/${e.url}`;

  it('picks the loaded keys whose file differs from the one loaded', () => {
    const loaded = new Map([
      ['a', '/lp/a.png'],
      ['b', '/8/b.png'],
    ]);
    const has = (e: LoadedEntry) => e.key !== 'c';
    expect(changedEntries(entries, has, sourceOf, (k) => loaded.get(k)).map((e) => e.key)).toEqual(['b']);
  });

  it('skips a key that was never loaded: it loads from the new style when its map or mode starts', () => {
    expect(
      changedEntries(
        entries,
        () => false,
        sourceOf,
        () => undefined,
      ),
    ).toEqual([]);
  });
});

describe('the shipped manifests', () => {
  const read = (p: string) =>
    JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')) as { entries: LoadedEntry[] };

  it('merge to a superset of the 8-bit keys, with every style entry taken from the style root', () => {
    const under = { root: '8/', ...read('../../public/assets/manifest.json') };
    const style = read('../../public/assets/lowpoly/manifest.json');
    const merged = mergeStyleManifest(under, style, 'l/', 'linear');
    const keys = merged.entries.map((x) => x.key);
    for (const x of under.entries) expect(keys).toContain(x.key);
    expect(merged.entries.filter((x) => x.root === 'l/')).toHaveLength(style.entries.length);
  });
});
