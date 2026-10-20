import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { type ManifestEntry, QUICK_MATCH_MAP, loadsAtBoot, loadsWithMatch, overlay } from './manifestRules';

const e = (extra: Partial<ManifestEntry>): ManifestEntry => ({
  key: 'k',
  type: 'image',
  url: 'k.png',
  ...extra,
});

describe('manifest map and mode fields (SPRITES 5, 10.13)', () => {
  it('loads an entry with neither at boot', () => {
    expect(loadsAtBoot(e({}))).toBe(true);
    expect(loadsAtBoot(e({ maps: ['hollowmere'] }))).toBe(false);
    expect(loadsAtBoot(e({ modes: ['onub'] }))).toBe(false);
  });
  it('loads a map entry only with its map', () => {
    expect(loadsWithMatch(e({ maps: ['hollowmere'] }), 'hollowmere', 'main')).toBe(true);
    expect(loadsWithMatch(e({ maps: ['hollowmere'] }), 'blackpine', 'main')).toBe(false);
  });
  it('loads a mode entry whenever the match mode is listed, never otherwise', () => {
    expect(loadsWithMatch(e({ modes: ['onub'] }), 'hollowmere', 'onub')).toBe(true);
    expect(loadsWithMatch(e({ modes: ['onub'] }), 'hollowmere', 'main')).toBe(false);
  });
  it('does not load a boot entry again with the match', () => {
    expect(loadsWithMatch(e({}), 'hollowmere', 'main')).toBe(false);
  });
});

describe('quick-mode match art (SPRITES 10.13)', () => {
  it('loads the onub entries and no map entry, since the quick mode walks no map', () => {
    expect(loadsWithMatch(e({ modes: ['onub'] }), QUICK_MATCH_MAP, 'onub')).toBe(true);
    expect(loadsWithMatch(e({ modes: ['main'] }), QUICK_MATCH_MAP, 'onub')).toBe(false);
    expect(loadsWithMatch(e({ maps: ['hollowmere'] }), QUICK_MATCH_MAP, 'onub')).toBe(false);
    expect(loadsWithMatch(e({}), QUICK_MATCH_MAP, 'onub')).toBe(false);
  });

  it('is queued by the Kitchen, the first quick-mode scene after the role card', () => {
    const kitchen = readFileSync(new URL('../scenes/Kitchen.ts', import.meta.url), 'utf8');
    expect(kitchen).toContain("queueMatchEntries(this.load, this, manifest, QUICK_MATCH_MAP, 'onub')");
  });
});

describe('the low-poly overlay (DECISIONS A79)', () => {
  it('takes low-poly entries by key and keeps 8-bit ones the set lacks, each with its own root', () => {
    const under = { root: '/a/', entries: [e({ key: 'x', url: 'x8.png' }), e({ key: 'y', url: 'y8.png' })] };
    const over = {
      root: '/a/lowpoly/',
      entries: [e({ key: 'x', url: 'xl.png' }), e({ key: 'z', url: 'z.png' })],
    };
    const m = overlay(over, under);
    expect(m.entries.map((x) => `${x.root}${x.url}`)).toEqual([
      '/a/lowpoly/xl.png',
      '/a/y8.png',
      '/a/lowpoly/z.png',
    ]);
  });

  it('covers every 8-bit key with the shipped manifests', () => {
    const read = (p: string) =>
      JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8')) as { entries: ManifestEntry[] };
    const under = { root: '8/', ...read('../../public/assets/manifest.json') };
    const over = { root: 'l/', ...read('../../public/assets/lowpoly/manifest.json') };
    const keys = overlay(over, under).entries.map((x) => x.key);
    for (const x of under.entries) expect(keys).toContain(x.key);
    expect(overlay(over, under).entries.filter((x) => x.root === 'l/').length).toBe(over.entries.length);
  });
});
