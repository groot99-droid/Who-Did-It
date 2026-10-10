import { describe, expect, it } from 'vitest';
import { keyVector, stickVector } from './vectors';

describe('keyVector', () => {
  it('maps WASD and arrows, and opposing keys cancel', () => {
    expect(keyVector(new Set(['KeyW']))).toEqual({ dx: 0, dy: -1 });
    expect(keyVector(new Set(['ArrowRight', 'KeyS']))).toEqual({ dx: 1, dy: 1 });
    expect(keyVector(new Set(['KeyA', 'KeyD']))).toEqual({ dx: 0, dy: 0 });
    expect(keyVector(new Set())).toEqual({ dx: 0, dy: 0 });
  });
});

describe('stickVector', () => {
  it('has a dead zone, clamps to the rim and keeps the direction', () => {
    expect(stickVector(2, 2, 50)).toEqual({ dx: 0, dy: 0 });
    const full = stickVector(500, 0, 50);
    expect(full).toEqual({ dx: 1, dy: 0 });
    const diag = stickVector(100, 100, 50);
    expect(Math.hypot(diag.dx, diag.dy)).toBeCloseTo(1);
    const half = stickVector(0, -25, 50);
    expect(half.dy).toBeCloseTo(-0.5);
  });
});
