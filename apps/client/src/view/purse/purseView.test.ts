import { describe, expect, it } from 'vitest';
import { readPurse } from './purseView';

describe('readPurse', () => {
  it('shows no change on the first reading, then the signed change', () => {
    expect(readPurse(null, 12)).toEqual({ amount: 12, delta: 0 });
    expect(readPurse(12, 15)).toEqual({ amount: 15, delta: 3 });
    expect(readPurse(15, 11)).toEqual({ amount: 11, delta: -4 });
    expect(readPurse(11, 11)).toEqual({ amount: 11, delta: 0 });
  });
});
