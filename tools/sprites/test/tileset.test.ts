import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng, type Rgba } from '../bleed.ts';
import { hexToRgb } from '../oklab.ts';
import { finishEnabled, paletteFile } from '../palette.ts';
import { audit } from '../pixel.ts';
import {
  CELL_H,
  CELL_W,
  COLUMNS,
  GROUND_ROWS,
  GROUND_THEMES,
  SHEET_H,
  SHEET_W,
  buildTileset,
  cellUv,
  gidOf,
  inDiamond,
} from '../tileset.ts';

const ASSETS = join(import.meta.dirname, '../../../apps/client/public/assets');
const COLOURS = ['#3A5A33', '#5C4A2A', '#5E6C84', '#55332A', '#24171A', '#7A7067', '#9A9083'];

/** A flat render per material with a two-colour checker, so cells differ and the finish has work to do. */
function render(char: string, v: number): Rgba {
  const a = hexToRgb(COLOURS[GROUND_ROWS.indexOf(char) % COLOURS.length]!);
  const b = hexToRgb(COLOURS[(GROUND_ROWS.indexOf(char) + v + 1) % COLOURS.length]!);
  const data = new Uint8Array(CELL_W * CELL_H * 4);
  for (let y = 0; y < CELL_H; y++) {
    for (let x = 0; x < CELL_W; x++) {
      const c = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? a : b;
      data.set([...c, 255], (y * CELL_W + x) * 4);
    }
  }
  return { width: CELL_W, height: CELL_H, data };
}

function cell(sheet: Rgba, char: string, c: number): Rgba {
  const m = GROUND_ROWS.indexOf(char);
  const col = c % COLUMNS;
  const row = 2 * m + Math.floor(c / COLUMNS);
  const data = new Uint8Array(CELL_W * CELL_H * 4);
  for (let y = 0; y < CELL_H; y++) {
    const from = ((row * CELL_H + y) * sheet.width + col * CELL_W) * 4;
    data.set(sheet.data.subarray(from, from + CELL_W * 4), y * CELL_W * 4);
  }
  return { width: CELL_W, height: CELL_H, data };
}

const alphaAt = (img: Rgba, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3]!;

describe('the isometric ground tileset (docs/SPRITES.md 10.12)', () => {
  const on = buildTileset(render, true);
  const off = buildTileset(render, false);

  it('maps diamond pixels to tile coordinates', () => {
    const [u0, v0] = cellUv(63, 0, CELL_W, CELL_H); // just left of the top vertex: the north corner
    expect(u0).toBeCloseTo(0, 1);
    expect(v0).toBeCloseTo(0, 1);
    const [uc, vc] = cellUv(63, 31, CELL_W, CELL_H);
    expect(uc).toBeCloseTo(0.5, 1);
    expect(vc).toBeCloseTo(0.5, 1);
    expect(inDiamond(64, 32, CELL_W, CELL_H)).toBe(true);
    expect(inDiamond(2, 2, CELL_W, CELL_H)).toBe(false);
    expect(inDiamond(125, 61, CELL_W, CELL_H)).toBe(false);
  });

  it('is 1280 x 1792, ten columns of 128 x 64 cells, two rows per material', () => {
    expect([on.width, on.height]).toEqual([1280, 1792]);
    expect([SHEET_W, SHEET_H]).toEqual([1280, 1792]);
    expect([off.width, off.height]).toEqual([1280, 1792]);
    expect(gidOf('g', 0)).toBe(1);
    expect(gidOf('O', 19)).toBe(1 + 20 * 13 + 19);
    expect(() => gidOf('W', 0)).toThrow();
  });

  it('fills every base cell to its diamond and leaves cell 19 empty', () => {
    for (const char of GROUND_ROWS) {
      for (let v = 0; v < 4; v++) {
        const c = cell(on, char, v);
        expect(alphaAt(c, 64, 32), `${char} ${v} centre`).toBe(255);
        expect(alphaAt(c, 1, 1), `${char} ${v} corner`).toBe(0);
        expect(alphaAt(c, 126, 62), `${char} ${v} corner`).toBe(0);
      }
      expect(
        cell(on, char, 19).data.every((b) => b === 0),
        `${char} 19`,
      ).toBe(true);
    }
  });

  it('puts each edge overlay on its sides only, never on the tile centre', () => {
    const near = { 1: [92, 18], 2: [92, 46], 4: [36, 46], 8: [36, 18] } as const; // just inside each side
    for (const char of GROUND_ROWS) {
      for (let k = 1; k <= 15; k++) {
        const c = cell(on, char, 3 + k);
        expect(alphaAt(c, 64, 32), `${char} k=${k} centre`).toBe(0);
        for (const [bit, [x, y]] of Object.entries(near)) {
          const want = (k & Number(bit)) !== 0 ? 255 : 0;
          expect(alphaAt(c, x, y), `${char} k=${k} side ${bit}`).toBe(want);
        }
      }
    }
  });

  it('is all world colours with hard alpha when the finish is on, at the size it has when off', () => {
    const a = audit(on);
    expect(a.offPalette).toBe(0);
    expect(a.partialAlpha).toBe(0);
    expect(audit(off).offPalette).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic', () => {
    expect(Buffer.from(buildTileset(render, true).data).equals(Buffer.from(on.data))).toBe(true);
  });

  it.each(GROUND_THEMES)('ships iso_ground_%s at 1280 x 1792 under the finish switch', (theme) => {
    const file = join(ASSETS, 'ground', `iso_ground_${theme}.png`);
    if (!existsSync(file)) return;
    const img = decodePng(readFileSync(file));
    expect([img.width, img.height]).toEqual([1280, 1792]);
    if (!finishEnabled('main')) return;
    const a = audit(img);
    expect(a.offPalette).toBe(0);
    expect(a.partialAlpha).toBe(0);
    expect(a.saturatedShare).toBeLessThanOrEqual(paletteFile.rules.maxSaturatedAccentShare);
  });
});
