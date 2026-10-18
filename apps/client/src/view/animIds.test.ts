import { describe, expect, it } from 'vitest';
import { AnimId } from './animIds';

// Round-5 pre-seed (npc/tests.md A5): the client mirror of the server's `AnimId` (apps/server/src/sim/constants.ts).
describe('AnimId', () => {
  it('mirrors the server ids, with one interact id for every hold', () => {
    expect(AnimId).toEqual({ idle: 0, walk: 1, swing: 2, die: 3, interact: 4 });
  });
});
