import { describe, expect, it } from 'vitest';
import { content, economy, validateContent } from '../src/index.js';

/** Round 8 (GDD 3.23), Session 8D: `economy.json`'s civic keys and their cross-file checks. */
const errorsOf = (edit: (c: typeof content) => void): string[] => {
  const copy = structuredClone(content);
  edit(copy);
  return validateContent(copy).filter((e) => e.startsWith('economy') || e.startsWith('hq'));
};

describe('economy.json (GDD 3.23)', () => {
  it('the shipped file validates', () => {
    expect(errorsOf(() => {})).toEqual([]);
  });

  it('every map has an altar on its hub, open at the smallest profile, and HollowMere a mailbag', () => {
    // The rows land with their art (A139), so the hub is found by the altar's id prefix.
    for (const map of ['hollowmere', 'blackpine'] as const) {
      const hub = content.scenes[content.maps[map].hub];
      expect(hub.profile).toBe('small');
      expect(economy.faith.altars.some((id) => id.startsWith(`${hub.prefix}.`))).toBe(true);
    }
    expect(economy.notices.mailbags.every((id) => id.startsWith('ov.'))).toBe(true);
  });

  it('names six HQ stations, each a look of looks.json with three dearer tiers', () => {
    expect(Object.keys(economy.hq.stations).sort()).toEqual(
      ['chapel', 'crumbOvens', 'lodge', 'office', 'store', 'surgery'].sort(),
    );
    for (const station of Object.values(economy.hq.stations)) {
      const [a, b, c] = station.tiers.map((t) => t.scrip);
      expect(a! < b! && b! < c!).toBe(true);
    }
  });

  it('rejects an unknown prefix, a placed prop of the wrong kind, an unknown item and a cheaper tier', () => {
    expect(errorsOf((c) => (c.economy.faith.altars = ['zz.nowhere']))).toEqual([
      'economy faith.altars: no scene has the prefix of zz.nowhere',
    ]);
    expect(errorsOf((c) => (c.economy.notices.mailbags = ['ov.bell']))).toEqual([
      'economy notices.mailbags: ov.bell has kind bell, expected mailbag',
    ]);
    expect(errorsOf((c) => (c.economy.quota.items = ['gold']))).toEqual(['economy quota: unknown item gold']);
    expect(
      errorsOf((c) => {
        c.economy.hq.stations.chapel!.tiers[2]!.scrip = 1;
      }),
    ).toEqual(['hq chapel tier 3: costs no more Scrip than tier 2']);
  });

  it('rejects a curfew scene off its map or outdoors, and an HQ prop on the wrong map', () => {
    expect(errorsOf((c) => (c.economy.curfew.hollowmere = ['bp_lodge', 'overworld']))).toEqual([
      'economy curfew: bp_lodge is not on hollowmere',
      'economy curfew: overworld is not an interior',
    ]);
    expect(
      errorsOf((c) => {
        c.economy.hq.stations.office!.props = { hollowmere: 'bo.hq_office' };
      }),
    ).toEqual(['economy hq office: bo.hq_office is not on hollowmere']);
  });
});
