import { describe, expect, it } from 'vitest';
import { toScreen } from '@wdi/shared/iso';
import { BIAS, depthAt } from './iso';
import {
  CULL_MARGIN_TILES,
  FADED_ALPHA,
  characterRect,
  cullRect,
  defDepth,
  kitHeightPx,
  kitOccludes,
  moved,
  overlaps,
  parseKitFrame,
  prismRect,
  propOccludes,
  shouldFade,
  sliceDefs,
  sliceFrame,
  stepFade,
} from './statics';

describe('parseKitFrame (SPRITES 10.12)', () => {
  it('reads kind, height and variant', () => {
    expect(parseKitFrame('wall/half/2')).toEqual({ kind: 'wall', height: 'half', variant: 2 });
    expect(parseKitFrame('tree/full/1')?.kind).toBe('tree');
  });
  it('refuses anything else', () => {
    for (const bad of [
      'wall/half',
      'door/full/0',
      'wall/tall/0',
      'wall/full/4',
      'wall/full/x',
      'wall/full/0/1',
    ])
      expect(parseKitFrame(bad), bad).toBeNull();
  });
});

describe('occluders (SPRITES 10.7)', () => {
  it('hides you behind full and half walls, trees and cliffs, not behind sills and ledges', () => {
    expect(kitOccludes('wall', 'full')).toBe(true);
    expect(kitOccludes('wall', 'half')).toBe(true);
    expect(kitOccludes('wall', 'stub')).toBe(false);
    expect(kitOccludes('tree', 'full')).toBe(true);
    expect(kitOccludes('tree', 'stub')).toBe(false);
    expect(kitOccludes('cliff', 'stub')).toBe(false);
  });
  it('lets the tall-prop rule decide fences, stacks and boulders', () => {
    expect(kitOccludes('fence', 'full')).toBe(true);
    expect(kitOccludes('boulder', 'half')).toBe(false);
    expect(kitHeightPx('full')).toBeCloseTo(147.5);
  });
  it('counts a prop as an occluder above 96 px', () => {
    expect(propOccludes(96)).toBe(false);
    expect(propOccludes(97)).toBe(true);
  });
});

describe('building slices (SPRITES 10.5, 10.6)', () => {
  const fp = { x: 10, y: 20, w: 3, h: 2 };
  const slices = sliceDefs('bld.shop', 'bld_hollowmere', 'shop', fp, 200);
  it('cuts one slice per footprint tile, all placed at the footprint centre', () => {
    expect(slices).toHaveLength(6);
    expect(slices.map((s) => s.frame)).toContain(sliceFrame('shop', 2, 1));
    for (const s of slices) {
      expect(s.x).toBe(11.5 * 64);
      expect(s.y).toBe(21 * 64);
    }
  });
  it('sorts each slice by the centre of its own tile', () => {
    const s = slices.find((d) => d.frame === 'shop#1_0')!;
    expect(defDepth(s)).toBe(depthAt(11.5 * 64, 20.5 * 64));
  });
  it('orders a character against the slices of a building it walks round', () => {
    // A character on the tile south of or east of a slice's tile stands in front of it; north or west, behind.
    for (const s of slices) {
      const tx = Math.floor(s.depthX / 64);
      const ty = Math.floor(s.depthY / 64);
      const at = (cx: number, cy: number) => depthAt((cx + 0.5) * 64, (cy + 0.5) * 64, BIAS.character);
      expect(at(tx, ty + 1)).toBeGreaterThan(defDepth(s));
      expect(at(tx + 1, ty)).toBeGreaterThan(defDepth(s));
      expect(at(tx, ty - 1)).toBeLessThan(defDepth(s));
      expect(at(tx - 1, ty)).toBeLessThan(defDepth(s));
    }
    // Walking round the footprint clockwise, the front slices of a column draw over a character standing behind them.
    const back = depthAt(11.5 * 64, 19.5 * 64, BIAS.character);
    const front = slices.filter((s) => s.frame === 'shop#1_1')[0]!;
    expect(back).toBeLessThan(defDepth(front));
  });
});

