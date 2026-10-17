import { describe, expect, it } from 'vitest';
import { MatchSeeds } from '../src/sim/seeds';

describe('MatchSeeds', () => {
  it('keeps one stream per name for the match', () => {
    const seeds = new MatchSeeds();
    const deal = seeds.get('deal');
    expect(seeds.get('deal')).toBe(deal);
  });

  it('gives every name its own stream', () => {
    const seeds = new MatchSeeds();
    const a = Array.from({ length: 8 }, seeds.get('deal'));
    const b = Array.from({ length: 8 }, seeds.get('traits'));
    expect(a).not.toEqual(b);
  });

  it('draws fresh seeds for every match', () => {
    const one = Array.from({ length: 8 }, new MatchSeeds().get('deal'));
    const two = Array.from({ length: 8 }, new MatchSeeds().get('deal'));
    expect(one).not.toEqual(two);
  });
});
