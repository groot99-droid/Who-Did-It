// The pixel finish (docs/ASSETS.md 6.11): every rendered or generated image passes through here before
// it is packed or shipped. Settings are style.json `pixel` and `pixelFinish`, the palette is
// palette.json `world`. Deterministic: unchanged inputs give byte-identical outputs.
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { bleed, decodePng, encodePng, type Rgba } from './bleed.ts';
import { dist2, hexToRgb, hueSat, oklab } from './oklab.ts';
import {
  DARK_RANK,
  SATURATED,
  WORLD,
  finishEnabled,
  indexOfRgb,
  nearestIndex,
  outlineRgb,
  pixelSettings,
  styleFile,
  worldPalette,
} from './palette.ts';

export type { Rgba } from './bleed.ts';
export { finishEnabled, worldPalette };

const blank = (width: number, height: number): Rgba => ({
  width,
  height,
  data: new Uint8Array(width * height * 4),
});

/** Alpha at or above `pixel.alphaCut` becomes 255, below it 0 (transparent pixels become 0,0,0,0). */
export function cutAlpha(img: Rgba): Rgba {
  const out = blank(img.width, img.height);
  const cut = pixelSettings.alphaCut * 255;
  for (let i = 0; i < img.width * img.height; i++) {
    if (img.data[i * 4 + 3]! >= cut) {
      out.data.set(img.data.subarray(i * 4, i * 4 + 3), i * 4);
      out.data[i * 4 + 3] = 255;
    }
  }
  return out;
}

/** Alpha cut, then every opaque pixel to the nearest world colour in OKLab. */
export function snap(img: Rgba): Rgba {
  const out = cutAlpha(img);
  const d = out.data;
  for (let i = 0; i < img.width * img.height; i++) {
    if (d[i * 4 + 3] === 0) continue;
    const c = WORLD[nearestIndex(d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!)]!;
    d.set(c.rgb, i * 4);
  }
  return out;
}

function assertEven(img: Rgba, what: string): void {
  if (img.width % 2 || img.height % 2) throw new Error(`${what}: ${img.width}x${img.height} is not even`);
}

/**
 * 2 x 2 mode downscale of a snapped image. A packed pixel is opaque when at least 2 of its 4 source
 * pixels are; its colour is the most frequent of them, and a tie goes to the darkest (OKLab L), so
 * one-pixel outlines and creases survive.
 */
export function modeHalve(img: Rgba): Rgba {
  assertEven(img, 'modeHalve');
  const w = img.width / 2;
  const h = img.height / 2;
  const out = blank(w, h);
  const idx: number[] = [];
  const count: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      idx.length = 0;
      count.length = 0;
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        const j = ((2 * y + dy) * img.width + 2 * x + dx) * 4;
        if (img.data[j + 3] !== 255) continue;
        const k = indexOfRgb(img.data[j]!, img.data[j + 1]!, img.data[j + 2]!);
        if (k < 0) throw new Error('modeHalve: input is not snapped to the world palette');
        const at = idx.indexOf(k);
        if (at < 0) {
          idx.push(k);
          count.push(1);
        } else count[at]!++;
      }
      const opaque = count.reduce((s, n) => s + n, 0);
      if (opaque < 2) continue;
      let best = 0;
      for (let n = 1; n < idx.length; n++) {
        if (
          count[n]! > count[best]! ||
          (count[n] === count[best] && DARK_RANK[idx[n]!]! < DARK_RANK[idx[best]!]!)
        ) {
          best = n;
        }
      }
      const o = (y * w + x) * 4;
      out.data.set(WORLD[idx[best]!]!.rgb, o);
      out.data[o + 3] = 255;
    }
  }
  return out;
}

/** 2 x 2 box downscale, alpha-weighted, partial alpha kept: the render path with the finish off. */
export function boxHalve(img: Rgba): Rgba {
  assertEven(img, 'boxHalve');
  return boxResize(img, img.width / 2, img.height / 2);
}

/** Alpha-weighted (premultiplied) area-average downscale to w x h, any ratio. Never enlarges. */
export function boxResize(img: Rgba, w: number, h: number): Rgba {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > img.width || h > img.height) {
    throw new Error(`boxResize: ${img.width}x${img.height} -> ${w}x${h} is not a downscale`);
  }
  const out = blank(w, h);
  const sx = img.width / w;
  const sy = img.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = y * sy;
    const y1 = y0 + sy;
    for (let x = 0; x < w; x++) {
      const x0 = x * sx;
      const x1 = x0 + sx;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;
      for (let py = Math.floor(y0); py < Math.ceil(y1); py++) {
        const wy = Math.min(y1, py + 1) - Math.max(y0, py);
        for (let px = Math.floor(x0); px < Math.ceil(x1); px++) {
          const wgt = wy * (Math.min(x1, px + 1) - Math.max(x0, px));
          const j = (py * img.width + px) * 4;
          const al = img.data[j + 3]! * wgt;
          r += img.data[j]! * al;
          g += img.data[j + 1]! * al;
          b += img.data[j + 2]! * al;
          a += al;
          area += wgt;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) out.data.set([Math.round(r / a), Math.round(g / a), Math.round(b / a)], o);
      out.data[o + 3] = Math.round(a / area);
    }
  }
  return out;
}

