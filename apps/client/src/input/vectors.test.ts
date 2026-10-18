import { describe, expect, it } from 'vitest';
import { keyVector, stickVector, worldMove } from './vectors';

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

describe('worldMove (SPRITES 10.8)', () => {
  const unit = (v: { dx: number; dy: number }) => {
    const l = Math.hypot(v.dx, v.dy);
    return { x: v.dx / l, y: v.dy / l };
  };
  it('walks W up the screen: world north-west', () => {
    const w = unit(worldMove(keyVector(new Set(['KeyW'])), { dx: 0, dy: 0 }));
    expect(w.x).toBeCloseTo(-Math.SQRT1_2);
    expect(w.y).toBeCloseTo(-Math.SQRT1_2);
  });
  it('walks W+D along the grid: world north', () => {
    const w = unit(worldMove(keyVector(new Set(['KeyW', 'KeyD'])), { dx: 0, dy: 0 }));
    expect(w.x).toBeCloseTo(0);
    expect(w.y).toBeCloseTo(-1);
  });
  it('cancels opposing keys to exactly zero', () => {
    expect(worldMove(keyVector(new Set(['KeyA', 'KeyD'])), { dx: 0, dy: 0 })).toEqual({ dx: 0, dy: 0 });
  });
  it('walks the stick where the thumb points, at its own length', () => {
    const w = worldMove({ dx: 0, dy: 0 }, { dx: 0.6, dy: -0.3 });
    expect(Math.hypot(w.dx, w.dy)).toBeCloseTo(Math.hypot(0.6, 0.3));
    const sx = w.dx - w.dy;
    const sy = (w.dx + w.dy) / 2;
    expect(sy / sx).toBeCloseTo(-0.3 / 0.6);
  });
  it('sums keys and stick', () => {
    const k = worldMove(keyVector(new Set(['KeyD'])), { dx: 0, dy: 0 });
    const s = worldMove({ dx: 0, dy: 0 }, { dx: 0, dy: 1 });
    const both = worldMove(keyVector(new Set(['KeyD'])), { dx: 0, dy: 1 });
    expect(both.dx).toBeCloseTo(k.dx + s.dx);
    expect(both.dy).toBeCloseTo(k.dy + s.dy);
  });
});
