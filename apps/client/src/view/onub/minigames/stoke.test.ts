import { describe, expect, it } from 'vitest';
import onubBalance from '@wdi/content/data/balance.onub.json';
import { StokeModel } from './stoke';

const oven = onubBalance.stations.find((s) => s.id === 'oven')!.minigame as {
  stokePerTap: number;
  ratePerS: number;
  bandFrac: number;
  holdS: number;
};

/** Taps until the heat is inside the band. */
function heatUp(m: StokeModel): void {
  while (m.heat < m.bandStart + m.bandFrac / 2) m.tap();
}

describe('stoke mini-game', () => {
  it('reads the oven station numbers', () => {
    const m = new StokeModel(() => 0.5);
    expect([m.stokePerTap, m.ratePerS, m.bandFrac, m.holdS]).toEqual([
      oven.stokePerTap,
      oven.ratePerS,
      oven.bandFrac,
      oven.holdS,
    ]);
  });

  it('is done after holding the band for the whole hold time', () => {
    const m = new StokeModel(() => 0.5);
    heatUp(m);
    for (let i = 0; i < 100 && !m.done; i++) {
      m.tick(0.1);
      if (m.heat < m.bandStart + 0.01) m.tap();
    }
    expect(m.done).toBe(true);
  });

  it('cools between taps and restarts the hold when the needle leaves the band', () => {
    const m = new StokeModel(() => 0.5);
    heatUp(m);
    m.tick(1);
    expect(m.held).toBeGreaterThan(0);
    m.heat = 0;
    m.tick(0.1);
    expect(m.held).toBe(0);
    expect(m.done).toBe(false);
  });

  it('caps the heat at 1 and never goes below 0', () => {
    const m = new StokeModel(() => 0);
    for (let i = 0; i < 20; i++) m.tap();
    expect(m.heat).toBe(1);
    m.tick(100);
    expect(m.heat).toBe(0);
  });

  it('draws the band inside the gauge for any roll', () => {
    for (const r of [0, 0.5, 1]) {
      const m = new StokeModel(() => r);
      expect(m.bandStart).toBeGreaterThan(0);
      expect(m.bandStart + m.bandFrac).toBeLessThanOrEqual(1);
    }
  });
});
