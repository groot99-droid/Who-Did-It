import { describe, expect, it } from 'vitest';
import { onubBalance, onubFor } from '@wdi/content';
import { type OnubCommit, type PrepOutcome } from '@wdi/shared';
import { type RuinRules, simulate } from '../ruin';

/** Stand-ins for the prep rules: the deal is in deck order, ruin is "two sabotage cards or more". */
const rules: RuinRules = {
  deal: (seats, deck) => ({
    dealt: new Map(seats.map((id, i) => [id, deck[i] as string])),
    pantry: deck.slice(seats.length),
  }),
  dealLocs: (_stations, count) => Array.from({ length: count }, () => 'oven'),
  resolve: (commits: ReadonlyMap<string, OnubCommit>) => {
    let bad = 0;
    for (const c of commits.values()) if (onubBalance.cards[c.card]?.kind === 'sabotage') bad++;
    return { piles: {}, ruinWeight: bad, ruined: bad >= 2, perk: null } satisfies PrepOutcome;
  },
};

describe('simulate', () => {
  it('runs the requested matches at the party size and is repeatable from its seed', () => {
    const a = simulate(6, 200, 0.6, 3, rules);
    expect(a).toHaveLength(200);
    expect(a.every((s) => s.size === 6)).toBe(true);
    expect(simulate(6, 200, 0.6, 3, rules)).toEqual(a);
  });

  it('flags a table with a Team Mold card, and ruins more often the more the saboteurs sabotage', () => {
    // The default decks always hold two Spores: every table has Team Mold.
    for (const size of [4, 7, 10]) {
      expect(onubFor(size).deck).toContain('champignon');
      expect(simulate(size, 50, 1, 1, rules).every((s) => s.mold)).toBe(true);
    }
    const rate = (chance: number) => simulate(5, 800, chance, 2, rules).filter((s) => s.ruined).length / 800;
    expect(rate(0)).toBe(0);
    expect(rate(1)).toBeGreaterThan(rate(0.4));
  });
});
