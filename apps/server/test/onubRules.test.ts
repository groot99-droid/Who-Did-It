import { onubBalance, onubFor, onubRoles } from '@wdi/content';
import { applyNightAct, dealOnub, mulberry32, nightScript, onubWinners } from '@wdi/shared';
import { describe, expect, it } from 'vitest';

/** The quick-mode rules against the real content: every count, every window, every winners row. */
const faction = (r: string) => onubRoles.roles[r]?.faction ?? 'village';

describe('balance.onub.json decks (GDD 3.11)', () => {
  for (let n = 4; n <= 10; n++) {
    it(`${n} seats: ${n + 3} loaves, three dead, every card a known role`, () => {
      const { deck } = onubFor(n);
      expect(deck).toHaveLength(n + 3);
      expect(onubFor(n).loaves).toBe(n + 3);
      const ids = Array.from({ length: n }, (_, i) => `s${i}`);
      const { dealt, center } = dealOnub(ids, deck, mulberry32(n));
      expect(dealt.size).toBe(n);
      expect(center).toHaveLength(onubBalance.deadLoaves);
      for (const roleId of deck) expect(onubRoles.roles[roleId]).toBeDefined();
    });
  }
});

describe('the night script never depends on the deal', () => {
  it('has the same windows, order and jitter for every deal of one seed', () => {
    for (let n = 4; n <= 10; n++) {
      const { deck } = onubFor(n);
      const ids = Array.from({ length: n }, (_, i) => `s${i}`);
      const scripts = new Set<string>();
      for (let salt = 0; salt < 10; salt++) {
        const rng = mulberry32(1234);
        // A different order of seats is a different deal; the rng state after it is the same.
        dealOnub(salt % 2 ? [...ids].reverse() : ids, deck, rng);
        scripts.add(
          JSON.stringify(nightScript(deck, onubBalance.windows, rng, onubBalance.timers.windowJitterMaxS)),
        );
      }
      expect(scripts.size).toBe(1);
    }
  });

  it('runs every window whose role is in the deck, even one among the dead', () => {
    const { deck } = onubFor(6);
    const roles = nightScript(
      deck,
      onubBalance.windows,
      mulberry32(1),
      onubBalance.timers.windowJitterMaxS,
    ).map((w) => w.role);
    expect(roles).toEqual(['poisoner', 'hireling', 'sinEater', 'cutpurse', 'busybody']);
  });
});

describe('every night act of balance.onub.json is a permutation', () => {
  it('whatever it swaps, the multiset of loaves is unchanged', () => {
    const loaves = new Map([
      ['bk.plate_0', 'poisoner'],
      ['bk.plate_1', 'cutpurse'],
      ['bk.plate_2', 'mourner'],
      ['bk.deadloaf_0', 'sot'],
      ['bk.deadloaf_1', 'debtor'],
    ]);
    for (const def of Object.values(onubBalance.acts)) {
      const slots =
        def.swap === 'none'
          ? ['bk.plate_2']
          : def.swap === 'withOwn'
            ? ['bk.plate_0', def.target === 'deadLoaf' ? 'bk.deadloaf_0' : 'bk.plate_2']
            : ['bk.plate_1', 'bk.plate_2'];
      const { next } = applyNightAct(loaves, { roleId: 'x', act: def.id, slots });
      expect([...next.values()].sort()).toEqual([...loaves.values()].sort());
    }
  });
});

describe('the winners table (GDD 3.11)', () => {
  it('is exhaustive over every combination of final loaves and outs of a 6-seat deck', () => {
    const { deck } = onubFor(6);
    const seats = Array.from({ length: 6 }, (_, i) => `s${i}`);
    const rng = mulberry32(99);
    const rows = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const { dealt, center } = dealOnub(seats, deck, rng);
      const outs = seats.filter(() => rng() < 0.25);
      const { rowId, winnerIds } = onubWinners(outs, dealt, center, faction, onubBalance.winners);
      rows.add(rowId);
      for (const id of winnerIds) expect(seats).toContain(id);
    }
    expect([...rows].sort()).toEqual(onubBalance.winners.map((r) => r.id).sort());
  });

  it('debtorAndVillage beats debtorAlone, and sits first in the table', () => {
    const ids = onubBalance.winners.map((r) => r.id);
    expect(ids.indexOf('debtorAndVillage')).toBeLessThan(ids.indexOf('debtorAlone'));
    const finals = new Map([
      ['a', 'debtor'],
      ['b', 'poisoner'],
      ['c', 'mourner'],
      ['d', 'hireling'],
    ]);
    expect(onubWinners(['a', 'b'], finals, [], faction, onubBalance.winners)).toEqual({
      rowId: 'debtorAndVillage',
      winnerIds: ['a', 'c'],
    });
  });

  it('crowns the Hireling loaf only on the storm row, and nobody when it lies with the dead', () => {
    const mourners = new Map([
      ['a', 'mourner'],
      ['b', 'sinEater'],
      ['c', 'hireling'],
    ]);
    expect(
      onubWinners(['a'], mourners, ['poisoner', 'poisoner', 'mourner'], faction, onubBalance.winners),
    ).toEqual({
      rowId: 'storm',
      winnerIds: ['c'],
    });
    const noHireling = new Map([
      ['a', 'mourner'],
      ['b', 'sinEater'],
    ]);
    expect(
      onubWinners(['a'], noHireling, ['poisoner', 'hireling', 'poisoner'], faction, onubBalance.winners),
    ).toEqual({
      rowId: 'storm',
      winnerIds: [],
    });
  });
});