describe('fade (SPRITES 10.7)', () => {
  const wall = sliceDefs('w', 'k', 'wall', { x: 5, y: 5, w: 1, h: 1 }, 147)[0]!;
  // the wall's screen box: a tile wide and 147 px tall above its ground point
  const c = toScreen(wall.x, wall.y);
  const box = { x: c.x - 64, y: c.y - 147 - 32, width: 128, height: 147 + 64 };
  it('fades a wall in front of you that covers your frame', () => {
    // one tile north-west of the wall (screen straight above), the wall is in front and covers you
    expect(shouldFade(wall, box, 4.5 * 64, 4.5 * 64)).toBe(true);
  });
  it('does not fade a wall behind you', () => {
    expect(shouldFade(wall, box, 6.5 * 64, 6.5 * 64)).toBe(false);
  });
  it('tests only occluders within four tiles south or east of you', () => {
    // a wall five tiles south-east of the viewer is out of reach even when its box covers the viewer's frame
    const far = { ...wall, depthX: 9.5 * 64, depthY: 4.5 * 64 };
    expect(shouldFade(far, { x: -1000, y: -1000, width: 5000, height: 5000 }, 4.5 * 64, 4.5 * 64)).toBe(
      false,
    );
    expect(
      shouldFade(
        { ...far, depthX: 8.5 * 64 },
        { x: -1000, y: -1000, width: 5000, height: 5000 },
        4.5 * 64,
        4.5 * 64,
      ),
    ).toBe(true);
  });
  it('does not fade a wall that does not overlap your frame', () => {
    expect(shouldFade(wall, box, 5.5 * 64 + 3 * 64, 4.5 * 64 - 3 * 64)).toBe(false);
  });
  it('never fades a non-occluder', () => {
    expect(shouldFade({ ...wall, occluder: false }, box, 4.5 * 64, 4.5 * 64)).toBe(false);
  });
  it('overlaps is strict', () => {
    expect(overlaps({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 5, height: 5 })).toBe(false);
    expect(overlaps(characterRect(0, 0), characterRect(10, 10))).toBe(true);
  });
  it('takes 0.15 s to fade the whole way, either direction', () => {
    let a = 1;
    a = stepFade(a, FADED_ALPHA, 0.075);
    expect(a).toBeCloseTo((1 + FADED_ALPHA) / 2);
    a = stepFade(a, FADED_ALPHA, 0.5);
    expect(a).toBe(FADED_ALPHA);
    a = stepFade(a, 1, 1);
    expect(a).toBe(1);
  });
});

describe('culling (SPRITES 10.14)', () => {
  it('grows the view by two tiles', () => {
    const r = cullRect({ x: 0, y: 0, width: 100, height: 100 });
    expect(r.x).toBe(-CULL_MARGIN_TILES * 128);
    expect(r.width).toBe(100 + CULL_MARGIN_TILES * 256);
    expect(r.y).toBe(-CULL_MARGIN_TILES * 64);
  });
  it('redoes the cull only after the camera moves more than a tile', () => {
    expect(moved(null, { x: 0, y: 0 })).toBe(true);
    expect(moved({ x: 0, y: 0 }, { x: 30, y: 30 })).toBe(false);
    expect(moved({ x: 0, y: 0 }, { x: 64, y: 1 })).toBe(true);
  });
});

describe('prismRect', () => {
  it('boxes a one-tile block: 128 wide, its diamond plus its height tall', () => {
    expect(prismRect({ tilesW: 1, tilesH: 1, heightPx: 100 }, { x: 10, y: 200 })).toEqual({
      x: -54,
      y: 200 - 32 - 100,
      width: 128,
      height: 64 + 100,
    });
  });
});
