import { describe, expect, it } from 'vitest';
import { DIRECTIONS, dirFromVector } from '../src/direction';

describe('dirFromVector', () => {
  it('maps the 8 compass vectors clockwise from screen-up', () => {
    const cases: [number, number, string][] = [
      [0, -1, 'n'],
      [1, -1, 'ne'],
      [1, 0, 'e'],
      [1, 1, 'se'],
      [0, 1, 's'],
      [-1, 1, 'sw'],
      [-1, 0, 'w'],
      [-1, -1, 'nw'],
    ];
    for (const [dx, dy, dir] of cases) expect(dirFromVector(dx, dy)).toBe(dir);
  });

  it('is scale invariant and keeps the fallback for a zero vector', () => {
    expect(dirFromVector(0, -500)).toBe('n');
    expect(dirFromVector(0, 0)).toBe('s');
    expect(dirFromVector(0, 0, 'w')).toBe('w');
  });

  it('uses 45 degree sectors centred on each direction', () => {
    expect(dirFromVector(Math.sin(0.3), -Math.cos(0.3))).toBe('n'); // 17 deg
    expect(dirFromVector(Math.sin(0.5), -Math.cos(0.5))).toBe('ne'); // 29 deg
  });

  it('covers every direction exactly once around a circle', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 360; i++) {
      const r = (i * Math.PI) / 180;
      seen.add(dirFromVector(Math.sin(r), -Math.cos(r)));
    }
    expect([...seen].sort()).toEqual([...DIRECTIONS].sort());
  });
});
