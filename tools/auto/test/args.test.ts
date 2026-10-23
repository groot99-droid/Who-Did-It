import { describe, expect, it } from 'vitest';
import { npcIdsFor, parseArgs, seedWordsFor } from '../args';

describe('pnpm auto arguments', () => {
  it('reads every flag and keeps the defaults', () => {
    expect(parseArgs([])).toEqual({
      matches: 20,
      seed: 1,
      map: 'hollowmere',
      difficulty: 'normal',
      seats: 6,
      json: false,
    });
    expect(
      parseArgs([
        '--matches',
        '50',
        '--seed',
        '7',
        '--map',
        'blackpine',
        '--difficulty',
        'hard',
        '--seats',
        '10',
        '--json',
      ]),
    ).toEqual({
      matches: 50,
      seed: 7,
      map: 'blackpine',
      difficulty: 'hard',
      seats: 10,
      json: true,
    });
  });

  it('refuses what it does not know', () => {
    expect(parseArgs(['--speed', '10'])).toBeNull();
    expect(parseArgs(['--matches', 'many'])).toBeNull();
    expect(parseArgs(['--mode', 'main'])).toBeNull();
    expect(parseArgs(['--seed'])).toBeNull();
  });
});

describe('pnpm auto seeds', () => {
  const streams = ['deal', 'traits', 'npcPlay'];
  it('gives the same words for the same seed and match, and different ones otherwise', () => {
    const a = seedWordsFor(7, 0, streams);
    expect(seedWordsFor(7, 0, streams)).toEqual(a);
    expect(Object.keys(a)).toEqual(streams);
    for (const w of Object.values(a)) for (const n of w) expect(n >>> 0).toBe(n);
    expect(seedWordsFor(7, 1, streams).deal).not.toEqual(a.deal);
    expect(seedWordsFor(8, 0, streams).deal).not.toEqual(a.deal);
    expect(a.traits).not.toEqual(a.deal);
  });

  it('names the seats of a match from the seed', () => {
    expect(npcIdsFor(7, 2, 3)).toEqual(['a7m2s0', 'a7m2s1', 'a7m2s2']);
  });
});