/** Nearest-neighbour enlargement by an integer factor. */
export function upscaleNearest(img: Rgba, k: number): Rgba {
  if (!Number.isInteger(k) || k < 1) throw new Error(`upscaleNearest: factor ${k}`);
  const out = blank(img.width * k, img.height * k);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const j = (Math.floor(y / k) * img.width + Math.floor(x / k)) * 4;
      out.data.set(img.data.subarray(j, j + 4), (y * out.width + x) * 4);
    }
  }
  return out;
}

/**
 * A render (Blender, display scale) to a packed frame at half size. With the finish on: snap, then
 * mode-halve. Off (`pixelFinish.enabled.main` false): box-halve with partial alpha, then alpha-bleed for
 * linear filtering. Cells, pivots and packed sizes are the same either way.
 */
export function finishRender(img: Rgba, on: boolean = finishEnabled('main')): Rgba {
  return on ? modeHalve(snap(img)) : bleed(boxHalve(img));
}

/**
 * A render of a page drawn at display size (the ground cells, `clues`, `vfx`). On: finished at half size,
 * then doubled with nearest scaling. Off: the display-scale render, alpha-bled. The size never changes.
 */
export function finishDisplay(img: Rgba, on: boolean = finishEnabled('main')): Rgba {
  return on ? upscaleNearest(finishRender(img, true), 2) : bleed(img);
}

function isTransparentAt(img: Rgba, x: number, y: number): boolean {
  return x < 0 || y < 0 || x >= img.width || y >= img.height || img.data[(y * img.width + x) * 4 + 3] === 0;
}

/**
 * A background-removed cutout, before `finishIllustration`. First a chroma key clears every pixel within
 * `pixel.keyTolerance` (OKLab) of the key colour; that alone does the job when background removal failed.
 * Then spill cleanup: an edge pixel (one touching a cleared or transparent pixel) whose hue is within 30
 * degrees of the key's and whose saturation is over 0.3 takes the colour of its nearest interior pixel,
 * searched in rings up to 3 pixels away.
 */
export function cleanCutout(img: Rgba, keyHex: string): Rgba {
  const out: Rgba = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  const d = out.data;
  const [kr, kg, kb] = hexToRgb(keyHex);
  const keyLab = oklab(kr, kg, kb);
  const keyHue = hueSat(kr, kg, kb).hue;
  const tol2 = pixelSettings.keyTolerance ** 2;
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) {
    if (d[i * 4 + 3] === 0) continue;
    if (dist2(oklab(d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!), keyLab) <= tol2) d.fill(0, i * 4, i * 4 + 4);
  }
  const spill = (i: number): boolean => {
    const { hue, sat } = hueSat(d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!);
    const dh = Math.abs(hue - keyHue);
    return sat > 0.3 && Math.min(dh, 360 - dh) <= 30;
  };
  const isEdge = (x: number, y: number): boolean => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && isTransparentAt(out, x + dx, y + dy)) return true;
    return false;
  };
  const fixes: Array<[number, number]> = [];
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = y * img.width + x;
      if (d[i * 4 + 3] === 0 || !spill(i) || !isEdge(x, y)) continue;
      search: for (let r = 1; r <= 3; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (isTransparentAt(out, nx, ny) || isEdge(nx, ny)) continue;
            const j = ny * img.width + nx;
            if (spill(j)) continue;
            fixes.push([i, j]);
            break search;
          }
        }
      }
    }
  }
  for (const [i, j] of fixes) d.set(d.subarray(j * 4, j * 4 + 3), i * 4);
  return out;
}

/** A one-pixel outline of `pixel.cutoutOutline` (ink) on every transparent pixel 4-adjacent to the subject. */
export function outline(img: Rgba): Rgba {
  const out: Rgba = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  const ink = outlineRgb();
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!isTransparentAt(img, x, y)) continue;
      if (
        !isTransparentAt(img, x - 1, y) ||
        !isTransparentAt(img, x + 1, y) ||
        !isTransparentAt(img, x, y - 1) ||
        !isTransparentAt(img, x, y + 1)
      ) {
        out.data.set([...ink, 255], (y * img.width + x) * 4);
      }
    }
  }
  return out;
}

/** Crop to [x, y, w, h], or, without a box, centre-crop to the aspect aw:ah. */
export function crop(
  img: Rgba,
  box: readonly [number, number, number, number] | undefined,
  aw: number,
  ah: number,
): Rgba {
  let [x, y, w, h] = box ?? [0, 0, img.width, img.height];
  if (!box) {
    if (img.width * ah > img.height * aw) {
      w = Math.round((img.height * aw) / ah);
      x = Math.floor((img.width - w) / 2);
    } else {
      h = Math.round((img.width * ah) / aw);
      y = Math.floor((img.height - h) / 2);
    }
  }
  if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > img.width || y + h > img.height) {
    throw new Error(`crop: [${x}, ${y}, ${w}, ${h}] is outside ${img.width}x${img.height}`);
  }
  const out = blank(w, h);
  for (let row = 0; row < h; row++) {
    out.data.set(
      img.data.subarray(((y + row) * img.width + x) * 4, ((y + row) * img.width + x + w) * 4),
      row * w * 4,
    );
  }
  return out;
}

