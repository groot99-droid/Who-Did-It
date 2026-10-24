import { describe, expect, it } from 'vitest';
import { coopDone, coopProgress, coopTicks } from '../src/rules/minigames';

// Round 7, 7M (GDD 3.5): the co-op hold's shared progress.
describe('coop (7M)', () => {
  it('runs with enough hands, pauses with too few, falls back with none', () => {
    expect(coopTicks(0, 2, 2)).toBe(1);
    expect(coopTicks(5, 3, 2)).toBe(6);
    expect(coopTicks(5, 1, 2)).toBe(5);
    expect(coopTicks(5, 0, 2)).toBe(0);
  });

  it('completes at holdS of running progress and reports it as a fraction', () => {
    expect(coopDone(79, 4, 20)).toBe(false);
    expect(coopDone(80, 4, 20)).toBe(true);
    expect(coopProgress(40, 4, 20)).toBeCloseTo(0.5);
    expect(coopProgress(90, 4, 20)).toBe(1);
    expect(coopProgress(0, 0, 20)).toBe(1);
  });
});
