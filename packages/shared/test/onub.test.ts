import { describe, expect, it } from 'vitest';
import {
  type WinnerRowLike,
  applyNightAct,
  dealOnub,
  mulberry32,
  nightScript,
  onubWinners,
  resolveDawn,
} from '../src/rules';

const DECK = ['poisoner', 'poisoner', 'sinEater', 'cutpurse', 'busybody', 'mourner', 'mourner', 'debtor', 'hireling'];
const seatIds = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);
const sorted = (xs: Iterable<string>) => [...xs].sort();

const WINDOWS = [
  { order: 2, role: 'hireling', seconds: 8 },
  { order: 1, role: 'poisoner', seconds: 12 },
  { order: 3, role: 'pallbearer', seconds: 8 },
  { order: 4, role: 'sinEater', seconds: 14 },
];

describe('dealOnub', () => {
  it('deals one loaf per seat and leaves three, whatever the seed', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const ids = seatIds(6);
      const { dealt, center } = dealOnub(ids, DECK, mulberry32(seed));
      expect(dealt.size).toBe(6);
      expect(center).toHaveLength(3);
      expect(sorted([...dealt.values(), ...center])).toEqual(sorted(DECK));
    }
  });

  it('is seeded', () => {
    const a = dealOnub(seatIds(6), DECK, mulberry32(9));
    const b = dealOnub(seatIds(6), DECK, mulberry32(9));
    expect([...a.dealt]).toEqual([...b.dealt]);
    expect(a.center).toEqual(b.center);
  });

  it('throws when the deck is not seats + 3', () => {
    expect(() => dealOnub(seatIds(5), DECK, mulberry32(1))).toThrow(/expected 8/);
  });
});

describe('nightScript', () => {
  it('keeps the windows whose role is in the deck, in order, with a jitter inside the bound', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const script = nightScript(DECK, WINDOWS, mulberry32(seed), 4);
      expect(script.map((w) => w.role)).toEqual(['poisoner', 'hireling', 'sinEater']);
      for (const w of script) {
        const base = WINDOWS.find((x) => x.role === w.role)!.seconds;
        expect(w.seconds).toBeGreaterThanOrEqual(base);
        expect(w.seconds).toBeLessThanOrEqual(base + 4);
      }
    }
  });

  it('does not depend on who holds which loaf', () => {
    // The same rng state after two different deals of the same size gives the same script.
    for (let seed = 1; seed <= 30; seed++) {
      const a = mulberry32(seed);
      const b = mulberry32(seed);
      dealOnub(seatIds(6), DECK, a);
      dealOnub(seatIds(6).reverse(), DECK, b);
      expect(nightScript(DECK, WINDOWS, a, 4)).toEqual(nightScript(DECK, WINDOWS, b, 4));
    }
  });
});

