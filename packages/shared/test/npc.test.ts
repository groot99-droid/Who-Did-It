import { describe, expect, it } from 'vitest';
import { mulberry32, pickNpcNames } from '../src/rules';

describe('pickNpcNames (GDD 3.12)', () => {
  const pool = ['Mabel', 'Wilf', 'Dora Finch', 'Alfie', 'Edith'];

  it('never hands out a name a seat already holds, whatever its case or spacing', () => {
    const names = pickNpcNames(pool, [' mabel ', 'WILF'], 3, mulberry32(7));
    expect(names).toHaveLength(3);
    expect(new Set(names.map((n) => n.toLowerCase()))).not.toContain('mabel');
    expect(names).not.toContain('Wilf');
    expect(new Set(names).size).toBe(3);
  });

  it('is seeded: the same seed gives the same order', () => {
    expect(pickNpcNames(pool, [], 5, mulberry32(3))).toEqual(pickNpcNames(pool, [], 5, mulberry32(3)));
  });

  it('throws when the pool cannot fill the seats', () => {
    expect(() => pickNpcNames(pool, ['Mabel'], 5, mulberry32(1))).toThrow(/name pool/);
  });
});
