import { describe, expect, it } from 'vitest';
import onubBalance from '@wdi/content/data/balance.onub.json';
import { slotRect, SlideModel } from './slide';

const proofing = onubBalance.stations.find((s) => s.id === 'proofing')!;

describe('slide mini-game', () => {
  it('takes its step count from the proofing station', () => {
    expect(new SlideModel(() => 0.3).steps).toBe(
      proofing.minigame.kind === 'slide' ? proofing.minigame.steps : -1,
    );
  });

  it('lights every slot once, in a random order', () => {
    const m = new SlideModel(() => 0.7);
    const seen: number[] = [];
    while (!m.done) {
      seen.push(m.glowing);
      const r = slotRect(m.glowing);
      expect(m.drop(r.x + 1, r.y + 1)).toBe(true);
    }
    expect([...seen].sort()).toEqual(Array.from({ length: m.steps }, (_, i) => i));
    expect(m.glowing).toBe(-1);
  });

  it('sends a banneton dropped on the wrong slot or in the air back to the rack', () => {
    const m = new SlideModel(() => 0.7);
    const other = (m.glowing + 1) % m.steps;
    const r = slotRect(other);
    expect(m.drop(r.x + 1, r.y + 1)).toBe(false);
    expect(m.drop(0, 0)).toBe(false);
    expect(m.placed).toBe(0);
  });

  it('finishes once every slot is filled', () => {
    const m = new SlideModel(() => 0.1);
    while (!m.done) {
      const r = slotRect(m.glowing);
      m.drop(r.x + 1, r.y + 1);
    }
    expect(m.placed).toBe(m.steps);
  });
});