/**
 * A generated image (Higgsfield, 2k) to its art grid: crop (the box, or centre to the target aspect), box
 * downscale to w x h, snap; a cutout adds the one-pixel ink outline. Generated pixel art always takes the
 * finish, whatever `pixelFinish.enabled` says: the snap is what puts it on one grid and one palette.
 */
export function finishIllustration(
  img: Rgba,
  w: number,
  h: number,
  o: { crop?: readonly [number, number, number, number]; outline?: boolean } = {},
): Rgba {
  const snapped = snap(boxResize(crop(img, o.crop, w, h), w, h));
  return o.outline ? outline(snapped) : snapped;
}

/** Lossless WebP at `pixel.webpQuality` (100); a lossy quality (the finish off) may be passed. */
export async function encodeWebp(img: Rgba, quality: number = pixelSettings.webpQuality): Promise<Buffer> {
  const canvas = createCanvas(img.width, img.height);
  canvas
    .getContext('2d')
    .putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return canvas.encode('webp', quality);
}

export async function writeWebp(img: Rgba, file: string, quality?: number): Promise<void> {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, await encodeWebp(img, quality));
}

/** For tests: pixels off the world palette, pixels with partial alpha, and the opaque share in `world.saturated`. */
export function audit(img: Rgba): { offPalette: number; partialAlpha: number; saturatedShare: number } {
  let offPalette = 0;
  let partialAlpha = 0;
  let opaque = 0;
  let saturated = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    const a = img.data[i * 4 + 3]!;
    if (a === 0) continue;
    if (a !== 255) partialAlpha++;
    const [r, g, b] = [img.data[i * 4]!, img.data[i * 4 + 1]!, img.data[i * 4 + 2]!];
    if (indexOfRgb(r, g, b) < 0) offPalette++;
    opaque++;
    if (SATURATED.has((r << 16) | (g << 8) | b)) saturated++;
  }
  return { offPalette, partialAlpha, saturatedShare: opaque ? saturated / opaque : 0 };
}

const HALVED = new Set(['cell', 'feet', 'pivot']);

/** Halve every `cell`, `feet` and `pivot` value of a render manifest (batch_render.py or a static sheet). */
export function halveManifest(value: unknown, key = ''): unknown {
  if (typeof value === 'number') return HALVED.has(key) ? value / 2 : value;
  if (Array.isArray(value)) return value.map((v) => halveManifest(v, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, halveManifest(v, HALVED.has(key) ? key : k)]),
    );
  }
  return value;
}

function walk(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
}

/**
 * Finish a render folder: every PNG through `finishRender` (or `finishDisplay` with `display`), the
 * manifest's `cell`, `feet` and `pivot` halved (not for display pages), other files copied.
 */
export function finishFolder(
  rawDir: string,
  outDir: string,
  o: { display?: boolean; on?: boolean } = {},
): string[] {
  const on = o.on ?? finishEnabled('main');
  const written: string[] = [];
  for (const file of walk(rawDir)) {
    const rel = relative(rawDir, file);
    const dest = join(outDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    if (file.endsWith('.png')) {
      const img = decodePng(readFileSync(file));
      writeFileSync(dest, encodePng(o.display ? finishDisplay(img, on) : finishRender(img, on)));
    } else if (rel === 'manifest.json' && !o.display) {
      writeFileSync(
        dest,
        `${JSON.stringify(halveManifest(JSON.parse(readFileSync(file, 'utf8'))), null, 1)}\n`,
      );
    } else copyFileSync(file, dest);
    written.push(rel);
  }
  return written;
}

/** The lossy WebP quality of a mode's DOM images when its finish is off. */
export const offWebpQuality: number = styleFile.pixelFinish.offWebpQuality;

// CLI: tsx tools/sprites/pixel.ts <raw dir> <out dir> [--display] [--finish on|off]
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = args.indexOf('--finish');
  const finish = flag >= 0 ? args[flag + 1] : undefined;
  const display = args.includes('--display');
  const [rawDir, outDir] = args.filter((a, i) => !a.startsWith('--') && (flag < 0 || i !== flag + 1));
  if (!rawDir || !outDir || (finish !== undefined && finish !== 'on' && finish !== 'off')) {
    console.error('usage: tsx pixel.ts <raw dir> <out dir> [--display] [--finish on|off]');
    process.exit(2);
  }
  const on = finish === undefined ? finishEnabled('main') : finish === 'on';
  const files = finishFolder(rawDir, outDir, { display, on });
  console.log(
    `pixel: ${files.length} files, finish ${on ? 'on' : 'off'}${display ? ', display' : ''} -> ${outDir}`,
  );
}
