import { describe, expect, it } from 'vitest';
import balance from '@wdi/content/data/balance.json';
import { tapMarkerAt } from '@wdi/shared/rules';
import { TapModel } from './tap';

const spec = balance.minigames.tap;

/** Advances the model until the marker stands inside the band to tap for. */
function waitForBand(m: TapModel): void {
  for (let i = 0; i < 1000 && !(m.marker >= m.band && m.marker <= m.band + m.bandFrac); i++) m.tick(0.01);
}

describe('tap mini-game (7M)', () => {
  it('reads its numbers from balance.json and draws one band per step from the rng', () => {
    const m = new TapModel(() => 0.5);
    expect([m.steps, m.periodS, m.bandFrac]).toEqual([spec.steps, spec.periodS, spec.bandFrac]);
    expect(m.bands).toHaveLength(spec.steps);
    for (const b of m.bands) expect(b + m.bandFrac).toBeLessThanOrEqual(1);
    expect(new TapModel(() => 0.5, 5).bands).toHaveLength(5);
  });

  it('counts hits in the band, starts over on a miss, and is done after steps hits in a row', () => {
    let roll = 0;
    const m = new TapModel(() => [0.1, 0.6, 0.3][roll++ % 3]!);
    waitForBand(m);
    expect(m.tap()).toBe(true);
    expect(m.hits).toBe(1);
    // A tap far from the band: the run restarts.
    m.tick(m.periodS / 2);
    expect(m.marker >= m.band && m.marker <= m.band + m.bandFrac).toBe(false);
    expect(m.tap()).toBe(false);
    expect(m.hits).toBe(0);
    expect(m.misses).toBe(1);
    for (let i = 0; i < m.steps; i++) {
      waitForBand(m);
      expect(m.tap()).toBe(true);
    }
    expect(m.done).toBe(true);
    expect(m.tap()).toBe(false);
    expect(m.taps).toHaveLength(m.steps + 2);
    expect(m.taps.every((t, i) => i === 0 || t >= m.taps[i - 1]!)).toBe(true);
  });

  it('sweeps the marker back and forth across the whole track once a period', () => {
    expect(tapMarkerAt(0, 1.4)).toBe(0);
    expect(tapMarkerAt(0.7, 1.4)).toBeCloseTo(1);
    expect(tapMarkerAt(1.4, 1.4)).toBeCloseTo(0);
    const m = new TapModel(() => 0);
    m.tick(0.35);
    expect(m.marker).toBeCloseTo(0.5);
  });
});
