// Cuts building and multi-tile prop renders into one slice per footprint tile (docs/SPRITES.md 10.5, 10.13;
// art plan 3.4), after the pixel finish:
//
//   tsx slice.ts <render dir> <out dir> [--finish on|off]
//
// The render dir is tools/blender/build_buildings.py's: for each frame `<name>.png` (display px), its tile map
// `<name>.tiles.png` (raw R = dx + 1, G = dy + 1 of the footprint tile under each surface point) and a manifest
// entry with the canvas `cell`, the `pivot` (the footprint centre's ground point) and the `footprint` (w, h).
// The frame is finished to packed size (finishRender); each finished pixel goes to the slice of the tile
// most of its 2 x 2 source block stands over, or, at an anti-aliased edge the tile map does not cover, of the
// nearest coded pixel. Every slice `<name>#<dx>_<dy>` keeps the whole canvas, so after trimming the packer's
// `spriteSourceSize` still places it, and all slices share the pivot. Slices are written with a static-sheet
// manifest (merged into one already in the out dir), ready for pack-static.ts.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, type Rgba } from './bleed.ts';
import type { StaticManifest } from './pack-static.ts';
import { finishEnabled } from './palette.ts';
import { finishRender } from './pixel.ts';

export interface SliceSource {
  file: string;
  tiles: string;
  cell: [number, number];
  pivot: [number, number];
  footprint: [number, number];
}

/** Tile index (dy * 256 + dx, or -1) of each packed pixel, from the display-size tile map. */
export function tileIndex(tiles: Rgba, w: number, h: number): Int32Array {
  const code = (x: number, y: number) => {
    const o = (y * tiles.width + x) * 4;
    if (tiles.data[o + 3]! < 128 || tiles.data[o]! === 0 || tiles.data[o + 1]! === 0) return -1;
    return (tiles.data[o + 1]! - 1) * 256 + (tiles.data[o]! - 1);
  };
  const out = new Int32Array(w * h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const counts = new Map<number, number>();
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        const c = code(2 * x + dx, 2 * y + dy);
        if (c >= 0) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      let best = -1;
      let n = 0;
      for (const [c, k] of counts) if (k > n || (k === n && c < best)) [best, n] = [c, k];
      out[y * w + x] = best;
    }
  }
  return out;
}

/** The nearest coded neighbour (rings up to `r`) for a pixel the tile map leaves uncoded. */
function nearest(index: Int32Array, w: number, h: number, x: number, y: number, r = 3): number {
  for (let d = 1; d <= r; d++) {
    for (let dy = -d; dy <= d; dy++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const c = index[ny * w + nx]!;
        if (c >= 0) return c;
      }
    }
  }
  return -1;
}

/** The slices of one finished frame: `#<dx>_<dy>` -> a full-canvas image holding only that tile's pixels. */
export function sliceFrame(
  finished: Rgba,
  index: Int32Array,
  footprint: [number, number],
): Map<string, Rgba> {
  const { width: w, height: h } = finished;
  const out = new Map<string, Rgba>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (finished.data[o + 3] === 0) continue;
      let c = index[y * w + x]!;
      if (c < 0) c = nearest(index, w, h, x, y);
      if (c < 0) continue;
      const dx = Math.min(c % 256, footprint[0] - 1);
      const dy = Math.min(Math.floor(c / 256), footprint[1] - 1);
      const key = `#${dx}_${dy}`;
      let img = out.get(key);
      if (!img) {
        img = { width: w, height: h, data: new Uint8Array(w * h * 4) };
        out.set(key, img);
      }
      img.data.set(finished.data.subarray(o, o + 4), o);
    }
  }
  return out;
}

/** Finish and slice every frame of a render dir; returns the slice files and their static manifest. */
export function sliceFolder(
  renderDir: string,
  on: boolean = finishEnabled('main'),
): { files: Map<string, Buffer>; manifest: StaticManifest } {
  const src = JSON.parse(readFileSync(join(renderDir, 'manifest.json'), 'utf8')) as {
    atlas: StaticManifest['atlas'];
    frames: Record<string, SliceSource>;
  };
  const manifest: StaticManifest = { version: 1, atlas: src.atlas, frames: {} };
  const files = new Map<string, Buffer>();
  for (const [name, f] of Object.entries(src.frames).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const finished = finishRender(decodePng(readFileSync(join(renderDir, f.file))), on);
    const index = tileIndex(
      decodePng(readFileSync(join(renderDir, f.tiles))),
      finished.width,
      finished.height,
    );
    for (const [suffix, img] of sliceFrame(finished, index, f.footprint)) {
      const frame = `${name}${suffix}`;
      const file = `${frame.replace('#', '__')}.png`;
      files.set(file, encodePng(img));
      manifest.frames[frame] = {
        file,
        cell: [finished.width, finished.height],
        pivot: [f.pivot[0] / 2, f.pivot[1] / 2],
      };
    }
  }
  return { files, manifest };
}

// CLI: tsx slice.ts <render dir> <out dir> [--finish on|off]
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const fi = args.indexOf('--finish');
  const on = fi >= 0 ? args[fi + 1] === 'on' : finishEnabled('main');
  const [renderDir, outDir] = fi < 0 ? args : args.filter((_, i) => i !== fi && i !== fi + 1);
  if (!renderDir || !outDir) {
    console.error('usage: tsx slice.ts <render dir> <out dir> [--finish on|off]');
    process.exit(2);
  }
  const { files, manifest } = sliceFolder(renderDir, on);
  mkdirSync(outDir, { recursive: true });
  for (const [name, png] of files) writeFileSync(join(outDir, name), png);
  const target = join(outDir, 'manifest.json');
  if (existsSync(target)) {
    const old = JSON.parse(readFileSync(target, 'utf8')) as StaticManifest;
    manifest.atlas = old.atlas;
    manifest.frames = { ...old.frames, ...manifest.frames };
  }
  writeFileSync(target, `${JSON.stringify(manifest, null, 1)}\n`);
  console.log(`slice: ${files.size} slices (${on ? 'finish on' : 'finish off'}) -> ${outDir}`);
}
