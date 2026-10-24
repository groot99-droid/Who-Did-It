import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng, encodePng, type Rgba } from '../bleed.ts';
import { hdSlices, hdStatic, hdTileset, texelsOf, texelsOfSize, webpPages, withTexels } from '../hd.ts';
import { imageSize } from './realAssets.ts';
import type { MultiAtlas } from '../pack.ts';
import { CELL_H, CELL_W, COLUMNS, GROUND_ROWS, inDiamond } from '../tileset.ts';

const TEXELS = 2;

function solid(w: number, h: number, rgb: [number, number, number], alpha = 255): Rgba {
  const img: Rgba = { width: w, height: h, data: new Uint8Array(w * h * 4) };
  for (let i = 0; i < w * h; i++) img.data.set([...rgb, alpha], i * 4);
  return img;
}

describe('hd texels', () => {
  it('reads the render factor and refuses a render without one', () => {
    expect(texelsOf({ factor: 2 }, 'x')).toBe(2);
    expect(() => texelsOf({}, 'props')).toThrow(/props.*--style hd/);
    expect(() => texelsOf({ factor: 1.5 }, 'x')).toThrow();
    expect(texelsOfSize(256, 128, 'g')).toBe(2);
    expect(() => texelsOfSize(200, 128, 'g')).toThrow(/whole multiple/);
  });
});

describe('hd tileset', () => {
  const sheet = hdTileset(
    (char, v) => solid(CELL_W * TEXELS, CELL_H * TEXELS, [100 + v, 120, GROUND_ROWS.indexOf(char)]),
    TEXELS,
  );
  const cw = CELL_W * TEXELS;
  const ch = CELL_H * TEXELS;
  const at = (col: number, row: number, x: number, y: number) => {
    const o = ((row * ch + y) * sheet.width + col * cw + x) * 4;
    return [...sheet.data.subarray(o, o + 4)];
  };

  it('is the 8-bit layout at texels times the cell: ten columns, two rows per material', () => {
    expect(sheet.width).toBe(cw * COLUMNS);
    expect(sheet.height).toBe(ch * 2 * GROUND_ROWS.length);
  });

  it('masks each base cell to its diamond, keeps the render at the centre and leaves cell 19 empty', () => {
    expect(at(1, 0, cw / 2, ch / 2)).toEqual([101, 120, 0, 255]);
    expect(at(0, 0, 0, 0)[3]).toBe(0);
    expect(inDiamond(cw / 2, ch / 2, cw, ch)).toBe(true);
    expect(at(9, 1, cw / 2, ch / 2)[3]).toBe(0);
  });

  it('rejects a render at the wrong size and wrong texels', () => {
    expect(() => hdTileset(() => solid(CELL_W, CELL_H, [0, 0, 0]), TEXELS)).toThrow(/want 256x128/);
  });

  it('puts the north edge overlay (cell 4) on the top side only', () => {
    let top = 0;
    let bottom = 0;
    for (let x = 0; x < cw; x++) {
      if (at(4, 0, x, 4)[3] !== 0) top++;
      if (at(4, 0, x, ch - 5)[3] !== 0) bottom++;
    }
    expect(top).toBeGreaterThan(0);
    expect(bottom).toBe(0);
  });
});

describe('hd slices', () => {
  it('cuts an HD building render one pixel to one, each slice cropped to its box in display px', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wdi-hd-'));
    const w = 16;
    const h = 8;
    const frame = solid(w, h, [90, 60, 40]);
    const tiles: Rgba = { width: w, height: h, data: new Uint8Array(w * h * 4) };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) tiles.data.set([x < w / 2 ? 1 : 2, 1, 0, 255], (y * w + x) * 4);
    }
    writeFileSync(join(dir, 'tavern.png'), encodePng(frame));
    writeFileSync(join(dir, 'tavern.tiles.png'), encodePng(tiles));
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        version: 1,
        atlas: 'bld_hollowmere',
        style: 'hd',
        factor: TEXELS,
        frames: {
          tavern: {
            file: 'tavern.png',
            tiles: 'tavern.tiles.png',
            cell: [w / TEXELS, h / TEXELS],
            pivot: [4, 3],
            footprint: [2, 1],
          },
        },
      }),
    );
    const { files, manifest } = hdSlices(dir);
    expect([...files.keys()].sort()).toEqual(['tavern__0_0.png', 'tavern__1_0.png']);
    // Each slice is cropped to its own box, in display px: the left half keeps the pivot, the right half's
    // moves with the crop.
    const t = TEXELS;
    expect(manifest.frames['tavern#0_0']).toEqual({
      file: 'tavern__0_0.png',
      cell: [w / 2 / t, h / t],
      pivot: [4, 3],
    });
    expect(manifest.frames['tavern#1_0']).toEqual({
      file: 'tavern__1_0.png',
      cell: [w / 2 / t, h / t],
      pivot: [0, 3],
    });
    const left = decodePng(files.get('tavern__0_0.png')!);
    expect([left.width, left.height]).toEqual([w / 2, h]);
    for (let i = 0; i < (w / 2) * h; i++) expect(left.data[i * 4 + 3]).toBe(255);
  });
});

