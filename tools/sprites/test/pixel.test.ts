import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { decodePng, encodePng, type Rgba } from '../bleed.ts';
import { hexToRgb } from '../oklab.ts';
import {
  audit,
  boxHalve,
  boxResize,
  cleanCutout,
  cutAlpha,
  encodeWebp,
  finishDisplay,
  finishFolder,
  finishIllustration,
  finishRender,
  halveManifest,
  modeHalve,
  outline,
  snap,
  upscaleNearest,
  worldPalette,
} from '../pixel.ts';

const INK = '#12141C';
const BONE = '#D9D2C2';

/** An image from rows of cells: a hex colour (opaque), '.' (transparent) or [hex, alpha]. */
function img(rows: Array<Array<string | [string, number]>>): Rgba {
  const height = rows.length;
  const width = rows[0]!.length;
  const data = new Uint8Array(width * height * 4);
  rows.forEach((row, y) =>
    row.forEach((cell, x) => {
      if (cell === '.') return;
      const [hex, a] = typeof cell === 'string' ? [cell, 255] : cell;
      data.set([...hexToRgb(hex), a], (y * width + x) * 4);
    }),
  );
  return { width, height, data };
}
const px = (im: Rgba, x: number, y: number) => [
  ...im.data.subarray((y * im.width + x) * 4, (y * im.width + x) * 4 + 4),
];
const rgba = (hex: string, a = 255) => [...hexToRgb(hex), a];

/** A deterministic noisy figure on transparency: a disc with a one-pixel dark rim, colours off the palette. */
function noisyFigure(w: number, h: number): Rgba {
  const data = new Uint8Array(w * h * 4);
  let s = 12345;
  const rnd = () => (s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - w / 2, y - h / 2);
      const i = (y * w + x) * 4;
      if (d < w / 3) data.set([150 + rnd() * 60, 90 + rnd() * 40, 60 + rnd() * 30, 255], i);
      else if (d < w / 3 + 1.5) data.set([20, 22, 30, 180 + Math.floor(rnd() * 75)], i);
    }
  }
  return { width: w, height: h, data };
}

describe('the world palette', () => {
  it('has 64 colours, holds ink and leaves magenta out', () => {
    const p = worldPalette();
    expect(p).toHaveLength(64);
    expect(new Set(p).size).toBe(64);
    expect(p).toContain(INK);
    expect(p).not.toContain('#E04E9A');
  });
});

