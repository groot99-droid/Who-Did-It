// Joins the ground cells of tools/blender/build_ground.py into an isometric ground tileset
// (docs/SPRITES.md 10.12, art plan 3.2): ten columns of 128 x 64 cells, 1280 x 1792 in all. Material m (its
// index in GROUND_ROWS) owns rows 2m and 2m + 1: cells 0-3 are its base variants, cell 3 + k its edge
// overlay with side mask k (world frame: north 1, east 2, south 4, west 8), cell 19 is empty.
//
// With the pixel finish on, each render is snapped and mode-halved to a 64 x 32 art diamond, masked and
// doubled with nearest scaling; with it off, the display-scale render is masked and alpha-bled. An edge
// overlay is base variant 0 under a seeded noise mask that covers the sides in k and reaches about 30% into
// the diamond, with a one-art-pixel rim one ramp step darker. Everything is deterministic.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bleed, decodePng, encodePng, type Rgba } from './bleed.ts';
import { finishEnabled, paletteFile } from './palette.ts';
import { modeHalve, snap, upscaleNearest } from './pixel.ts';

/** packages/content/src/schemas/scene.ts GROUND_ROWS, and the render file name of each material. */
export const GROUND_ROWS = 'glmpdcfwrs~u=O';
export const GROUND_NAMES: Readonly<Record<string, string>> = {
  g: 'grass',
  l: 'litter',
  m: 'moss',
  p: 'path',
  d: 'earth',
  c: 'cobble',
  f: 'flags',
  w: 'planks',
  r: 'rock',
  s: 'shingle',
  '~': 'shallows',
  u: 'brush',
  '=': 'rails',
  O: 'water',
};
/** Map theme of each tileset key (SPRITES 10.13). */
export const GROUND_THEMES = ['harbour', 'timber'] as const;

export const CELL_W = 128;
export const CELL_H = 64;
export const COLUMNS = 10;
export const VARIANTS = 4;
export const SHEET_W = CELL_W * COLUMNS;
export const SHEET_H = CELL_H * 2 * GROUND_ROWS.length;
/** How far an edge overlay reaches into the diamond, as a fraction of the tile (art plan 3.2). */
export const EDGE_REACH = 0.3;

const blank = (w: number, h: number): Rgba => ({ width: w, height: h, data: new Uint8Array(w * h * 4) });

/**
 * Tile coordinates (u east, v south, 0..1) of pixel (x, y) in a w x h diamond cell whose top vertex is
 * at (w / 2, 0): the inverse of the projection of SPRITES 10.2 at that cell size.
 */
export function cellUv(x: number, y: number, w: number, h: number): [number, number] {
  const sx = (x + 0.5 - w / 2) / (w / 2);
  const sy = (y + 0.5) / (h / 2);
  return [(sx + sy) / 2, (sy - sx) / 2];
}

/** Whether the pixel's centre lies in the cell's diamond. */
export function inDiamond(x: number, y: number, w: number, h: number): boolean {
  const [u, v] = cellUv(x, y, w, h);
  return u >= 0 && u <= 1 && v >= 0 && v <= 1;
}

/** Clears every pixel outside the diamond. */
export function maskDiamond(img: Rgba): Rgba {
  const out: Rgba = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!inDiamond(x, y, img.width, img.height))
        out.data.fill(0, (y * img.width + x) * 4, (y * img.width + x + 1) * 4);
    }
  }
  return out;
}

/** Periodic noise in 0..1 along an edge (t in 0..1, equal at both ends so neighbouring tiles chain). */
export function edgeNoise(side: number, t: number): number {
  const phase = side * 1.7;
  return (
    0.5 +
    0.25 * Math.sin(2 * Math.PI * 2 * t + phase) +
    0.15 * Math.sin(2 * Math.PI * 5 * t + 2 * phase) +
    0.1 * Math.sin(2 * Math.PI * 9 * t + 3 * phase)
  );
}

/** Whether tile point (u, v) lies under the fringe of side mask k (north 1, east 2, south 4, west 8). */
export function underFringe(k: number, u: number, v: number): boolean {
  const sides: Array<[number, number, number]> = [
    [1, v, u], // north: the v = 0 edge, along u
    [2, 1 - u, v], // east
    [4, 1 - v, u], // south
    [8, u, v], // west
  ];
  return sides.some(([bit, d, t]) => (k & bit) !== 0 && d < EDGE_REACH * (0.55 + 0.9 * edgeNoise(bit, t)));
}

// One ramp step darker (palette.json `world.ramps`): the first ramp holding the colour, one index down.
const DARKER = (() => {
  const m = new Map<number, number>();
  for (const ramp of Object.values(paletteFile.world.ramps)) {
    ramp.forEach((hex, i) => {
      const key = parseInt(hex.slice(1), 16);
      if (!m.has(key)) m.set(key, parseInt(ramp[Math.max(0, i - 1)]!.slice(1), 16));
    });
  }
  return m;
})();

