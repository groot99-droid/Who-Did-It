import { describe, expect, it } from 'vitest';
import { DIR_VECTORS, mulberry } from '../walk';

describe('walk helpers', () => {
  it('reproduces a run from its seed', () => {
    const a = mulberry(7);
    const b = mulberry(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(mulberry(8)()).not.toBe(mulberry(7)());
  });

  it('has 8 unit direction vectors starting north (screen up)', () => {
    expect(DIR_VECTORS).toHaveLength(8);
    expect(DIR_VECTORS[0]).toEqual({ dx: 0, dy: -1 });
    expect(DIR_VECTORS[2]).toEqual({ dx: 1, dy: 0 });
    for (const v of DIR_VECTORS) expect(Math.hypot(v.dx, v.dy)).toBeCloseTo(1, 2);
  });
});
