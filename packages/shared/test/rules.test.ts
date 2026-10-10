import { describe, expect, it } from 'vitest';
import { assignRoles, dealTraits, mulberry32, shuffle, type Roster } from '../src/rules';

// Inline fixture copying GDD 3.1; `packages/content/data/roles.json` carries the same `deal` shape.
const rosterCounts: Record<string, Record<string, number>> = {
  '4': { killer: 1, detective: 1, townsfolk: 2 },
  '5': { killer: 1, detective: 1, doctor: 1, townsfolk: 2 },
  '6': { killer: 1, detective: 1, doctor: 1, butler: 1, townsfolk: 2 },
  '7': { killer: 1, accomplice: 1, detective: 1, doctor: 1, butler: 1, townsfolk: 2 },
  '8': { killer: 1, accomplice: 1, detective: 1, doctor: 1, butler: 1, child: 1, townsfolk: 2 },
  '9': { killer: 1, accomplice: 1, detective: 1, doctor: 1, butler: 1, child: 1, ranger: 1, townsfolk: 2 },
  '10': {
    killer: 2,
    accomplice: 1,
    detective: 1,
    doctor: 1,
    butler: 1,
    child: 1,
    ranger: 1,
    drifter: 1,
    townsfolk: 1,
  },
};
const roster: Roster = Object.fromEntries(
  Object.entries(rosterCounts).map(([n, counts]) => [
    n,
    { deal: Object.entries(counts).flatMap(([roleId, k]) => Array.from({ length: k }, () => roleId)) },
  ]),
);
const idsFor = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const settings = { mode: 0 };

describe('mulberry32', () => {
  it('is reproducible per seed and stays in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('shuffle returns a permutation and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(input, mulberry32(7));
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(input);
  });
});

describe('assignRoles', () => {
  for (let n = 4; n <= 10; n++) {
    it(`deals exactly the roster row for ${n} players, every seed`, () => {
      for (let seed = 0; seed < 50; seed++) {
        const roles = assignRoles(idsFor(n), settings, mulberry32(seed), roster);
        const counts: Record<string, number> = {};
        for (const r of roles.values()) counts[r] = (counts[r] ?? 0) + 1;
        expect(counts).toEqual(rosterCounts[String(n)]);
        expect(roles.size).toBe(n);
      }
    });
  }

  it('always has a Detective at 4 players and at least one Townsfolk everywhere', () => {
    for (let n = 4; n <= 10; n++) {
      const roles = [...assignRoles(idsFor(n), settings, mulberry32(n), roster).values()];
      expect(roles).toContain('detective');
      expect(roles.filter((r) => r === 'townsfolk').length).toBeGreaterThanOrEqual(1);
    }
  });

  it('is reproducible per seed and varies across seeds', () => {
    const a = [...assignRoles(idsFor(8), settings, mulberry32(9), roster)];
    expect([...assignRoles(idsFor(8), settings, mulberry32(9), roster)]).toEqual(a);
    const other = new Set(
      Array.from({ length: 20 }, (_, s) =>
        JSON.stringify([...assignRoles(idsFor(8), settings, mulberry32(s), roster)]),
      ),
    );
    expect(other.size).toBeGreaterThan(1);
  });

  it('throws without a roster row or when the row does not sum to the count', () => {
    expect(() => assignRoles(idsFor(3), settings, mulberry32(1), roster)).toThrow(/no roster row/);
    expect(() => assignRoles(idsFor(4), settings, mulberry32(1), { '4': { deal: ['killer'] } })).toThrow(
      /deals 1/,
    );
  });
});

describe('dealTraits', () => {
  it('deals unique triples within range for 1 to 10 players', () => {
    for (let n = 1; n <= 10; n++) {
      for (let seed = 0; seed < 25; seed++) {
        const dealt = dealTraits(idsFor(n), mulberry32(seed));
        const keys = new Set<string>();
        for (const t of dealt.values()) {
          for (const v of [t.height, t.scarf, t.hat]) expect([0, 1, 2]).toContain(v);
          keys.add(`${t.height}${t.scarf}${t.hat}`);
        }
        expect(keys.size).toBe(n);
      }
    }
  });

  it('is reproducible per seed and refuses more than 27 players', () => {
    expect([...dealTraits(idsFor(6), mulberry32(3))]).toEqual([...dealTraits(idsFor(6), mulberry32(3))]);
    expect(dealTraits(idsFor(27), mulberry32(1)).size).toBe(27);
    expect(() => dealTraits(idsFor(28), mulberry32(1))).toThrow();
  });
});
