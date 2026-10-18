import { deckFor, roles } from '@wdi/content';
import { describe, expect, it } from 'vitest';
import { dealDeck, mulberry32, sfc32 } from '@wdi/shared';

// `dealDeck` (GDD 3.1, round-5 `deck/wire.md` 2.1), over the real decks of `roles.json`.
const knife = (card: string) => roles.roles[card]?.abilities.includes('kill') === true;
const seatsOf = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);
const sorted = (xs: readonly string[]) => [...xs].sort();

describe('dealDeck', () => {
  it.each([4, 5, 6, 7, 8, 9, 10])('deals every Killer and exactly two undealt cards at %i players', (n) => {
    const { cards } = deckFor(n);
    expect(cards).toHaveLength(n + 2);
    for (let seed = 1; seed <= 200; seed++) {
      const deal = dealDeck(seatsOf(n), cards, knife, mulberry32(seed));
      const hand = [...deal.dealt.values()];
      expect(hand).toHaveLength(n);
      expect(deal.undealt).toHaveLength(2);
      expect(sorted([...hand, ...deal.undealt])).toEqual(sorted(cards));
      expect(deal.undealt.some(knife)).toBe(false);
      expect(hand.filter(knife)).toHaveLength(cards.filter(knife).length);
    }
  });

  it('leaves each non-Killer card undealt about equally often', () => {
    const { cards } = deckFor(7);
    const undealt = new Map<string, number>();
    const rng = sfc32(1, 2, 3, 4);
    for (let i = 0; i < 4000; i++)
      for (const c of dealDeck(seatsOf(7), cards, knife, rng).undealt)
        undealt.set(c, (undealt.get(c) ?? 0) + 1);
    expect(undealt.has('killer')).toBe(false);
    const expected = 8000 / (cards.length - 1);
    for (const count of undealt.values()) expect(Math.abs(count - expected)).toBeLessThan(expected * 0.2);
  });

  it('seats the Killer uniformly', () => {
    const { cards } = deckFor(6);
    const rng = sfc32(9, 8, 7, 6);
    const seat = new Map<string, number>();
    for (let i = 0; i < 3000; i++) {
      const deal = dealDeck(seatsOf(6), cards, knife, rng).dealt;
      for (const [id, card] of deal) if (card === 'killer') seat.set(id, (seat.get(id) ?? 0) + 1);
    }
    for (const id of seatsOf(6)) expect(Math.abs((seat.get(id) ?? 0) - 500)).toBeLessThan(120);
  });

  it('is deterministic for a stream and draws only from it', () => {
    const { cards } = deckFor(8);
    const a = dealDeck(seatsOf(8), cards, knife, sfc32(5, 6, 7, 8));
    const b = dealDeck(seatsOf(8), cards, knife, sfc32(5, 6, 7, 8));
    expect([...a.dealt]).toEqual([...b.dealt]);
    expect(a.undealt).toEqual(b.undealt);
  });

  it('throws for fewer cards than seats and for more forced cards than seats', () => {
    expect(() => dealDeck(seatsOf(5), ['a', 'b', 'c', 'd'], () => false, mulberry32(1))).toThrow();
    expect(() => dealDeck(seatsOf(2), ['k', 'k', 'k', 'x'], (c) => c === 'k', mulberry32(1))).toThrow();
  });
});
