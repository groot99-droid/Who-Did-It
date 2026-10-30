import balance from '@wdi/content/data/balance.json';
import { describe, expect, it } from 'vitest';
import { TALK_KEYS, TALK_REACH_TILES, askedLine } from './talk';

// UI.md 14.48 (10D, D9c).
describe('talk keys', () => {
  it('asks the town on G and the time on H, with a line for each', () => {
    expect(TALK_KEYS).toEqual({ KeyG: 'town', KeyH: 'time' });
    for (const ask of Object.values(TALK_KEYS)) expect(askedLine(ask).length).toBeGreaterThan(0);
  });

  it('reaches as far as the server answers from', () => {
    expect(TALK_REACH_TILES).toBe(balance.figureTalk.reachTiles);
  });
});
