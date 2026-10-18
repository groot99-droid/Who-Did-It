import { describe, expect, it } from 'vitest';
import onubBalance from '@wdi/content/data/balance.onub.json';
import { PrepModel } from '../PrepView';
import { assistReady } from '../StationView';
import { CART, CratesModel, needleAt } from './crates';

const fridge = onubBalance.stations[0]!;

describe('crates mini-game', () => {
  it('reads its numbers from the fridge station', () => {
    const m = new CratesModel(() => 0.5);
    expect(m.steps).toBe(fridge.minigame.kind === 'crates' ? fridge.minigame.steps : -1);
    expect(m.bandFrac).toBe(0.2);
  });

  it('opens the dial only after every crate is on the cart, then finishes on a stop in the band', () => {
    const m = new CratesModel(() => 0.5);
    expect(m.stop(0.5)).toBe(false);
    expect(m.drop(0, 0)).toBe(false);
    for (let i = 0; i < m.steps; i++) {
      expect(m.dialLive).toBe(false);
      expect(m.drop(CART.x + 2, CART.y + 2)).toBe(true);
    }
    expect(m.dialLive).toBe(true);
    expect(m.drop(CART.x + 2, CART.y + 2)).toBe(false);
    expect(m.stop(m.bandStart - 0.05)).toBe(false);
    expect(m.done).toBe(false);
    expect(m.stop(m.bandStart + m.bandFrac / 2)).toBe(true);
    expect(m.done).toBe(true);
  });

  it('draws the band at a random height that always fits on the dial', () => {
    for (const r of [0, 0.5, 0.999]) {
      const m = new CratesModel(() => r);
      expect(m.bandStart).toBeGreaterThanOrEqual(0);
      expect(m.bandStart + m.bandFrac).toBeLessThanOrEqual(1);
    }
  });

  it('sweeps the needle back and forth across the whole dial', () => {
    expect(needleAt(0)).toBe(0);
    expect(needleAt(0.8)).toBeCloseTo(1);
    expect(needleAt(1.6)).toBeCloseTo(0);
  });

  it('shows the Done control only after the assist time, and sends nothing but onub.prep', () => {
    expect(assistReady(onubBalance.timers.minigameAssistS - 1)).toBe(false);
    expect(assistReady(onubBalance.timers.minigameAssistS)).toBe(true);
    const sent: [string, string][] = [];
    let mine: { station: string; card: string } | null = null;
    const model = new PrepModel({
      dealtRole: () => 'chef',
      myPrep: () => mine,
      prep: (s, c) => {
        sent.push([s, c]);
        mine = { station: s, card: c };
      },
    });
    model.enter('fridge');
    model.finishMini();
    expect(sent).toEqual([]);
    model.pick('pureDairy');
    model.commit();
    expect(sent).toEqual([['fridge', 'pureDairy']]);
  });
});
