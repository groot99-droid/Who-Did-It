import { describe, expect, it } from 'vitest';
import {
  isoDepth,
  keysToWorld,
  radiusEllipse,
  sceneBounds,
  screenDir,
  screenDirOfYaw,
  stickToWorld,
  tileCentre,
  tileTop,
  toScreen,
  toWorld,
} from '../src/iso';

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};
const unit = (v: { x: number; y: number }) => {
  const l = Math.hypot(v.x, v.y);
  return { x: v.x / l, y: v.y / l };
};

describe('projection (SPRITES 10.2)', () => {
  it('maps a tile to a 128 x 64 diamond', () => {
    expect(tileTop(0, 0)).toEqual({ x: 0, y: 0 });
    expect(toScreen(64, 0)).toEqual({ x: 64, y: 32 });
    expect(toScreen(64, 64)).toEqual({ x: 0, y: 64 });
    expect(toScreen(0, 64)).toEqual({ x: -64, y: 32 });
    expect(tileCentre(3, 2)).toEqual({ x: 64, y: 192 });
  });
  it('round-trips through the inverse', () => {
    for (const [x, y] of [
      [0, 0],
      [123.5, 77.25],
      [4095, 3071],
      [-10, 33],
    ]) {
      const s = toScreen(x!, y!);
      close(toWorld(s.x, s.y), { x: x!, y: y! });
    }
  });
  it('sorts by the screen y of the ground point', () => {
    expect(isoDepth(64, 128)).toBe(96);
    expect(isoDepth(10, 10)).toBe(toScreen(10, 10).y);
  });
  it('bounds a scene diamond', () => {
    expect(sceneBounds(64, 48)).toEqual({ x: -3072, y: 0, width: 7168, height: 3584 });
  });
  it('draws a radius as an ellipse twice as wide as tall', () => {
    const e = radiusEllipse(7);
    expect(e.rx / e.ry).toBeCloseTo(2, 9);
    expect(e.rx).toBeCloseTo(633.6, 1);
  });
});

describe('directions (SPRITES 10.4)', () => {
  it('turns the eight world facings into eight screen directions', () => {
    const world: Array<[number, number, string]> = [
      [0, -1, 'ne'],
      [1, -1, 'e'],
      [1, 0, 'se'],
      [1, 1, 's'],
      [0, 1, 'sw'],
      [-1, 1, 'w'],
      [-1, 0, 'nw'],
      [-1, -1, 'n'],
    ];
    for (const [x, y, dir] of world) expect(screenDir(x, y), `${x},${y}`).toBe(dir);
  });
  it('reads Presence.yaw in the world frame', () => {
    expect(screenDirOfYaw(0)).toBe('ne');
    expect(screenDirOfYaw(Math.PI / 2)).toBe('se');
    expect(screenDirOfYaw(-Math.PI / 4)).toBe('n');
  });
});

describe('input (SPRITES 10.8)', () => {
  it('walks single keys along the screen axes and two keys along the grid', () => {
    close(unit(keysToWorld(0, -1)), unit({ x: -1, y: -1 }));
    close(unit(keysToWorld(1, 0)), unit({ x: 1, y: -1 }));
    close(unit(keysToWorld(1, -1)), { x: 0, y: -1 });
    close(unit(keysToWorld(-1, 1)), { x: 0, y: 1 });
    close(unit(keysToWorld(1, 1)), { x: 1, y: 0 });
    for (const [kx, ky] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const w = keysToWorld(kx!, ky!);
      close(unit(toScreen(w.x, w.y)), { x: kx!, y: ky! });
    }
  });
  it('walks a stick exactly where the thumb points', () => {
    for (const [sx, sy] of [
      [0.3, -0.8],
      [-1, 0.2],
      [0.7, 0.7],
    ]) {
      const w = stickToWorld(sx!, sy!);
      close(unit(toScreen(w.x, w.y)), unit({ x: sx!, y: sy! }));
      expect(Math.hypot(w.x, w.y)).toBeCloseTo(Math.hypot(sx!, sy!), 9);
    }
    expect(stickToWorld(0, 0)).toEqual({ x: 0, y: 0 });
  });
});
