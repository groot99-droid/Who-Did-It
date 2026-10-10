import { describe, expect, it } from 'vitest';
import { NAV_VERSION, type NavData, createNavGrid, moveAabb, navProblem, overlapsSolid } from '../src/index';

// 6x5 room, 64 px tiles: a wall ring, one pillar at (3,2) and a gate at (4,3) shut below medium.
const rows = ['111111', '100001', '100101', '100001', '111111'];
const data: NavData = {
  version: NAV_VERSION,
  sceneId: 't',
  tile: 64,
  w: 6,
  h: 5,
  solid: rows,
  gates: [{ id: 'g', minProfile: 'medium', x: 4, y: 3, w: 1, h: 1 }],
};
const small = createNavGrid(data, 'small');
const medium = createNavGrid(data, 'medium');
const HW = 16;

describe('NavGrid', () => {
  it('reads solid tiles and treats out of bounds as solid', () => {
    expect(small.solidAt(0, 0)).toBe(true);
    expect(small.solidAt(1, 1)).toBe(false);
    expect(small.solidAt(-1, 2)).toBe(true);
    expect(small.solidAt(6, 2)).toBe(true);
    expect(small.solidAtPx(3 * 64 + 5, 2 * 64 + 5)).toBe(true);
  });

  it('shuts gates below their profile only', () => {
    expect(small.solidAt(4, 3)).toBe(true);
    expect(medium.solidAt(4, 3)).toBe(false);
  });

  it('validates the file shape', () => {
    expect(navProblem(data)).toBeNull();
    expect(navProblem({ ...data, solid: ['11'] })).toMatch(/rows/);
    expect(navProblem({ ...data, version: 2 })).toMatch(/version/);
  });
});

describe('moveAabb', () => {
  it('moves freely through floor', () => {
    const r = moveAabb(small, 100, 100, 10, 5, HW, HW);
    expect(r).toMatchObject({ x: 110, y: 105, hitX: false, hitY: false });
  });

  it('stops at a wall instead of passing through, even on a huge step', () => {
    const r = moveAabb(small, 100, 100, 5000, 0, HW, HW);
    expect(r.hitX).toBe(true);
    expect(r.x).toBeLessThan(5 * 64 - HW + 0.01);
    expect(r.x).toBeGreaterThan(5 * 64 - HW - 0.01);
    const l = moveAabb(small, 100, 100, -5000, 0, HW, HW);
    expect(l.x).toBeGreaterThan(64 + HW - 0.01);
    expect(l.hitX).toBe(true);
    const d = moveAabb(small, 100, 100, 0, 5000, HW, HW);
    expect(d.y).toBeLessThan(4 * 64 - HW + 0.01);
    const u = moveAabb(small, 100, 100, 0, -5000, HW, HW);
    expect(u.y).toBeGreaterThan(64 + HW - 0.01);
  });

  it('slides along a wall on the free axis', () => {
    const r = moveAabb(small, 5 * 64 - HW - 0.002, 100, 20, 20, HW, HW);
    expect(r.hitX).toBe(true);
    expect(r.y).toBeCloseTo(120);
  });

  it('is blocked by the pillar and by a shut gate, and passes the open gate', () => {
    const toPillar = moveAabb(small, 2 * 64 + 32, 2 * 64 + 32, 100, 0, HW, HW);
    expect(toPillar.hitX).toBe(true);
    expect(toPillar.x).toBeLessThan(3 * 64);
    const shut = moveAabb(small, 4 * 64 + 32, 2 * 64 + 20, 0, 100, HW, HW);
    expect(shut.hitY).toBe(true);
    const open = moveAabb(medium, 4 * 64 + 32, 2 * 64 + 20, 0, 40, HW, HW);
    expect(open.hitY).toBe(false);
  });

  it('never leaves a resting box overlapping, so repeated pushing stays put', () => {
    let x = 100;
    for (let i = 0; i < 200; i++) x = moveAabb(small, x, 100, 14.4, 0, HW, HW).x;
    expect(overlapsSolid(small, x, 100, HW, HW)).toBe(false);
    expect(x).toBeLessThan(5 * 64 - HW + 0.01);
  });

  it('keeps a box walled in over many random steps', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
    let x = 100;
    let y = 100;
    for (let i = 0; i < 5000; i++) {
      const r = moveAabb(small, x, y, rnd() * 40, rnd() * 40, HW, HW);
      x = r.x;
      y = r.y;
      expect(overlapsSolid(small, x, y, HW, HW)).toBe(false);
    }
  });
});
