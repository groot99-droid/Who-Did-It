// The HD art style's build (docs/round8/art.md 3, DECISIONS A164). The render scripts run with `--style hd`
// write every frame at `factor` render px per display px (tools/blender/rig_common.py STYLE_FACTOR) with the
// HD finish, and this module packs them unhalved: no pixel finish, the alpha bleed and the packer's extrude
// ring the low-poly style has, the page caps and the ground cells `factor` times larger. The keys, the frame
// names, the pivots (fractions of the frame) and the manifests stay those of the 8-bit set (A79, A80); the
// client learns the texel factor from `assets/hd/manifest.json` (`texels`) and draws a frame at 1 / texels of
// the usual scale.
//
//   tsx hd.ts ground <render dir>/ground <out dir>               iso_ground_<theme>.png for each theme rendered
//   tsx hd.ts static <render dir>/<atlas> <out dir> [--subset]   kit, props, clues (pack-static at hd caps)
//   tsx hd.ts slice <render dir>/<bld_<map>> <out dir>           buildings and multi-tile props, 1:1 tile index
//   tsx hd.ts char <render dir> <out dir>                         a look's passes (pack.ts at hd pages)
//
// `--subset` packs whatever frames a partial render holds (the look proposal); without it the frame set must
// be the atlas's whole key list, as pack-static.ts checks.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alphaBleed, bleed, decodePng, encodePng, type Rgba } from './bleed.ts';
import { CHAR_PAGE, OVL_PAGE } from './keys.ts';
import { crop } from './pixel.ts';
import { atlasJson, packCharacter, readRender, writeFiles } from './pack.ts';
import {
  applyStaticPivots,
  packCapped,
  packStatic,
  pageCap,
  readStatic,
  type StaticManifest,
} from './pack-static.ts';
import { sliceFrame, tileIndex, type SliceSource } from './slice.ts';
import {
  CELL_H,
  CELL_W,
  COLUMNS,
  GROUND_NAMES,
  GROUND_ROWS,
  VARIANTS,
  edgeOverlay,
  maskDiamond,
} from './tileset.ts';

/** The texel factor of a render, from its manifest's `factor` (the sheets, the characters). */
export function texelsOf(manifest: object, what: string): number {
  const f = (manifest as { factor?: unknown }).factor;
  if (typeof f !== 'number' || !Number.isInteger(f) || f < 1) {
    throw new Error(`hd: ${what} has no integer render factor; render it with --style hd`);
  }
  return f;
}

/** The texel factor of an image rendered at `factor` times a display size. */
export function texelsOfSize(width: number, displayWidth: number, what: string): number {
  const t = width / displayWidth;
  if (!Number.isInteger(t) || t < 1) {
    throw new Error(`hd: ${what} is ${width} px wide, not a whole multiple of ${displayWidth}`);
  }
  return t;
}

function blank(w: number, h: number): Rgba {
  return { width: w, height: h, data: new Uint8Array(w * h * 4) };
}

/**
 * The ground tileset of one theme from `renders(char, v)` (each a (128 x 64) x texels render), laid out as
 * tileset.ts does (cell c of material m at column c mod 10, row 2m + floor(c / 10)) with cells texels times
 * larger: masked to the diamond, alpha-bled, the 15 edge overlays with a rim texels times wider.
 */
