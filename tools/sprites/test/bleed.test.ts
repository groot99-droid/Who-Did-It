import { createCanvas, loadImage } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { alphaBleed, bleed, decodePng, encodePng, encodeWebp } from '../bleed.ts';
import { imageSize } from './realAssets.ts';

describe('bleed', () => {
  it('decodes what canvas encodes and round-trips through its own encoder', () => {
    const c = createCanvas(5, 4);
    const g = c.getContext('2d');
    g.fillStyle = '#12141C';
    g.fillRect(1, 1, 2, 2);
    const img = decodePng(c.toBuffer('image/png'));
    expect([img.width, img.height]).toEqual([5, 4]);
    expect([...img.data.subarray((1 * 5 + 1) * 4, (1 * 5 + 1) * 4 + 4)]).toEqual([0x12, 0x14, 0x1c, 255]);
    expect(decodePng(encodePng(img)).data).toEqual(img.data);
  });

  it('colours transparent neighbours, keeps their alpha at 0 and leaves the sprite unchanged', () => {
    const data = new Uint8Array(5 * 5 * 4);
    data.set([200, 100, 50, 255], (2 * 5 + 2) * 4);
    const out = bleed({ width: 5, height: 5, data }, 1);
    expect([...out.data.subarray((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 4)]).toEqual([200, 100, 50, 255]);
    expect([...out.data.subarray((1 * 5 + 1) * 4, (1 * 5 + 1) * 4 + 4)]).toEqual([200, 100, 50, 0]);
    // one ring deep only
    expect([...out.data.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    const two = bleed({ width: 5, height: 5, data }, 2);
    expect([...two.data.subarray(0, 4)]).toEqual([200, 100, 50, 0]);
  });

  it('round-trips every PNG filter and picks per row with byte-stable output', () => {
    // Noise, flat runs, a vertical gradient and a repeated row: rows that favour different filters.
    const w = 24;
    const h = 8;
    const data = new Uint8Array(w * h * 4);
    let seed = 7;
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const y = Math.floor(i / 4 / w);
      data[i] = y < 2 ? seed & 0xff : y < 4 ? 90 : y < 6 ? (i % (w * 4)) & 0xff : data[i - w * 4]!;
    }
    const img = { width: w, height: h, data };
    for (const f of [0, 1, 2, 3, 4] as const) {
      const png = encodePng(img, f);
      expect(decodePng(png).data, `filter ${f}`).toEqual(data);
    }
    const adaptive = encodePng(img);
    expect(decodePng(adaptive).data).toEqual(data);
    expect(adaptive.equals(encodePng(img))).toBe(true);
    expect(adaptive.length).toBeLessThanOrEqual(
      Math.min(...[0, 1, 2, 3, 4].map((f) => encodePng(img, f as 0).length)),
    );
  });

  it('is deterministic', () => {
    const c = createCanvas(16, 16);
    const g = c.getContext('2d');
    g.fillStyle = '#B3121F';
    g.fillRect(4, 4, 6, 7);
    const png = c.toBuffer('image/png');
    expect(alphaBleed(png).equals(alphaBleed(png))).toBe(true);
  });
});

describe('encodeWebp', () => {
  // A 64 x 32 sprite: an opaque gradient block, a half-alpha band and a clear border.
  const img = { width: 64, height: 32, data: new Uint8Array(64 * 32 * 4) };
  for (let y = 4; y < 28; y++) {
    for (let x = 4; x < 60; x++) img.data.set([x * 4, y * 8, 120, x < 50 ? 255 : 128], (y * 64 + x) * 4);
  }

  it('writes a lossy WebP with alpha that decodes to the same picture', async () => {
    const webp = encodeWebp(img, 90);
    expect(webp.toString('ascii', 0, 4)).toBe('RIFF');
    expect(webp.toString('ascii', 8, 12)).toBe('WEBP');
    expect(imageSize(webp)).toEqual({ width: 64, height: 32 });
    const back = await loadImage(webp);
    const g = createCanvas(64, 32).getContext('2d');
    g.drawImage(back, 0, 0);
    const px = (x: number, y: number) => [...g.getImageData(x, y, 1, 1).data];
    expect(px(0, 0)[3]).toBe(0);
    expect(px(20, 16)[3]).toBe(255);
    expect(Math.abs(px(55, 16)[3]! - 128)).toBeLessThanOrEqual(2);
    const [r, gr, b] = px(20, 16);
    expect(Math.abs(r! - 80) + Math.abs(gr! - 128) + Math.abs(b! - 120)).toBeLessThan(24);
  });

  it('is smaller at a lower quality and deterministic at one quality', () => {
    expect(encodeWebp(img, 90).equals(encodeWebp(img, 90))).toBe(true);
    expect(encodeWebp(img, 40).length).toBeLessThan(encodeWebp(img, 90).length);
  });
});
