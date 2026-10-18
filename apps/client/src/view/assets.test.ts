import { describe, expect, it } from 'vitest';
import { type ManifestEntry, loadsAtBoot, loadsWithMatch } from './manifestRules';

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