describe('snap', () => {
  it('cuts alpha at 0.5 and clears transparent pixels', () => {
    const out = cutAlpha(
      img([
        [
          ['#336699', 127],
          ['#336699', 128],
          ['#336699', 255],
        ],
      ]),
    );
    expect(px(out, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(out, 1, 0)[3]).toBe(255);
    expect(px(out, 2, 0)[3]).toBe(255);
  });

  it('moves every opaque pixel to its nearest world colour and keeps palette colours', () => {
    const out = snap(img([['#13151D', INK, BONE, '#FF00FF', '.']]));
    expect(px(out, 0, 0)).toEqual(rgba(INK));
    expect(px(out, 1, 0)).toEqual(rgba(INK));
    expect(px(out, 2, 0)).toEqual(rgba(BONE));
    expect(audit(out)).toMatchObject({ offPalette: 0, partialAlpha: 0 });
  });
});

describe('modeHalve', () => {
  it('needs 2 of 4 opaque, takes the most frequent colour, and breaks a tie to the darkest', () => {
    const out = modeHalve(
      img([
        [INK, '.', INK, BONE, BONE, BONE],
        ['.', '.', BONE, INK, BONE, INK],
      ]),
    );
    expect([out.width, out.height]).toEqual([3, 1]);
    expect(px(out, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(out, 1, 0)).toEqual(rgba(INK));
    expect(px(out, 2, 0)).toEqual(rgba(BONE));
  });

  it('keeps a one-pixel outline', () => {
    const rows = Array.from({ length: 4 }, () => [INK, BONE, BONE, BONE]);
    const out = modeHalve(img(rows));
    expect(px(out, 0, 0)).toEqual(rgba(INK));
    expect(px(out, 0, 1)).toEqual(rgba(INK));
    expect(px(out, 1, 0)).toEqual(rgba(BONE));
  });

  it('refuses odd sizes and unsnapped input', () => {
    expect(() => modeHalve(img([[INK, INK, INK]]))).toThrow(/not even/);
    expect(() =>
      modeHalve(
        img([
          ['#123456', INK],
          [INK, INK],
        ]),
      ),
    ).toThrow(/not snapped/);
  });
});

describe('box resizing', () => {
  it('averages with alpha weighting and keeps partial alpha', () => {
    const out = boxHalve(
      img([
        [['#FF0000', 255], '.'],
        ['.', '.'],
      ]),
    );
    expect(px(out, 0, 0)).toEqual([255, 0, 0, 64]);
  });

  it('downscales by any ratio and refuses to enlarge', () => {
    const flat = img(Array.from({ length: 3 }, () => ['#808080', '#808080', '#808080']));
    expect(px(boxResize(flat, 2, 2), 1, 1)).toEqual([128, 128, 128, 255]);
    expect(() => boxResize(flat, 4, 4)).toThrow(/not a downscale/);
  });

  it('enlarges by nearest neighbour', () => {
    const out = upscaleNearest(img([[INK, BONE]]), 2);
    expect([out.width, out.height]).toEqual([4, 2]);
    expect(px(out, 1, 1)).toEqual(rgba(INK));
    expect(px(out, 2, 0)).toEqual(rgba(BONE));
  });
});

describe('finishRender and finishDisplay', () => {
  const raw = noisyFigure(64, 64);

  it('on: half size, every pixel a world colour, alpha 0 or 255', () => {
    const out = finishRender(raw, true);
    expect([out.width, out.height]).toEqual([32, 32]);
    expect(audit(out)).toMatchObject({ offPalette: 0, partialAlpha: 0 });
  });

  it('off: half size, partial alpha kept, transparent neighbours bled', () => {
    const out = finishRender(raw, false);
    expect([out.width, out.height]).toEqual([32, 32]);
    expect(audit(out).partialAlpha).toBeGreaterThan(0);
    const bledCorner = out.data.findIndex((v, i) => i % 4 === 3 && v === 0 && out.data[i - 1]! > 0);
    expect(bledCorner).toBeGreaterThan(0);
  });

  it('keeps a display page at its size both ways, snapped when on', () => {
    for (const on of [true, false]) {
      const out = finishDisplay(raw, on);
      expect([out.width, out.height]).toEqual([64, 64]);
      if (on) expect(audit(out)).toMatchObject({ offPalette: 0, partialAlpha: 0 });
    }
  });

  it('is deterministic', () => {
    expect(encodePng(finishRender(raw, true)).equals(encodePng(finishRender(raw, true)))).toBe(true);
    expect(encodePng(finishRender(raw, false)).equals(encodePng(finishRender(raw, false)))).toBe(true);
  });
});

describe('cutouts', () => {
  it('keys out the background and re-colours spill on the edge from the interior', () => {
    const M = '#FF00FF';
    const SPILL = '#C040B0';
    const BODY = '#94603F';
    const out = cleanCutout(
      img([
        [M, M, M, M, M, M],
        [M, SPILL, BODY, BODY, BODY, M],
        [M, BODY, BODY, BODY, BODY, M],
        [M, BODY, BODY, BODY, BODY, M],
        [M, M, M, M, M, M],
      ]),
      M,
    );
    expect(px(out, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(out, 1, 1)).toEqual(rgba(BODY));
    expect(px(out, 2, 2)).toEqual(rgba(BODY));
  });

  it('draws a one-pixel ink outline on transparent pixels beside the subject, not on diagonals', () => {
    const out = outline(
      img([
        ['.', '.', '.'],
        ['.', BONE, '.'],
        ['.', '.', '.'],
      ]),
    );
    expect(px(out, 1, 0)).toEqual(rgba(INK));
    expect(px(out, 0, 1)).toEqual(rgba(INK));
    expect(px(out, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(px(out, 1, 1)).toEqual(rgba(BONE));
  });

  it('finishes an illustration to its art grid, centre-cropped to the aspect, outlined when asked', () => {
    const src = noisyFigure(96, 64);
    const out = finishIllustration(src, 16, 16, { outline: true });
    expect([out.width, out.height]).toEqual([16, 16]);
    expect(audit(out)).toMatchObject({ offPalette: 0, partialAlpha: 0 });
    expect(px(out, 0, 0)).toEqual([0, 0, 0, 0]);
    const boxed = finishIllustration(src, 8, 4, { crop: [0, 0, 64, 32] });
    expect([boxed.width, boxed.height]).toEqual([8, 4]);
  });
});

describe('WebP', () => {
  it('is lossless at webpQuality 100', async () => {
    const finished = finishRender(noisyFigure(64, 64), true);
    const decoded = await loadImage(await encodeWebp(finished));
    const c = createCanvas(decoded.width, decoded.height);
    const g = c.getContext('2d');
    g.drawImage(decoded, 0, 0);
    const back = g.getImageData(0, 0, decoded.width, decoded.height).data;
    for (let i = 0; i < finished.data.length; i += 4) {
      if (finished.data[i + 3] === 0) expect(back[i + 3]).toBe(0);
      else expect([...back.subarray(i, i + 4)]).toEqual([...finished.data.subarray(i, i + 4)]);
    }
  });
});

describe('render folders', () => {
  it('halves cell, feet and pivot values and nothing else', () => {
    expect(
      halveManifest({
        version: 1,
        fps: 12,
        cell: 128,
        frames: { a: { feet: [64, 112], cell: 256, clipped: true } },
      }),
    ).toEqual({ version: 1, fps: 12, cell: 64, frames: { a: { feet: [32, 56], cell: 128, clipped: true } } });
    expect(halveManifest({ frames: { p: { file: 'p.png', cell: 128, pivot: [64, 100] } } })).toEqual({
      frames: { p: { file: 'p.png', cell: 64, pivot: [32, 50] } },
    });
  });

  it('finishes every PNG of a folder and halves its manifest, or keeps both sizes for display pages', () => {
    const raw = mkdtempSync(join(tmpdir(), 'wdi-pixel-raw-'));
    mkdirSync(join(raw, 'body'));
    writeFileSync(join(raw, 'body', 'f.png'), encodePng(noisyFigure(64, 64)));
    writeFileSync(
      join(raw, 'manifest.json'),
      JSON.stringify({ cell: 64, frames: { f: { feet: [32, 56] } } }),
    );
    const out = mkdtempSync(join(tmpdir(), 'wdi-pixel-out-'));
    expect(finishFolder(raw, out, { on: true })).toEqual(['body/f.png', 'manifest.json']);
    expect(decodePng(readFileSync(join(out, 'body', 'f.png'))).width).toBe(32);
    expect(JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'))).toEqual({
      cell: 32,
      frames: { f: { feet: [16, 28] } },
    });
    const disp = mkdtempSync(join(tmpdir(), 'wdi-pixel-disp-'));
    finishFolder(raw, disp, { on: true, display: true });
    expect(decodePng(readFileSync(join(disp, 'body', 'f.png'))).width).toBe(64);
    expect(JSON.parse(readFileSync(join(disp, 'manifest.json'), 'utf8')).cell).toBe(64);
  });
});
