import { describe, expect, it } from 'vitest';
import { ROUND6_CHECKS, missingChecks } from '../checks';
import { type MatchLine, readLines, summarize } from '../report/summary';

const line = (over: Partial<MatchLine>): MatchLine => ({
  match: 1,
  ms: 900,
  winner: 'cabal',
  ticks: 18000,
  rounds: 5,
  failures: [],
  seeds: { deal: [1, 2, 3, 4] },
  npcIds: ['a', 'b'],
  log: { kills: 2 },
  ...over,
});

describe('tools/auto checks', () => {
  it('registers every round-6 check on import', () => {
    expect(missingChecks(ROUND6_CHECKS)).toEqual([]);
    expect(missingChecks(['privLeak'])).toHaveLength(ROUND6_CHECKS.length - 1);
  });
});

describe('tools/auto report', () => {
  it('reads the match lines of a --json run and skips the rest', () => {
    const text = [
      '> @wdi/auto start',
      JSON.stringify(line({})),
      '{not json',
      JSON.stringify({ event: 'x' }),
    ].join('\n');
    expect(readLines(text)).toHaveLength(1);
  });

  it('counts winners and passes a clean run', () => {
    const r = summarize('auto (hollowmere, main)', [
      line({ match: 1 }),
      line({ match: 2, winner: 'village', ticks: 12000 }),
      line({ match: 3, ticks: 20000, log: { kills: 4 } }),
    ]);
    expect(r).toMatchObject({ failed: 0, matches: 3 });
    expect(r.markdown).toContain('3/3 matches clean');
    expect(r.markdown).toContain('| cabal | 2 |');
    expect(r.markdown).toContain('median 18000');
    expect(r.markdown).toContain('kills median 2');
  });

  it('fails a match with an invariant failure or without game over, with its seed words', () => {
    const r = summarize('auto', [
      line({ match: 1 }),
      line({ match: 2, failures: [{ name: 'npcStuck', tick: 4000, detail: 'NPC a on 0:3,4\nmore' }] }),
      line({ match: 3, winner: 'none', seeds: { deal: [9, 9, 9, 9] } }),
    ]);
    expect(r.failed).toBe(2);
    expect(r.markdown).toContain('| npcStuck | 1 |');
    expect(r.markdown).toContain('FAIL npcStuck at tick 4000: NPC a on 0:3,4');
    expect(r.markdown).not.toContain('more');
    expect(r.markdown).toContain('UNFINISHED');
    expect(r.markdown).toContain('seed deal 9 9 9 9');
  });
});