export function hdTileset(renders: (char: string, v: number) => Rgba, texels: number): Rgba {
  const cw = CELL_W * texels;
  const ch = CELL_H * texels;
  const sheet = blank(cw * COLUMNS, ch * 2 * GROUND_ROWS.length);
  const place = (cell: Rgba, col: number, row: number) => {
    for (let y = 0; y < ch; y++) {
      sheet.data.set(
        cell.data.subarray(y * cw * 4, (y + 1) * cw * 4),
        ((row * ch + y) * sheet.width + col * cw) * 4,
      );
    }
  };
  [...GROUND_ROWS].forEach((char, m) => {
    let first: Rgba | null = null;
    for (let v = 0; v < VARIANTS; v++) {
      const render = renders(char, v);
      if (render.width !== cw || render.height !== ch) {
        throw new Error(`hd: ground ${char}/${v} is ${render.width}x${render.height}, want ${cw}x${ch}`);
      }
      const opaque: Rgba = { width: cw, height: ch, data: new Uint8Array(render.data) };
      for (let i = 3; i < opaque.data.length; i += 4) opaque.data[i] = 255;
      const art = maskDiamond(opaque);
      first ??= art;
      place(bleed(art), v % COLUMNS, 2 * m + Math.floor(v / COLUMNS));
    }
    for (let k = 1; k <= 15; k++) {
      const c = 3 + k;
      place(bleed(edgeOverlay(first!, k, false, 2 * texels)), c % COLUMNS, 2 * m + Math.floor(c / COLUMNS));
    }
  });
  return sheet;
}

/** `iso_ground_<theme>.png` for every theme folder of a build_ground.py render dir. */
export function hdGround(renderDir: string): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const theme of readdirSync(renderDir).sort()) {
    const dir = join(renderDir, theme);
    if (!existsSync(join(dir, `${GROUND_NAMES[GROUND_ROWS[0]!]}_0.png`))) continue;
    const read = (char: string, v: number) =>
      decodePng(readFileSync(join(dir, `${GROUND_NAMES[char]}_${v}.png`)));
    const texels = texelsOfSize(read(GROUND_ROWS[0]!, 0).width, CELL_W, `ground ${theme}`);
    out.set(`iso_ground_${theme}.png`, encodePng(hdTileset(read, texels)));
  }
  if (out.size === 0) throw new Error(`hd: no theme folder with ground renders under ${renderDir}`);
  return out;
}

/**
 * A static sheet (kit, props, clues) packed at `texels` times its page cap, unfinished and alpha-bled. With
 * `subset` the frames present pack as they are; otherwise the atlas's whole key list is required.
 */
export async function hdStatic(renderDir: string, subset = false): Promise<Map<string, Buffer>> {
  const { manifest: display, inputs } = readStatic(renderDir);
  const texels = texelsOf(display, display.atlas);
  // The render manifest holds cells and pivots in display px; the frames are `texels` times that.
  const manifest: StaticManifest = {
    ...display,
    frames: Object.fromEntries(
      Object.entries(display.frames).map(([k, f]) => [
        k,
        {
          ...f,
          cell: Array.isArray(f.cell) ? f.cell.map((v) => v * texels) : f.cell * texels,
          ...(f.pivot ? { pivot: [f.pivot[0] * texels, f.pivot[1] * texels] } : {}),
        },
      ]),
    ) as StaticManifest['frames'],
  };
  if (!subset) return packStatic(manifest, inputs, false, texels);
  const cap = pageCap(manifest.atlas) ?? [2048, 2048];
  const { atlas, pages } = await packCapped(manifest.atlas, inputs, cap[0] * texels, cap[1] * texels, false);
  applyStaticPivots(atlas, manifest);
  const out = new Map<string, Buffer>(pages);
  out.set(`${manifest.atlas}.json`, Buffer.from(atlasJson(atlas)));
  return out;
}

