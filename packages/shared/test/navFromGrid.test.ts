import { describe, expect, it } from 'vitest';
import { NAV_SOLID_CHARS, NAV_VERSION, TILE_PX, type NavSource, createNavGrid, navFromGrid } from '../src';

const ROOM: NavSource = {
  id: 'room',
  size: { w: 5, h: 3 },
  grid: ['##D##', '#.SH#', '#B.u#'],
  gates: [{ id: 'g', minProfile: 'large', x: 1, y: 1, w: 1, h: 1 }],
};

describe('navFromGrid', () => {
  it('marks the solid grid characters and copies the gates', () => {
    expect([...NAV_SOLID_CHARS].sort()).toEqual(['#', 'B', 'D', 'H']);
    expect(navFromGrid(ROOM)).toEqual({
      version: NAV_VERSION,
      sceneId: 'room',
      tile: TILE_PX,
      w: 5,
      h: 3,
      solid: ['11111', '10011', '11001'],
      gates: [{ id: 'g', minProfile: 'large', x: 1, y: 1, w: 1, h: 1 }],
    });
  });

  it('keeps only the gate fields the nav carries', () => {
    const extra = { ...ROOM, gates: [{ ...ROOM.gates[0]!, note: 'x' } as NavSource['gates'][number]] };
    expect(Object.keys(navFromGrid(extra).gates[0]!)).toEqual(['id', 'minProfile', 'x', 'y', 'w', 'h']);
  });

  it('builds a nav the collision grid reads', () => {
    const grid = createNavGrid(navFromGrid(ROOM), 'small');
    expect(grid.solidAt(1, 1)).toBe(true); // the gate, below its profile
    expect(grid.solidAt(2, 1)).toBe(false); // the spawn
    expect(createNavGrid(navFromGrid(ROOM), 'large').solidAt(1, 1)).toBe(false);
  });

  it('refuses a grid that does not match its size', () => {
    expect(() => navFromGrid({ ...ROOM, grid: ROOM.grid.slice(1) })).toThrow(
      'room: grid has 2 rows, size.h is 3',
    );
    expect(() => navFromGrid({ ...ROOM, grid: ['##D##', '#.S#', '#B.u#'] })).toThrow(
      'room: row 1 has 4 columns, size.w is 5',
    );
  });
});
