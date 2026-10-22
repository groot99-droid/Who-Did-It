import { describe, expect, it } from 'vitest';
import { parseArgs } from '../args';

describe('pnpm auto arguments', () => {
  it('reads every flag and keeps the defaults', () => {
    expect(parseArgs([])).toEqual({
      matches: 20,
      seed: 1,
      map: 'hollowmere',
      mode: 'main',
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
        '--mode',
        'onub',
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
      mode: 'onub',
      difficulty: 'hard',
      seats: 10,
      json: true,
    });
  });

  it('refuses what it does not know', () => {
    expect(parseArgs(['--speed', '10'])).toBeNull();
    expect(parseArgs(['--matches', 'many'])).toBeNull();
    expect(parseArgs(['--mode', 'story'])).toBeNull();
    expect(parseArgs(['--seed'])).toBeNull();
  });
});
