import { describe, expect, it } from 'vitest';
import { toScreen } from '@wdi/shared/iso';
import { BIAS, DEPTH, cameraBounds, decalTransform, depthAt, isoZoom, tileDiamond } from './iso';

describe('isoZoom (SPRITES 10.9)', () => {
  it('snaps down to a multiple of 0.5', () => {
    expect(isoZoom(720)).toBe(1);
    expect(isoZoom(844)).toBe(1);
    expect(isoZoom(1080)).toBe(1.5);
    expect(isoZoom(1440)).toBe(2);
    expect(isoZoom(390)).toBe(0.5);
  });
  it('clamps to 0.5 and 2 and steps exactly at 704 px', () => {
    expect(isoZoom(100)).toBe(0.5);
    expect(isoZoom(4000)).toBe(2);
    expect(isoZoom(703)).toBe(0.5);
    expect(isoZoom(704)).toBe(1);
  });
});

describe('cameraBounds (SPRITES 10.9)', () => {
  it('grows the diamond box by 320 px above and a tile elsewhere', () => {
    const b = cameraBounds(64, 48, 100, 100);
    expect(b).toEqual({ x: -3072 - 64, y: -320, width: 7168 + 128, height: 3584 + 320 + 64 });
  });
  it('centres a scene smaller than the view with equal padding', () => {
    const b = cameraBounds(4, 4, 2000, 1500);
    const small = cameraBounds(4, 4, 0, 0);
    expect(b.width).toBe(2000);
    expect(b.height).toBe(1500);
    expect(b.x + b.width / 2).toBeCloseTo(small.x + small.width / 2);
    expect(b.y + b.height / 2).toBeCloseTo(small.y + small.height / 2);
  });
});

describe('depth (SPRITES 10.6)', () => {
  it('sorts by the screen y of the ground anchor plus the bias', () => {
    expect(depthAt(64, 128)).toBe(96);
    expect(depthAt(64, 128, BIAS.character)).toBe(96.5);
    expect(depthAt(100, 101, BIAS.character)).toBeGreaterThan(depthAt(96, 96));
    expect(depthAt(90, 90, BIAS.character)).toBeLessThan(depthAt(96, 96));
  });
  it('keeps the bands in order', () => {
    expect(DEPTH.ground).toBeLessThan(DEPTH.blend1);
    expect(DEPTH.blend2).toBeLessThan(DEPTH.decal);
    expect(DEPTH.decal).toBeLessThan(0);
    expect(DEPTH.darkness).toBeLessThan(DEPTH.glow);
    expect(DEPTH.glow).toBeLessThan(DEPTH.marks);
  });
});

describe('decal transform (SPRITES 10.5)', () => {
  it('is the projection: rotate 45 degrees, scale sqrt 2, squash y by half', () => {
    const t = decalTransform(0);
    const apply = (x: number, y: number) => {
      const c = Math.cos(t.rotation);
      const s = Math.sin(t.rotation);
      return { x: (x * c - y * s) * t.scale, y: (x * s + y * c) * t.scale * t.squashY };
    };
    for (const [x, y] of [
      [64, 0],
      [0, 64],
      [-30, 17],
    ] as const) {
      const got = apply(x, y);
      const want = toScreen(x, y);
      expect(got.x).toBeCloseTo(want.x, 9);
      expect(got.y).toBeCloseTo(want.y, 9);
    }
  });
  it('adds the decal rotation to the quarter turn', () => {
    expect(decalTransform(Math.PI / 4).rotation).toBeCloseTo(Math.PI / 2);
  });
});

describe('tileDiamond', () => {
  it('is a 128 x 64 diamond, top vertex first', () => {
    const d = tileDiamond(3, 2);
    expect(d[0]).toEqual({ x: 64, y: 160 });
    expect(d[1]).toEqual({ x: 128, y: 192 });
    expect(d[2]).toEqual({ x: 64, y: 224 });
    expect(d[3]).toEqual({ x: 0, y: 192 });
  });
});