function darken(data: Uint8Array, o: number, finished: boolean): void {
  if (finished) {
    const key = (data[o]! << 16) | (data[o + 1]! << 8) | data[o + 2]!;
    const d = DARKER.get(key);
    if (d === undefined) return;
    data[o] = d >> 16;
    data[o + 1] = (d >> 8) & 255;
    data[o + 2] = d & 255;
  } else {
    for (let c = 0; c < 3; c++) data[o + c] = Math.round(data[o + c]! * 0.78);
  }
}

/** The edge overlay with side mask k from a masked base cell (finished: art px, a ramp-step rim). */
export function edgeOverlay(base: Rgba, k: number, finished: boolean, rim = 1): Rgba {
  const { width: w, height: h } = base;
  const out = blank(w, h);
  const covered = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h || !inDiamond(x, y, w, h)) return true;
    const [u, v] = cellUv(x, y, w, h);
    return underFringe(k, u, v);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inDiamond(x, y, w, h) || !covered(x, y)) continue;
      const o = (y * w + x) * 4;
      out.data.set(base.data.subarray(o, o + 4), o);
      let edge = false;
      for (let r = 1; r <= rim && !edge; r++) {
        edge = !covered(x + r, y) || !covered(x - r, y) || !covered(x, y + r) || !covered(x, y - r);
      }
      if (edge) darken(out.data, o, finished);
    }
  }
  return out;
}

/** The base cell from a 128 x 64 render: finished (art diamond, doubled) or the masked display render. */
export function baseCell(render: Rgba, on: boolean): { art: Rgba; cell: Rgba } {
  if (render.width !== CELL_W || render.height !== CELL_H) {
    throw new Error(`tileset: a ground render is ${render.width}x${render.height}, want ${CELL_W}x${CELL_H}`);
  }
  const opaque: Rgba = { width: render.width, height: render.height, data: new Uint8Array(render.data) };
  for (let i = 3; i < opaque.data.length; i += 4) opaque.data[i] = 255;
  if (on) {
    const art = maskDiamond(modeHalve(snap(opaque)));
    return { art, cell: upscaleNearest(art, 2) };
  }
  const masked = maskDiamond(opaque);
  return { art: masked, cell: bleed(masked) };
}

function blit(sheet: Rgba, cell: Rgba, col: number, row: number): void {
  for (let y = 0; y < cell.height; y++) {
    sheet.data.set(
      cell.data.subarray(y * cell.width * 4, (y + 1) * cell.width * 4),
      ((row * CELL_H + y) * sheet.width + col * CELL_W) * 4,
    );
  }
}

/**
 * The tileset from `renders(char, v)` (each a 128 x 64 render of material `char`, variant v).
 * Cell c of material m sits at column c mod 10, row 2m + floor(c / 10).
 */
export function buildTileset(
  renders: (char: string, v: number) => Rgba,
  on: boolean = finishEnabled('main'),
): Rgba {
  const sheet = blank(SHEET_W, SHEET_H);
  [...GROUND_ROWS].forEach((char, m) => {
    const place = (c: number, cell: Rgba) => blit(sheet, cell, c % COLUMNS, 2 * m + Math.floor(c / COLUMNS));
    let first: Rgba | null = null;
    for (let v = 0; v < VARIANTS; v++) {
      const { art, cell } = baseCell(renders(char, v), on);
      first ??= art;
      place(v, cell);
    }
    for (let k = 1; k <= 15; k++) {
      const ov = on
        ? upscaleNearest(edgeOverlay(first!, k, true), 2)
        : bleed(edgeOverlay(first!, k, false, 2));
      place(3 + k, ov);
    }
  });
  return sheet;
}

/** gid of material char's cell c in a map whose ground tileset has firstgid 1 (SPRITES 10.12). */
export function gidOf(char: string, cell: number): number {
  const m = GROUND_ROWS.indexOf(char);
  if (m < 0 || cell < 0 || cell > 19) throw new Error(`tileset: no cell ${cell} of '${char}'`);
  return 1 + 20 * m + cell;
}

// CLI: tsx tileset.ts <render dir, e.g. build/render/ground> <out dir> [--finish on|off]
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const fi = args.indexOf('--finish');
  const on = fi >= 0 ? args[fi + 1] === 'on' : finishEnabled('main');
  const [renderDir, outDir] = fi < 0 ? args : args.filter((_, i) => i !== fi && i !== fi + 1);
  if (!renderDir || !outDir) {
    console.error('usage: tsx tileset.ts <render dir> <out dir> [--finish on|off]');
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });
  for (const theme of GROUND_THEMES) {
    const sheet = buildTileset(
      (char, v) => decodePng(readFileSync(join(renderDir, theme, `${GROUND_NAMES[char]}_${v}.png`))),
      on,
    );
    const file = join(outDir, `iso_ground_${theme}.png`);
    writeFileSync(file, encodePng(sheet));
    console.log(`tileset: ${file} (${on ? 'finish on' : 'finish off'})`);
  }
}
