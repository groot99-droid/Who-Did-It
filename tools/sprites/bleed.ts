// Alpha bleed (docs/ASSETS.md 6.3): give fully transparent pixels next to the sprite the colour of
// their opaque neighbours, alpha left at 0, so linear filtering at the edge never mixes in the black
// RGB a renderer stores under transparency (the "ink halo"). Canvas libraries premultiply and would
// zero that RGB again, so this file reads and writes 8-bit RGBA PNGs itself through node:zlib.
import { deflateSync, inflateSync } from 'node:zlib';
import { createCanvas, ImageData } from '@napi-rs/canvas';

export interface Rgba {
  width: number;
  height: number;
  /** Straight (not premultiplied) RGBA, row-major. */
  data: Uint8Array;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decode a non-interlaced 8-bit RGB or RGBA PNG (what Blender and the packer write). */
export function decodePng(png: Buffer): Rgba {
  if (!png.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let off = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat: Buffer[] = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString('latin1', off + 4, off + 8);
    const body = png.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [depth, colour, , , interlace] = [body[8], body[9], body[10], body[11], body[12]];
      if (depth !== 8 || interlace !== 0 || (colour !== 6 && colour !== 2)) {
        throw new Error(`unsupported PNG (depth ${depth}, colour type ${colour}, interlace ${interlace})`);
      }
      channels = colour === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rows = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? rows[y * stride + x - channels]! : 0;
      const b = y > 0 ? rows[(y - 1) * stride + x]! : 0;
      const c = x >= channels && y > 0 ? rows[(y - 1) * stride + x - channels]! : 0;
      const v = raw[src + x]!;
      const pred =
        filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
      rows[y * stride + x] = (v + pred) & 0xff;
    }
  }
  if (channels === 4) return { width, height, data: rows };
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.set(rows.subarray(i * 3, i * 3 + 3), i * 4);
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/** The five PNG row filters (None, Sub, Up, Average, Paeth). */
export type PngFilter = 0 | 1 | 2 | 3 | 4;

/** One row filtered with `filter`, written at `out[at..at + stride)`; returns the sum of absolute residuals. */
function filterRow(
  data: Uint8Array,
  stride: number,
  y: number,
  filter: PngFilter,
  out: Buffer,
  at: number,
): number {
  let sum = 0;
  for (let x = 0; x < stride; x++) {
    const a = x >= 4 ? data[y * stride + x - 4]! : 0;
    const b = y > 0 ? data[(y - 1) * stride + x]! : 0;
    const c = x >= 4 && y > 0 ? data[(y - 1) * stride + x - 4]! : 0;
    const pred =
      filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
    const v = (data[y * stride + x]! - pred) & 0xff;
    out[at + x] = v;
    sum += v < 128 ? v : 256 - v;
  }
  return sum;
}

/**
 * Encode straight RGBA as an 8-bit PNG: each row takes the filter with the smallest sum of absolute residuals
 * (the standard heuristic, round 8), or `filter` for every row when given; deterministic zlib level 9.
 */
export function encodePng(img: Rgba, filter?: PngFilter): Buffer {
  const { width, height, data } = img;
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  const trial = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const at = y * (stride + 1) + 1;
    if (filter !== undefined) {
      raw[at - 1] = filter;
      filterRow(data, stride, y, filter, raw, at);
      continue;
    }
    let best = Number.POSITIVE_INFINITY;
    for (const f of [0, 1, 2, 3, 4] as const) {
      const sum = filterRow(data, stride, y, f, trial, 0);
      if (sum < best) {
        best = sum;
        raw[at - 1] = f;
        trial.copy(raw, at, 0, stride);
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Spread edge colours into transparent pixels, `passes` rings deep. Each transparent pixel takes the
 * mean RGB of its coloured 8-neighbours; alpha is untouched, so the sprite itself does not change.
 */
export function bleed(img: Rgba, passes = 2): Rgba {
  const { width: w, height: h } = img;
  const data = new Uint8Array(img.data);
  const done = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) done[i] = data[i * 4 + 3]! > 0 ? 1 : 0;
  for (let p = 0; p < passes; p++) {
    const next: [number, number, number, number][] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (done[y * w + x]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h && done[ny * w + nx]) {
              const j = (ny * w + nx) * 4;
              r += data[j]!;
              g += data[j + 1]!;
              b += data[j + 2]!;
              n++;
            }
          }
        }
        if (n) next.push([y * w + x, Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
      }
    }
    if (next.length === 0) break;
    for (const [i, r, g, b] of next) {
      data.set([r, g, b], i * 4);
      done[i] = 1;
    }
  }
  return { width: w, height: h, data };
}

/** Decode, bleed and re-encode one PNG. */
export function alphaBleed(png: Buffer, passes = 2): Buffer {
  return encodePng(bleed(decodePng(png), passes));
}

/**
 * Encode straight RGBA as a lossy WebP at `quality` (0-100), the HD world pages' format (DECISIONS A164, the
 * budget's option 1). The canvas premultiplies, so the colour under fully transparent pixels is lost; that is
 * safe because the client uploads every texture premultiplied (Phaser's default `pma`), where such a pixel
 * weighs nothing under linear filtering. Partial alpha keeps its bled colour.
 */
export function encodeWebp(img: Rgba, quality = 90): Buffer {
  const canvas = createCanvas(img.width, img.height);
  const pixels = new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  canvas.getContext('2d').putImageData(new ImageData(pixels, img.width, img.height), 0, 0);
  return canvas.encodeSync('webp', quality);
}
