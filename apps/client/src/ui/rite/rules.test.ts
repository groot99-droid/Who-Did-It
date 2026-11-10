import balance from '@wdi/content/data/balance.json';
import { TICK_RATE, TILE_PX } from '@wdi/shared/constants';
import { describe, expect, it } from 'vitest';
import { NO_RITE, inReach, nextRite, secondsLeft } from './rules';

describe("the shade's rite (story R7, GDD 3.20)", () => {
  it('follows the server stages and keeps the Medium', () => {
    const open = nextRite(NO_RITE, { stage: 'open', medium: 'h7' });
    expect(open).toEqual({ stage: 'open', medium: 'h7', endsTick: 0 });
    const begun = nextRite(open, { stage: 'begun', endsTick: 400 });
    expect(begun).toEqual({ stage: 'begun', medium: 'h7', endsTick: 400 });
    expect(nextRite(begun, { stage: 'done' }).stage).toBe('done');
    expect(nextRite(begun, { stage: 'returned' }).stage).toBe('returned');
    expect(nextRite(begun, { stage: 'nonsense' })).toBe(begun);
  });

  it('shows the prompt within reach of the Medium only', () => {
    const reach = balance.rite.reachTiles * TILE_PX;
    expect(inReach({ x: 0, y: 0 }, { x: reach, y: 0 })).toBe(true);
    expect(inReach({ x: 0, y: 0 }, { x: reach + 1, y: 0 })).toBe(false);
  });

  it('counts the seconds left in whole seconds', () => {
    expect(secondsLeft(100 + TICK_RATE * 8, 100)).toBe(8);
    expect(secondsLeft(100 + 1, 100)).toBe(1);
    expect(secondsLeft(100, 200)).toBe(0);
  });
});
