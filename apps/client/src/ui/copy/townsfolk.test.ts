import { looks } from '@wdi/content';
import { describe, expect, it } from 'vitest';
import { TOWNSFOLK_COPY, figureName } from './townsfolk';

/**
 * Round 10, 10Y (DECISIONS A454; UI.md 14.36): a figure's nameplate is keyed by the look id the wire carries, so every
 * look a figure can wear (the `villagers` family and the `figures` looks of `looks.json`) has a line of its own, and
 * no `figure.*` line waits on a look id that does not exist.
 */
describe('figureName', () => {
  const figureLooks = [
    ...Object.keys(looks.villagers),
    ...Object.keys((looks as { figures?: Record<string, unknown> }).figures ?? {}),
  ];
  const lineKeys = Object.keys(TOWNSFOLK_COPY).filter((k) => k.startsWith('figure.'));

  it('has a line for every look a figure can be drawn in', () => {
    expect(figureLooks.length).toBeGreaterThan(1);
    for (const id of figureLooks) expect(lineKeys, `a line for ${id}`).toContain(`figure.${id}`);
  });

  it('names no look that looks.json does not hold', () => {
    const orphans = lineKeys.map((k) => k.slice('figure.'.length)).filter((id) => !figureLooks.includes(id));
    expect(orphans).toEqual([]);
  });

  it('reads the drawn look and nothing more, and an unknown look as the plain villager', () => {
    expect(figureName('villagerclerk')).toBe('Clerk');
    expect(figureName('constable')).toBe('Constable');
    expect(figureName('villager')).toBe('Villager');
    expect(figureName('villager_clerk')).toBe('Villager');
    expect(figureName('')).toBe('Villager');
  });
});
