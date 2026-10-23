import { describe, expect, it } from 'vitest';
import { type ManifestEntry, loadsAtBoot, loadsWithMatch } from './manifestRules';

const e = (extra: Partial<ManifestEntry>): ManifestEntry => ({
  key: 'k',
  type: 'image',
  url: 'k.png',
  ...extra,
});

describe('manifest map field (SPRITES 5, 10.13)', () => {
  it('loads an entry without maps at boot', () => {
    expect(loadsAtBoot(e({}))).toBe(true);
    expect(loadsAtBoot(e({ maps: ['hollowmere'] }))).toBe(false);
  });
  it('loads a map entry only with its map', () => {
    expect(loadsWithMatch(e({ maps: ['hollowmere'] }), 'hollowmere')).toBe(true);
    expect(loadsWithMatch(e({ maps: ['hollowmere'] }), 'blackpine')).toBe(false);
  });
  it('does not load a boot entry again with the match', () => {
    expect(loadsWithMatch(e({}), 'hollowmere')).toBe(false);
  });
});
