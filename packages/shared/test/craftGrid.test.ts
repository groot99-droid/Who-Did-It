import { describe, expect, it } from 'vitest';
import { boxOf, cropGrid, matchGrid, type GridRecipe } from '../src/rules/craftGrid';

// Round 10, A13 (GDD 3.30): the crafting grid's match, shared by the server and the client's preview.

const torch: GridRecipe = {
  id: 'torch',
  in: [
    { item: 'timber', qty: 1 },
    { item: 'resin', qty: 1 },
  ],
  shape: [['resin'], ['timber']],
};
const snare: GridRecipe = {
  id: 'snare',
  in: [
    { item: 'herb', qty: 2 },
    { item: 'timber', qty: 1 },
  ],
};
const R = [torch, snare];
const _ = null;

describe('matchGrid', () => {
  it('matches a shapeless recipe in any cells, any order', () => {
    expect(matchGrid(R, 2, ['herb', 'timber', _, 'herb'])).toBe('snare');
    expect(matchGrid(R, 2, [_, 'herb', 'herb', 'timber'])).toBe('snare');
    expect(matchGrid(R, 3, [_, _, 'timber', _, 'herb', _, 'herb', _, _])).toBe('snare');
  });

  it('counts a unit per cell: too few or too many inputs match nothing', () => {
    expect(matchGrid(R, 2, ['herb', 'timber', _, _])).toBeNull();
    expect(matchGrid(R, 2, ['herb', 'herb', 'timber', 'timber'])).toBeNull();
    expect(matchGrid(R, 2, [_, _, _, _])).toBeNull();
  });

  it('matches a shaped recipe only in its shape, wherever it sits', () => {
    expect(matchGrid(R, 2, ['resin', _, 'timber', _])).toBe('torch');
    expect(matchGrid(R, 2, [_, 'resin', _, 'timber'])).toBe('torch');
    expect(matchGrid(R, 3, [_, _, _, _, 'resin', _, _, 'timber', _])).toBe('torch');
    expect(matchGrid(R, 2, ['timber', _, 'resin', _])).toBeNull(); // upside down
    expect(matchGrid(R, 2, ['resin', 'timber', _, _])).toBeNull(); // side by side
  });

  it('matches a shape mirrored', () => {
    const axe: GridRecipe = {
      id: 'axe',
      in: [
        { item: 'stone', qty: 2 },
        { item: 'timber', qty: 1 },
      ],
      shape: [
        ['stone', 'stone'],
        [null, 'timber'],
      ],
    };
    expect(matchGrid([axe], 2, ['stone', 'stone', _, 'timber'])).toBe('axe');
    expect(matchGrid([axe], 2, ['stone', 'stone', 'timber', _])).toBe('axe');
  });

  it('crops to the box of the items', () => {
    expect(cropGrid(3, [_, _, _, _, 'a', 'b', _, _, _])).toEqual([['a', 'b']]);
    expect(boxOf(3, [_, _, _, _, 'a', 'b', _, 'c', _])).toEqual({ h: 2, w: 2 });
    expect(boxOf(2, [_, _, _, _])).toEqual({ h: 0, w: 0 });
  });
});