describe('applyNightAct', () => {
  const loaves = () =>
    new Map([
      ['bk.plate_0', 'poisoner'],
      ['bk.plate_1', 'cutpurse'],
      ['bk.plate_2', 'mourner'],
      ['bk.deadloaf_0', 'sot'],
      ['bk.deadloaf_1', 'debtor'],
    ]);
  const acts = [
    { roleId: 'sinEater', act: 'onub.peekPlate', slots: ['bk.plate_2'] },
    { roleId: 'sinEater', act: 'onub.peekDead', slots: ['bk.deadloaf_0', 'bk.deadloaf_1'] },
    { roleId: 'cutpurse', act: 'onub.take', slots: ['bk.plate_1', 'bk.plate_2'] },
    { roleId: 'busybody', act: 'onub.swapPlates', slots: ['bk.plate_0', 'bk.plate_2'] },
    { roleId: 'sot', act: 'onub.swapDead', slots: ['bk.plate_2', 'bk.deadloaf_1'] },
    { roleId: 'lamplighter', act: 'onub.check', slots: ['bk.plate_1'] },
    { roleId: 'hireling', act: 'onub.readLedger', slots: ['bk.ledger'] },
  ];

  it('is a permutation whatever the act', () => {
    for (const act of acts) {
      const { next } = applyNightAct(loaves(), act);
      expect(sorted(next.keys())).toEqual(sorted(loaves().keys()));
      expect(sorted(next.values())).toEqual(sorted(loaves().values()));
    }
  });

  it('does not mutate its input', () => {
    const before = loaves();
    applyNightAct(before, acts[2]!);
    expect([...before]).toEqual([...loaves()]);
  });

  it('shows what each revealing act promises and nothing for the blind ones', () => {
    expect(applyNightAct(loaves(), acts[0]!).reveal).toEqual([{ slot: 'bk.plate_2', roleId: 'mourner' }]);
    expect(applyNightAct(loaves(), acts[1]!).reveal).toHaveLength(2);
    // The Cutpurse reads the token it took, which now sits on its own plate.
    const take = applyNightAct(loaves(), acts[2]!);
    expect(take.reveal).toEqual([{ slot: 'bk.plate_2', roleId: 'mourner' }]);
    expect(take.next.get('bk.plate_1')).toBe('mourner');
    expect(take.next.get('bk.plate_2')).toBe('cutpurse');
    expect(applyNightAct(loaves(), acts[3]!).reveal).toEqual([]);
    expect(applyNightAct(loaves(), acts[4]!).reveal).toEqual([]);
    expect(applyNightAct(loaves(), acts[5]!).reveal).toEqual([{ slot: 'bk.plate_1', roleId: 'cutpurse' }]);
  });

  it('refuses an unknown act, a missing slot and a swap with itself', () => {
    expect(() => applyNightAct(loaves(), { roleId: 'x', act: 'onub.nope', slots: [] })).toThrow();
    expect(() => applyNightAct(loaves(), { roleId: 'x', act: 'onub.swapPlates', slots: ['bk.plate_0', 'bk.plate_9'] })).toThrow();
    expect(() => applyNightAct(loaves(), { roleId: 'x', act: 'onub.swapPlates', slots: ['bk.plate_0', 'bk.plate_0'] })).toThrow();
  });

  it('replays: a random chain of swaps keeps the multiset and the swap log reproduces the final map', () => {
    const rng = mulberry32(5);
    const dealt = loaves();
    let cur = loaves();
    const log: string[][] = [];
    const keys = [...dealt.keys()];
    for (let i = 0; i < 40; i++) {
      const a = keys[Math.floor(rng() * keys.length)]!;
      const b = keys[Math.floor(rng() * keys.length)]!;
      if (a === b) continue;
      cur = applyNightAct(cur, { roleId: 'busybody', act: 'onub.swapPlates', slots: [a, b] }).next;
      log.push([a, b]);
    }
    let replay = new Map(dealt);
    for (const slots of log) replay = applyNightAct(replay, { roleId: 'busybody', act: 'onub.swapPlates', slots }).next;
    expect([...replay]).toEqual([...cur]);
    expect(sorted(cur.values())).toEqual(sorted(dealt.values()));
  });
});

describe('resolveDawn', () => {
  const rule = { minVotesToTurnOut: 2, tiesTurnOutAll: true };
  const seats = ['a', 'b', 'c', 'd', 'e'];

  it('turns out the seat with the most votes', () => {
    const r = resolveDawn({ a: 'b', c: 'b', d: 'b', e: 'a', b: 'a' }, seats, rule);
    expect(r.outs).toEqual(['b']);
    expect(r.tally).toEqual({ a: 2, b: 3 });
    expect(r.abstained).toEqual([]);
  });

  it('turns out everyone at the top on a tie', () => {
    expect(resolveDawn({ a: 'b', b: 'a', c: 'b', d: 'a', e: 'c' }, seats, rule).outs).toEqual(['a', 'b']);
  });

  it('turns out nobody when the top count is below the minimum, and names the abstainers', () => {
    const r = resolveDawn({ a: 'b', c: 'd' }, seats, rule);
    expect(r.outs).toEqual([]);
    expect(r.abstained).toEqual(['b', 'd', 'e']);
  });

  it('discards skips, self votes and votes from or for non-seats', () => {
    const r = resolveDawn({ a: 'skip', b: 'b', c: 'ghost', ghost: 'a', d: 'e', e: 'd' }, seats, rule);
    expect(r.tally).toEqual({ e: 1, d: 1 });
    expect(r.outs).toEqual([]);
    expect(r.abstained).toEqual(['a', 'b', 'c']);
  });

  it('honours tiesTurnOutAll false', () => {
    const r = resolveDawn({ a: 'b', c: 'b', d: 'a', e: 'a' }, seats, { ...rule, tiesTurnOutAll: false });
    expect(r.outs).toEqual([]);
  });
});

