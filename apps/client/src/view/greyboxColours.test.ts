import { describe, expect, it } from 'vitest';
import { GROUND_ROWS as CONTENT_ROWS } from '@wdi/content';
import { GROUND_ROWS, groundColour, materialOfGid, shade } from './greyboxColours';

describe('ground rows', () => {
  it('copies the content package row order', () => {
    expect(GROUND_ROWS).toBe(CONTENT_ROWS);
  });
  it('maps a gid to its material: 20 cells per material from gid 1', () => {
    expect(materialOfGid(0)).toBeNull();
    expect(materialOfGid(1)).toBe('g');
    expect(materialOfGid(20)).toBe('g');
    expect(materialOfGid(21)).toBe('l');
    expect(materialOfGid(1 + 20 * 13)).toBe('O');
    expect(materialOfGid(1 + 20 * 14)).toBeNull();
  });
  it('colours every material', () => {
    for (const m of GROUND_ROWS) expect(groundColour(m)).toBeGreaterThan(0);
  });
});

describe('shade', () => {
  it('scales channels and clamps', () => {
    expect(shade(0x102030, 2)).toBe(0x204060);
    expect(shade(0xf0f0f0, 2)).toBe(0xffffff);
    expect(shade(0x808080, 0)).toBe(0);
  });
});
