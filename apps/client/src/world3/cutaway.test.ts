import { describe, expect, it } from 'vitest';
import { TILE_PX } from '@wdi/shared/constants';
import { type Heading, billboardYaw, unitsOfRise } from './frame';
import { CUT_REACH, SILL, cutsView, type WallBox } from './cutaway';

/** Round 11, R4: the walls nearest the camera drop to a sill. */

const C = 8 * TILE_PX; // the room's centre, world px
const R = 4 * TILE_PX; // half its side
const H = unitsOfRise(96);
const T = 16; // wall thickness
const ROOM: Record<'north' | 'south' | 'west' | 'east', WallBox> = {
  north: { x: C, y: C - R, w: 2 * R, d: T, h: H },
  south: { x: C, y: C + R, w: 2 * R, d: T, h: H },
  west: { x: C - R, y: C, w: T, d: 2 * R, h: H },
  east: { x: C + R, y: C, w: T, d: 2 * R, h: H },
};
const focus = { x: C, y: C };
const cut = (h: Heading) =>
  Object.entries(ROOM)
    .filter(([, b]) => cutsView(b, focus, billboardYaw(h)))
    .map(([k]) => k)
    .sort();

describe('the cut-away (R4)', () => {
  it('a near wall is cut at every heading, and the far walls stand', () => {
    // At heading 0 the camera looks from world south-east; each quarter turn moves it round by one side.
    expect(cut(0)).toEqual(['east', 'south']);
    expect(cut(1)).toEqual(['east', 'north']);
    expect(cut(2)).toEqual(['north', 'west']);
    expect(cut(3)).toEqual(['south', 'west']);
  });

  it('cuts mid-turn too, by the yaw drawn', () => {
    const between = (billboardYaw(0) + billboardYaw(1)) / 2; // looking from world east
    expect(cutsView(ROOM.east, focus, between)).toBe(true);
    expect(cutsView(ROOM.west, focus, between)).toBe(false);
  });

  it('leaves a wall standing that is too far in front, off to the side, or too low to hide the focus', () => {
    const yaw = billboardYaw(0);
    const ahead = (dist: number) => ({ x: C + dist * Math.SQRT1_2, y: C + dist * Math.SQRT1_2 });
    const wall = (at: { x: number; y: number }, h = H): WallBox => ({ ...at, w: TILE_PX, d: TILE_PX, h });
    expect(cutsView(wall(ahead(2 * TILE_PX)), focus, yaw)).toBe(true);
    expect(cutsView(wall(ahead(CUT_REACH + 2 * TILE_PX)), focus, yaw)).toBe(false);
    // Six tiles across the screen (world north-east of the focus): beside it, not in front.
    expect(cutsView(wall({ x: C + 3 * TILE_PX, y: C - 3 * TILE_PX }), focus, yaw)).toBe(false);
    expect(cutsView(wall(ahead(3 * TILE_PX), SILL), focus, yaw)).toBe(false);
  });

  it('leaves a sill shorter than any wall it cuts', () => {
    expect(SILL).toBeGreaterThan(0);
    expect(SILL).toBeLessThan(H / 4);
  });
});
