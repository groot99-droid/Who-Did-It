import { describe, expect, it } from 'vitest';
import { content, interactions } from '../src/index.js';

// Round 10, x4 (A293): an item's tooltip tells the truth the data tells. Logs said "Crafting waits for the mill" after
// D3 shipped the saws (GDD 3.14), so the tooltip is pinned to the interactions that consume the item.

/** The live interactions with a mode that consumes `item`, by target. */
function consumersOf(item: string): string[] {
  return Object.values(interactions.interactions)
    .filter((i) => i.status === 'live' && i.modes.some((m) => m.consumes?.some((c) => c.item === item)))
    .map((i) => i.target)
    .sort();
}

describe('item tooltips', () => {
  it('Logs are consumed only by the two saws, and the tooltip says so', () => {
    expect(consumersOf('logs')).toEqual(['headSaw', 'sawHorse']);
    const tip = content.items.items.logs!.tooltip;
    expect(tip).toMatch(/saw/i);
    expect(tip).toMatch(/Timber/);
    expect(tip).not.toMatch(/waits/i);
  });

  it('no shipped material says crafting still waits when a live interaction consumes it', () => {
    for (const [id, item] of Object.entries(content.items.items)) {
      if (item.kind !== 'material' || item.ships !== 'V1' || consumersOf(id).length === 0) continue;
      expect(item.tooltip, id).not.toMatch(/waits for/i);
    }
  });
});
