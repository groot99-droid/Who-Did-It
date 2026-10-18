import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { type ManifestEntry, QUICK_MATCH_MAP, loadsAtBoot, loadsWithMatch } from './manifestRules';

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