/** The box [x, y, w, h] of an image's pixels with alpha, or null for an empty image. */
export function alphaBox(img: Rgba): [number, number, number, number] | null {
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

/**
 * The slices of a build_buildings.py render dir at HD: each frame alpha-bled, not finished or halved, cut
 * by its tile map one pixel to one (the map is rendered at the same size), the pivot and the cell in render
 * px. The manifest records `cell` and `pivot` in display px, so the factor is the image's. Unlike slice.ts
 * a slice keeps only its own box, not the whole canvas (an HD canvas is taller than the building page cap,
 * and the packer refuses an input larger than its page before it trims), so its pivot moves with the crop.
 */
export function hdSlices(renderDir: string): { files: Map<string, Buffer>; manifest: StaticManifest } {
  const src = JSON.parse(readFileSync(join(renderDir, 'manifest.json'), 'utf8')) as {
    atlas: StaticManifest['atlas'];
    frames: Record<string, SliceSource>;
  };
  const manifest: StaticManifest = { version: 1, atlas: src.atlas, frames: {} };
  const files = new Map<string, Buffer>();
  for (const [name, f] of Object.entries(src.frames).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const img = decodePng(alphaBleed(readFileSync(join(renderDir, f.file))));
    const texels = texelsOfSize(img.width, f.cell[0], `${src.atlas}/${name}`);
    manifest.factor = texels;
    const tiles = decodePng(readFileSync(join(renderDir, f.tiles)));
    if (tiles.width !== img.width || tiles.height !== img.height) {
      throw new Error(`hd: ${src.atlas}/${name}: the tile map is not the frame's size`);
    }
    const index = tileIndex(tiles, img.width, img.height, 1);
    for (const [suffix, slice] of sliceFrame(img, index, f.footprint)) {
      const frame = `${name}${suffix}`;
      const file = `${frame.replace('#', '__')}.png`;
      const box = alphaBox(slice);
      if (!box) continue;
      files.set(file, encodePng(crop(slice, box, box[2], box[3])));
      // In display px like every render manifest (hdStatic scales them back); a crop at an odd render px
      // leaves a half.
      manifest.frames[frame] = {
        file,
        cell: [box[2] / texels, box[3] / texels],
        pivot: [f.pivot[0] - box[0] / texels, f.pivot[1] - box[1] / texels],
      };
    }
  }
  return { files, manifest };
}

/** A look's passes packed from an unfinished batch_render.py dir at `texels` times the look's page caps. */
export async function hdCharacter(renderDir: string): Promise<Map<string, Buffer>> {
  const { manifest, framesByPass } = readRender(renderDir, true);
  const texels = texelsOf(manifest, `character ${manifest.body}`);
  const scale = (p: { w: number; h: number }) => ({ w: p.w * texels, h: p.h * texels });
  return packCharacter(manifest.body, framesByPass, manifest, {
    body: scale(CHAR_PAGE),
    overlay: scale(OVL_PAGE),
  });
}

/** Merge new slice frames into an out dir's static manifest, as slice.ts does. */
function writeSlices(outDir: string, result: { files: Map<string, Buffer>; manifest: StaticManifest }): void {
  mkdirSync(outDir, { recursive: true });
  for (const [name, png] of result.files) writeFileSync(join(outDir, name), png);
  const target = join(outDir, 'manifest.json');
  const manifest = result.manifest;
  if (existsSync(target)) {
    const old = JSON.parse(readFileSync(target, 'utf8')) as StaticManifest;
    manifest.atlas = old.atlas;
    manifest.frames = { ...old.frames, ...manifest.frames };
  }
  writeFileSync(target, `${JSON.stringify(manifest, null, 1)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const subset = args.includes('--subset');
  const [mode, renderDir, outDir] = args.filter((a) => !a.startsWith('--'));
  if (!mode || !renderDir || !outDir || !['ground', 'static', 'slice', 'char'].includes(mode)) {
    console.error('usage: tsx hd.ts ground|static|slice|char <render dir> <out dir> [--subset]');
    process.exit(2);
  }
  if (mode === 'slice') {
    const result = hdSlices(renderDir);
    writeSlices(outDir, result);
    console.log(`hd: ${result.files.size} slices -> ${outDir}`);
  } else {
    const files =
      mode === 'ground'
        ? hdGround(renderDir)
        : mode === 'static'
          ? await hdStatic(renderDir, subset)
          : await hdCharacter(renderDir);
    writeFiles(outDir, files);
    console.log(`hd: ${[...files.keys()].join(', ')} -> ${outDir}`);
  }
}
