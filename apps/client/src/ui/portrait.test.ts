import { describe, expect, it } from 'vitest';
import { isCoverRole, lookName, portraitKey, roleLook } from './portrait';

describe('look helpers (GDD 3.17)', () => {
  it("reads a role card's look and whether the role wears another card's", () => {
    expect(roleLook('baker')).toBe('baker');
    expect(roleLook('townsfolk')).toBe('');
    expect(isCoverRole('killer')).toBe(true);
    expect(isCoverRole('accomplice')).toBe(true);
    expect(isCoverRole('drifter')).toBe(true);
    expect(isCoverRole('baker')).toBe(false);
  });

  it('names a look and its card portrait key from looks.json, and nothing for an unknown id', () => {
    expect(lookName('baker')).toBe('the Baker');
    expect(portraitKey('baker')).toBe('portrait_baker');
    expect(lookName('nobody')).toBe('');
    expect(portraitKey('nobody')).toBe('');
  });
});
