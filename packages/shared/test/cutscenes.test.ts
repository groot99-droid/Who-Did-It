import { describe, expect, it } from 'vitest';
import { deathCutsceneFor, openingFor, type CutsceneIndex } from '../src/rules';

const index: CutsceneIndex = {
  deaths: { knife: 'deathKnife', wolf: 'deathWolf' },
  openings: { hollowmere: 'openingHollowmere' },
};

describe('cutscene rules (GDD 3.18)', () => {
  it('names the death cutscene of a cause', () => {
    expect(deathCutsceneFor(index, 'knife')).toBe('deathKnife');
    expect(deathCutsceneFor(index, 'wolf')).toBe('deathWolf');
  });

  it('has none for a cause the index leaves out, and never for a vanishing', () => {
    expect(deathCutsceneFor(index, 'poison')).toBeNull();
    expect(
      deathCutsceneFor({ ...index, deaths: { ...index.deaths, vanished: 'x' } as never }, 'vanished'),
    ).toBeNull();
  });

  it('names the opening of a map, or none', () => {
    expect(openingFor(index, 'hollowmere')).toBe('openingHollowmere');
    expect(openingFor(index, 'blackpine')).toBeNull();
    expect(openingFor(index, 'toString')).toBeNull();
  });
});
