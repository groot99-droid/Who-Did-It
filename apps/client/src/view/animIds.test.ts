import { describe, expect, it } from 'vitest';
import { AnimId, StatusBit } from './animIds';

// Round-5 pre-seed (npc/tests.md A5): the client mirror of the server's `AnimId` (apps/server/src/sim/constants.ts).
// Round 8 (docs/round8/seams.md 2): the clip and status ids are append-only and fixed by the contract.
describe('AnimId', () => {
  it('mirrors the server ids, with one interact id for every hold', () => {
    expect(AnimId).toMatchObject({ idle: 0, walk: 1, swing: 2, die: 3, interact: 4 });
  });

  it('appends the round-8 clips at the contract values', () => {
    expect(AnimId).toEqual({
      idle: 0,
      walk: 1,
      swing: 2,
      die: 3,
      interact: 4,
      strike: 5,
      hurt: 6,
      knockdown: 7,
      down: 8,
      getup: 9,
      run: 10,
      limp: 11,
      stagger: 12,
      stunned: 13,
      inspect: 14,
      threaten: 15,
      cower: 16,
      fidget: 17,
      stomp: 18,
      eat: 19,
      rob: 20,
    });
  });
});

describe('StatusBit', () => {
  it('appends the round-8 bits inside the u16, one per drawn sign', () => {
    expect(StatusBit).toEqual({
      transit: 1,
      bloody: 2,
      ghost: 4,
      lantern: 8,
      limp: 16,
      bleeding: 32,
      poisoned: 64,
      fatigued: 128,
      stunned: 256,
      dazed: 512,
      down: 1024,
    });
    const all = Object.values(StatusBit).reduce((a, b) => a | b, 0);
    expect(all).toBeLessThan(1 << 16);
    expect(new Set(Object.values(StatusBit)).size).toBe(Object.keys(StatusBit).length);
  });
});
