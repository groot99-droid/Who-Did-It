import { describe, expect, it } from 'vitest';
import { Phase } from '@wdi/shared';
import { dayPartOf, isLit } from './dayPart';

describe('dayPartOf (GDD 3.13)', () => {
  it('groups the phases into the three parts of the day', () => {
    for (const p of [Phase.grace, Phase.day, Phase.immunity]) expect(dayPartOf(p)).toBe('day');
    for (const p of [Phase.dusk, Phase.dawn]) expect(dayPartOf(p)).toBe('dusk');
    for (const p of [Phase.night, Phase.finalNight]) expect(dayPartOf(p)).toBe('night');
  });
  it('lights the lanterns from dusk to the end of the night', () => {
    expect(isLit('day')).toBe(false);
    expect(isLit('dusk')).toBe(true);
    expect(isLit('night')).toBe(true);
  });
});