describe('onubWinners', () => {
  const faction = (r: string) => (r === 'poisoner' || r === 'hireling' ? 'cabal' : r === 'debtor' ? 'neutral' : 'village');
  const rows: WinnerRowLike[] = [
    { id: 'debtorAndVillage', when: { debtorOut: true, poisonerOut: true }, winners: ['debtor', 'village'] },
    { id: 'debtorAlone', when: { debtorOut: true, poisonerOut: false }, winners: ['debtor'] },
    { id: 'poisonerOut', when: { debtorOut: false, poisonerOut: true }, winners: ['village'] },
    { id: 'cabalSurvives', when: { debtorOut: false, poisonerOut: false, poisonerAmongMourners: true }, winners: ['cabal'] },
    { id: 'cleanTable', when: { poisonerAmongMourners: false, anyoneOut: false }, winners: ['village'] },
    { id: 'storm', when: { debtorOut: false, poisonerAmongMourners: false, anyoneOut: true }, winners: ['hirelingIfMourner'] },
  ];
  const finals = (...roles: string[]) => new Map(roles.map((r, i) => [`s${i}`, r]));

  it('debtorAndVillage beats debtorAlone', () => {
    const f = finals('debtor', 'poisoner', 'mourner', 'hireling', 'poisoner');
    const r = onubWinners(['s0', 's1'], f, [], faction, rows);
    expect(r.rowId).toBe('debtorAndVillage');
    expect(r.winnerIds).toEqual(['s0', 's2']);
    expect(onubWinners(['s0'], f, [], faction, rows).rowId).toBe('debtorAlone');
    expect(onubWinners(['s0'], f, [], faction, rows).winnerIds).toEqual(['s0']);
  });

  it('a turned-out Poisoner hands the village the win', () => {
    const r = onubWinners(['s1'], finals('mourner', 'poisoner', 'cutpurse', 'hireling', 'debtor'), [], faction, rows);
    expect(r.rowId).toBe('poisonerOut');
    expect(r.winnerIds).toEqual(['s0', 's2']); // the Hireling and the Debtor do not win
  });

  it('the Cabal wins when a Poisoner remains, even with the Hireling turned out', () => {
    const r = onubWinners(['s3'], finals('mourner', 'poisoner', 'cutpurse', 'hireling'), [], faction, rows);
    expect(r.rowId).toBe('cabalSurvives');
    expect(r.winnerIds).toEqual(['s1', 's3']);
  });

  it('with both Poisoners among the dead: nobody out is a Village win, someone out is the Hireling', () => {
    const f = finals('mourner', 'hireling', 'cutpurse', 'sinEater');
    expect(onubWinners([], f, ['poisoner', 'poisoner', 'mourner'], faction, rows)).toEqual({
      rowId: 'cleanTable',
      winnerIds: ['s0', 's2', 's3'],
    });
    const storm = onubWinners(['s0'], f, ['poisoner', 'poisoner', 'mourner'], faction, rows);
    expect(storm).toEqual({ rowId: 'storm', winnerIds: ['s1'] });
  });

  it('the storm wins when the Hireling loaf lies with the dead', () => {
    const f = finals('mourner', 'cutpurse', 'sinEater', 'busybody');
    const r = onubWinners(['s0'], f, ['poisoner', 'hireling', 'poisoner'], faction, rows);
    expect(r).toEqual({ rowId: 'storm', winnerIds: [] });
  });

  it('is exhaustive: every dawn over random finals and outs matches a row', () => {
    const rng = mulberry32(11);
    const roles = ['poisoner', 'hireling', 'debtor', 'mourner', 'cutpurse', 'sinEater'];
    for (let i = 0; i < 2000; i++) {
      const n = 4 + Math.floor(rng() * 7);
      const f = new Map(Array.from({ length: n }, (_, k) => [`s${k}`, roles[Math.floor(rng() * roles.length)]!]));
      const outs = [...f.keys()].filter(() => rng() < 0.3);
      expect(() => onubWinners(outs, f, [], faction, rows)).not.toThrow();
    }
  });
});
