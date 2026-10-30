import { describe, expect, it } from 'vitest';
import { questRows } from './QuestLog';

// Round 10 (D9, GDD 3.16): a chain step shows as an offer only once the step before it is turned in.
describe('questRows chains', () => {
  const near = new Set(['moll']);
  const offers = (mine: Array<{ id: string; progress: number; done: boolean }>) =>
    questRows(mine as never, [], near)
      .filter((r) => r.state === 'offer')
      .map((r) => r.id);

  it('hides the second step until the first is done', () => {
    expect(offers([])).toEqual(['mollsHerbs', 'mollsMushrooms']);
    expect(offers([{ id: 'mollsMushrooms', progress: 0, done: false }])).toEqual(['mollsHerbs']);
    expect(offers([{ id: 'mollsMushrooms', progress: 3, done: true }])).toEqual(['mollsHerbs', 'mollsBrew']);
  });
});
