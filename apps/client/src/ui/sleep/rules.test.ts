import { Phase } from '@wdi/shared';
import { describe, expect, it } from 'vitest';
import { SLEEP_COPY } from '../copy/sleep';
import { bedSpots, canLieDown, countParts, sleptThrough } from './rules';

describe('sleep rules (A8)', () => {
  it('finds beds, cots and inn beds and nothing else', () => {
    const spots = bedSpots([
      { id: 'a_bed', kind: 'bed', x: 2, y: 3 },
      { id: 'ch_cot', kind: 'cot', x: 4, y: 4 },
      { id: 'tb_inn', kind: 'innBed', x: 1, y: 1 },
      { id: 'a_table', kind: 'table', x: 0, y: 0 },
    ]);
    expect(spots.map((s) => [s.propId, s.kind])).toEqual([
      ['a_bed', 'bed'],
      ['ch_cot', 'cot'],
      ['tb_inn', 'innBed'],
    ]);
  });

  it('offers a bed at dusk and at night only', () => {
    const open = Object.entries(Phase).filter(([, v]) => canLieDown(v));
    expect(open.map(([k]) => k).sort()).toEqual(['dusk', 'night']);
  });

  it('shows a count only while the server wrote one, and never a name', () => {
    expect(countParts(0, 0)).toBeNull();
    expect(countParts(2, 3)).toEqual({ n: 2, m: 3 });
    for (const line of Object.values(SLEEP_COPY)) expect(line).not.toMatch(/\{(seat|name|player|id)\}/);
  });

  it('says "You slept through" when the sleeper wakes outside dusk and night, not on a hit or a move', () => {
    expect(sleptThrough(true, false, Phase.dawn)).toBe(true);
    expect(sleptThrough(true, false, Phase.day)).toBe(true);
    expect(sleptThrough(true, false, Phase.night)).toBe(false);
    expect(sleptThrough(true, false, Phase.dusk)).toBe(false);
    expect(sleptThrough(true, true, Phase.dawn)).toBe(false);
    expect(sleptThrough(false, false, Phase.dawn)).toBe(false);
  });
});