describe('hd static sheet', () => {
  it('packs a subset of a sheet unhalved with its pivot as a fraction and a page at twice the cap', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wdi-hd-static-'));
    mkdirSync(dir, { recursive: true });
    const cell = 192 * TEXELS;
    writeFileSync(join(dir, 'prop_pump.png'), encodePng(solid(cell, cell, [10, 20, 30])));
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        version: 1,
        atlas: 'props',
        style: 'hd',
        factor: TEXELS,
        // Cells and pivots in display px, as build_props.py writes them.
        frames: { prop_pump: { file: 'prop_pump.png', cell: 192, pivot: [96, 192 - 16] } },
      }),
    );
    const files = await hdStatic(dir, true);
    const atlas = JSON.parse(files.get('props.json')!.toString('utf8')) as MultiAtlas;
    const f = atlas.textures[0]!.frames[0]!;
    expect(f.filename).toBe('prop_pump');
    expect(f.sourceSize).toEqual({ w: cell, h: cell });
    // 176 of 192 display px: the pivot fraction is the same whatever the factor.
    expect(f.pivot).toEqual({ x: 0.5, y: Math.round((176 / 192) * 10000) / 10000 });
    expect(atlas.textures[0]!.size.w).toBeLessThanOrEqual(1024 * TEXELS);
    await expect(hdStatic(dir, false)).rejects.toThrow(/missing/);
  });
});

describe('hd webp pages', () => {
  it('re-encodes every PNG page as WebP, points the atlas at it and passes other files through', () => {
    const atlas = {
      textures: [{ image: 'props-0.png', format: 'RGBA8888', size: { w: 8, h: 4 }, scale: 1, frames: [] }],
    };
    const anims = Buffer.from('{"anims":[]}\n');
    const out = webpPages(
      new Map([
        ['props-0.png', encodePng(solid(8, 4, [200, 40, 40]))],
        ['props.json', Buffer.from(JSON.stringify(atlas))],
        ['vfx.anims.json', anims],
      ]),
    );
    expect([...out.keys()].sort()).toEqual(['props-0.webp', 'props.json', 'vfx.anims.json']);
    expect(imageSize(out.get('props-0.webp')!)).toEqual({ width: 8, height: 4 });
    const json = JSON.parse(out.get('props.json')!.toString('utf8')) as MultiAtlas;
    expect(json.textures.map((t) => t.image)).toEqual(['props-0.webp']);
    expect(out.get('vfx.anims.json')).toBe(anims);
  });
});

describe('hd withTexels', () => {
  it("writes the factor into the atlas json's meta and leaves the pages alone", () => {
    const page = Buffer.from('page');
    const out = withTexels(
      new Map([
        ['bld_x-0.png', page],
        ['bld_x.json', Buffer.from(JSON.stringify({ textures: [], meta: { app: 'p', version: '1' } }))],
      ]),
      'bld_x',
      2,
    );
    expect(out.get('bld_x-0.png')).toBe(page);
    expect(JSON.parse(out.get('bld_x.json')!.toString('utf8')).meta).toEqual({
      app: 'p',
      version: '1',
      texels: 2,
    });
    expect(() => withTexels(new Map(), 'bld_x', 2)).toThrow(/no bld_x.json/);
  });
});
