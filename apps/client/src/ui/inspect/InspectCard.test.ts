import relations from '@wdi/content/data/relations.json';
import { describe, expect, it } from 'vitest';
import { inspectLine } from '../copy/inspect';
import { inspectLines, noticedLine } from './InspectCard';

// UI.md 14.33 (Session 8B, GDD 3.22 "Inspect").

const result = {
  targetId: 'h1',
  lookId: 'vicar',
  signs: [] as string[],
  health: 'unhurt' as const,
  purse: 'unknown' as const,
  light: false,
};

describe('the inspect card', () => {
  it('names the look and says when there is no sign', () => {
    expect(inspectLines(result)).toEqual({
      title: 'The Vicar',
      signs: ['No sign of trouble'],
      facts: ['Unhurt', 'You cannot tell their purse'],
    });
  });

  it('lists the signs it has words for, then the bands and a light', () => {
    const lines = inspectLines({
      ...result,
      signs: ['inspect.sign.limping', 'inspect.sign.fromTheFuture', 'inspect.sign.bloody'],
      health: 'badlyHurt',
      purse: 'heavy',
      light: true,
    });
    expect(lines.signs).toEqual(['Limping', 'Blood on their clothes']);
    expect(lines.facts).toEqual(['Badly hurt', 'A heavy purse', 'Carries a lit light']);
  });

  it('words the notice by look, or as someone', () => {
    expect(noticedLine('detective')).toBe('The Detective looked you over');
    expect(noticedLine('')).toBe('Someone looked you over');
  });

  it('has a line for every hunch of relations.json', () => {
    for (const row of relations.rows as { note?: string }[])
      if (row.note !== undefined) expect(inspectLine(row.note), row.note).not.toBeNull();
  });
});
