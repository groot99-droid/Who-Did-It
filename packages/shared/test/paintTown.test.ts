import { describe, expect, it } from 'vitest';
import { paintTarget } from '../src/rules';

describe('paintTarget (round 10, C5; GDD 3.8)', () => {
  it('is ceil(winUnique x npcSeats), at least 1', () => {
    expect(paintTarget(0.5, 4)).toBe(2);
    expect(paintTarget(0.5, 5)).toBe(3);
    expect(paintTarget(0.5, 8)).toBe(4);
    expect(paintTarget(0.5, 1)).toBe(1);
    expect(paintTarget(0.5, 0)).toBe(1);
  });
});
