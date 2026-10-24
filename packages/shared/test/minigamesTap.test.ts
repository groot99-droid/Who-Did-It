import { describe, expect, it } from 'vitest';
import {
  checkMinigame,
  generateMinigame,
  mulberry32,
  tapMarkerAt,
  tapSucceeds,
  type MinigameBases,
  type TapPublic,
} from '../src/rules';

// Round 7, 7M (GDD 3.16): the `tap` kind, pure. New file beside round 6's `minigames.test.ts`.

const BASES: MinigameBases = {
  crates: { steps: 3, bandFrac: 0.2 },
  pour: { steps: 2, ratePerS: 0.35, bandFrac: 0.12 },
  slide: { steps: 4 },
  stoke: { stokePerTap: 0.15, ratePerS: 0.08, bandFrac: 0.18, holdS: 3 },
  tap: { steps: 3, periodS: 1.4, bandFrac: 0.18 },
};

/** A board with three bands that do not overlap, so a hit in one is a miss in the others. */
const BOARD: TapPublic = { steps: 3, periodS: 1.4, bandFrac: 0.18, bands: [0.1, 0.5, 0.8] };
const PUZZLE = { kind: 'tap' as const, public: BOARD, solution: BOARD };
/** A time in sweep `n` at which the marker stands in the middle of `band`. */
const timeIn = (band: number, n = 0): number =>
  ((band + BOARD.bandFrac / 2) / 2) * BOARD.periodS + n * BOARD.periodS;
/** Hits on the three bands in order, one a sweep, from sweep `n`. */
const run = (n: number): number[] => BOARD.bands.map((band, i) => timeIn(band, n + i));

describe('tap (7M)', () => {
  it('generates steps bands that fit the track, more with difficulty, the same for the same seed', () => {
    const a = generateMinigame('tap', 1, mulberry32(3), BASES);
    const b = generateMinigame('tap', 1, mulberry32(3), BASES);
    const pub = a.public as TapPublic;
    expect(a.kind).toBe('tap');
    expect(pub).toMatchObject({ steps: 3, periodS: 1.4, bandFrac: 0.18 });
    expect(pub.bands).toHaveLength(3);
    for (const band of pub.bands) {
      expect(band).toBeGreaterThanOrEqual(0);
      expect(band + pub.bandFrac).toBeLessThanOrEqual(1);
    }
    expect(b.public).toEqual(a.public);
    expect((generateMinigame('tap', 5, mulberry32(3), BASES).public as TapPublic).steps).toBe(5);
    expect(tapMarkerAt(0.35, 1.4)).toBeCloseTo(0.5);
    expect(tapMarkerAt(1.05, 1.4)).toBeCloseTo(0.5);
  });

  it('passes steps hits in a row, in any sweep, and a miss between them restarts the run', () => {
    expect(checkMinigame(PUZZLE, { taps: run(0) })).toBe(true);
    expect(checkMinigame(PUZZLE, { taps: run(2) })).toBe(true);
    expect(checkMinigame(PUZZLE, { taps: run(0).slice(0, 2) })).toBe(false);
    // Two hits, a tap on the empty track, then the last band: the run broke, and one hit does not finish it.
    const broken = [timeIn(0.1, 0), timeIn(0.5, 1), timeIn(0.3, 2), timeIn(0.8, 3)];
    expect(checkMinigame(PUZZLE, { taps: broken })).toBe(false);
    // A hit on the second band when the first is wanted is a miss too.
    expect(checkMinigame(PUZZLE, { taps: [timeIn(0.5, 0), timeIn(0.5, 1), timeIn(0.8, 2)] })).toBe(false);
    // After the break a full run recovers.
    expect(checkMinigame(PUZZLE, { taps: [...broken, ...run(4)] })).toBe(true);
    expect(tapSucceeds(BOARD, run(0))).toBe(true);
  });

  it('refuses a bare done, times out of order, negative times and an over-long list', () => {
    const hits = run(0);
    expect(checkMinigame(PUZZLE, { done: true })).toBe(false);
    expect(checkMinigame(PUZZLE, 'done')).toBe(false);
    expect(checkMinigame(PUZZLE, { taps: [...hits].reverse() })).toBe(false);
    expect(checkMinigame(PUZZLE, { taps: [-1, ...hits] })).toBe(false);
    expect(checkMinigame(PUZZLE, { taps: Array.from({ length: 401 }, () => 0) })).toBe(false);
  });
});
