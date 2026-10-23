import { describe, expect, it } from 'vitest';
import balance from '@wdi/content/data/balance.json';
import { PourModel } from './pour';

/** Holds until the level sits at `target`, using the model's own rate. */
function holdTo(m: PourModel, target: number): void {
  m.press();
  m.tick(target / m.ratePerS);
}

describe('pour mini-game', () => {
  it('reads the steps, the rate and the band from balance.json', () => {
    const m = new PourModel(() => 0.5);
    const spec = balance.minigames.pour;
    expect([m.steps, m.ratePerS, m.bandFrac]).toEqual([spec.steps, spec.ratePerS, spec.bandFrac]);
  });

  it('finishes after flour and water are both released inside the band', () => {
    const m = new PourModel(() => 0.5);
    holdTo(m, m.bandStart + m.bandFrac / 2);
    expect(m.release()).toBe('poured');
    expect(m.done).toBe(false);
    expect(m.level).toBe(0);
    holdTo(m, m.bandStart + m.bandFrac / 2);
    expect(m.release()).toBe('poured');
    expect(m.done).toBe(true);
  });

  it('empties the bowl on an over-pour and keeps the level on a short release', () => {
    const m = new PourModel(() => 0.5);
    m.press();
    expect(m.tick(1 / m.ratePerS + 0.1)).toBe('spilled');
    expect(m.level).toBe(0);
    holdTo(m, m.bandStart - 0.1);
    expect(m.release()).toBe('short');
    expect(m.level).toBeGreaterThan(0);
    m.press();
    m.tick((0.97 - m.level) / m.ratePerS);
    expect(m.release()).toBe('spilled');
    expect(m.level).toBe(0);
    expect(m.step).toBe(0);
  });

  it('fills at the station rate and keeps every band inside the bowl', () => {
    const m = new PourModel(() => 0.99);
    m.press();
    m.tick(1);
    expect(m.level).toBeCloseTo(m.ratePerS);
    expect(m.bandStart + m.bandFrac).toBeLessThanOrEqual(1);
    expect(new PourModel(() => 0).bandStart).toBeGreaterThan(0);
  });
});
