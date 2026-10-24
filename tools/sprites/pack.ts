// Deterministic atlas packing on free-tex-packer-core (docs/ASSETS.md 6.3, docs/SPRITES.md 3).
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packAsync } from 'free-tex-packer-core';
import { alphaBleed, decodePng, encodeIndexedPng, type Rgba } from './bleed.ts';
import { applyPivots, buildAnims, type FeetManifest } from './gen-anims.ts';
import {
  CHAR_PAGE,
  OVL_PAGE,
  PASSES,
  frameKey,
  isLazy,
  parseFrameFileName,
  textureKey,
  type Pass,
} from './keys.ts';
import { artStyle, defaultArtStyle, finishEnabled } from './palette.ts';

/** The packer settings fixed by ASSETS.md 6.3. */
export const PACK_OPTIONS = {
  exporter: 'Phaser3',
  allowRotation: false,
  allowTrim: true,
  trimMode: 'trim',
  detectIdentical: true,
  powerOfTwo: true,
  padding: 2,
  extrude: 1,
  width: 2048,
  height: 2048,
  removeFileExtension: true,
  prependFolderName: true,
  packer: 'MaxRectsBin',
  packerMethod: 'BestShortSideFit',
} as const;

export interface PackInput {
  /** Atlas frame name, e.g. char/villager/walk/se/003. */
  name: string;
  png: Buffer;
}

export interface AtlasFrame {
  filename: string;
  rotated: boolean;
  trimmed: boolean;
  sourceSize: { w: number; h: number };
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  frame: { x: number; y: number; w: number; h: number };
  pivot?: { x: number; y: number };
}

export interface AtlasTexture {
  image: string;
  format: string;
  size: { w: number; h: number };
  scale: number;
  frames: AtlasFrame[];
}

/** Phaser multiatlas JSON: one entry in `textures` per page. */
export interface MultiAtlas {
  textures: AtlasTexture[];
  meta: { app: string; version: string };
}

export interface PackResult {
  atlas: MultiAtlas;
  /** Page images, file name -> PNG bytes; names match `textures[i].image`. */
  pages: Map<string, Buffer>;
  /** Whether the frames carried the pixel finish (alpha 0 or 255 under the main finish) and packed without extrude. */
  finished?: boolean;
}

/**
 * Pack frames into `<textureName>-<n>.png` pages and one multiatlas JSON. Inputs are sorted by name
 * so the same frames always produce byte-identical pages.
 */
export async function packFrames(
  textureName: string,
  inputs: PackInput[],
  page: { w: number; h: number } = { w: PACK_OPTIONS.width, h: PACK_OPTIONS.height },
  tight = false,
): Promise<PackResult> {
  const names = new Set<string>();
  for (const i of inputs) {
    if (names.has(i.name)) throw new Error(`duplicate frame ${i.name}`);
    names.add(i.name);
  }
  const files = [...inputs]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((i) => ({ path: `${i.name}.png`, contents: i.png }));
  // The packer's extrude resizes edge strips bilinearly, which adds partial alpha and off-palette colours.
  // Finished frames (the pixel finish on: alpha 0 or 255, drawn with nearest filtering) pack without it;
  // the padding alone keeps them apart. Unfinished art keeps the extrude, byte for byte as before, except a
  // `tight` set (a character's pages, A161): the round-8 clip table fills a 1024² body page past 0.9 at padding 2
  // in either style (the Vicar's robe spilled eight frames in the 8-bit style), so those pack without the extrude
  // and at padding 1, which is a whole texel between neighbours under nearest filtering, and under linear
  // filtering (no mipmaps) keeps the neighbour's texel out of the bilinear footprint, so an alpha-bled and
  // premultiplied low-poly frame draws without a fringe.
  const finished = finishEnabled('main') && inputs.every((i) => !hasPartialAlpha(decodePng(i.png)));
  const out = await packAsync(files, {
    ...PACK_OPTIONS,
    extrude: finished || tight ? 0 : PACK_OPTIONS.extrude,
    padding: tight ? 1 : PACK_OPTIONS.padding,
    width: page.w,
    height: page.h,
    textureName,
  } as Parameters<typeof packAsync>[1]);

  const raw = new Map(out.filter((f) => f.name.endsWith('.png')).map((f) => [f.name, f.buffer]));
  const textures: AtlasTexture[] = [];
  let meta: MultiAtlas['meta'] = { app: '', version: '' };
  for (const f of out.filter((f) => f.name.endsWith('.json'))) {
    const page = JSON.parse(f.buffer.toString('utf8')) as MultiAtlas;
    textures.push(...page.textures);
    meta = page.meta;
  }
  // The packer names a lone page <name>.png and several <name>-<n>.png; always use <name>-<n>.png
  // so adding a page never renames the first one.
  textures.sort((a, b) => (a.image < b.image ? -1 : 1));
  const pages = new Map<string, Buffer>();
  textures.forEach((t, i) => {
    const png = raw.get(t.image);
    if (!png) throw new Error(`packer page ${t.image} missing`);
    t.image = `${textureName}-${i}.png`;
    pages.set(t.image, png);
    t.frames.sort((a, b) => (a.filename < b.filename ? -1 : 1));
  });
  const packed = textures.reduce((n, t) => n + t.frames.length, 0);
  if (packed !== inputs.length) throw new Error(`packed ${packed} of ${inputs.length} frames`);
  return { atlas: { textures, meta }, pages, finished };
}

/**
 * The atlas json a character packs is one line (6Z's grant on #184, A161): pretty-printed, the fifteen looks'
 * frame lists were a quarter of the first load. The world packers keep `pretty` until their sessions re-pack.
 */
export function atlasJson(atlas: MultiAtlas, pretty = false): string {
  return `${pretty ? JSON.stringify(atlas, null, 1) : JSON.stringify(atlas)}\n`;
}

/** The page as an indexed PNG when it has 256 colours or fewer and hard alpha, else null. */
function indexedPage(png: Buffer): Buffer | null {
  const img = decodePng(png);
  return hasPartialAlpha(img) ? null : encodeIndexedPng(img);
}

function hasPartialAlpha(img: Rgba): boolean {
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] !== 0 && img.data[i] !== 255) return true;
  return false;
}

/** Page sizes for a body's two textures; a look's caps are one 1024² body page and one 1024 x 512 overlay page. */
export interface CharacterPages {
  body: { w: number; h: number };
  overlay: { w: number; h: number };
}
export const LOOK_PAGES: CharacterPages = { body: CHAR_PAGE, overlay: OVL_PAGE };

/** The anim of an atlas frame name `<pass>/<body>/<anim>/<dir>/<nnn>`. */
const animOf = (name: string): string => name.split('/')[2] ?? '';

/**
 * Pack one body's passes: `char_<body>` (body pass) and `ovl_<body>` (every overlay pass), pivots
 * from the Feet manifest, and `<body>.anims.json`; the lazy clips of the table (SPRITES 3, A161) go the same
 * way onto `char_<body>_2`, `ovl_<body>_2` and `<body>_2.anims.json`, a pair the client loads on first use.
 * Returns output file name -> bytes. A set that does not fit its page size spills onto a second page, which
 * budget.test.ts refuses for a look, except a low-poly body (the finish off) at the round-8 clip table: that one
 * gets a single page twice as tall instead (6Z's decision of 2026-10-24 on #194, A161; SPRITES 3, 10.14).
 */
export async function packCharacter(
  body: string,
  framesByPass: Map<Pass, PackInput[]>,
  manifest: FeetManifest,
  pageSizes: CharacterPages = LOOK_PAGES,
): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  for (const lazy of [false, true]) {
    const pick = (pass: Pass) =>
      (framesByPass.get(pass) ?? []).filter((i) => isLazy(animOf(i.name)) === lazy);
    const bodyFrames = pick('body');
    const overlayFrames = PASSES.filter((p) => p !== 'body').flatMap(pick);
    const textures: { key: string; atlas: MultiAtlas }[] = [];
    for (const [key, frames, size] of [
      [textureKey('body', body, lazy), bodyFrames, pageSizes.body],
      [textureKey('scarf', body, lazy), overlayFrames, pageSizes.overlay],
    ] as const) {
      if (frames.length === 0) continue;
      let packed = await packFrames(key, frames, size, true);
      if (packed.atlas.textures.length > 1 && !packed.finished && !lazy && key === textureKey('body', body)) {
        packed = await packFrames(key, frames, { w: size.w, h: size.h * 2 }, true);
      }
      const { atlas, pages, finished } = packed;
      applyPivots(atlas, manifest);
      textures.push({ key, atlas });
      // A finished page (256 colours or fewer, every alpha 0 or 255: the 8-bit style) is written indexed, the
      // same pixels at a quarter of the bytes, which keeps the option-B clip table inside the first-load budget
      // (ASSETS 6.8, SPRITES 3; 6Z's grant on #194). Any other page stays RGBA.
      for (const [name, png] of pages) out.set(name, (finished && indexedPage(png)) || png);
      out.set(`${key}.json`, Buffer.from(atlasJson(atlas)));
    }
    if (lazy && textures.length === 0) continue;
    // One line like the atlas json (A161): the fifteen looks' frame lists are a measurable part of the first load.
    const anims = `${JSON.stringify(buildAnims(textures))}\n`;
    out.set(`${body}${lazy ? '_2' : ''}.anims.json`, Buffer.from(anims));
  }
  return out;
}

/**
 * Read finished batch_render output (<dir>/<pass>/char_*.png + manifest.json, after the `pixel` CLI)
 * into pack inputs. With the main finish off every frame is alpha-bled first (bleed.ts), so linear
 * filtering never pulls in black from the transparent pixels inside the trim rectangle; with it on,
 * alpha is 0 or 255 and frames draw with nearest filtering, so they pack as they are (SPRITES 10.3).
 */
export function readRender(
  dir: string,
  bleed: boolean = !finishEnabled('main'),
): { manifest: FeetManifest; framesByPass: Map<Pass, PackInput[]> } {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as FeetManifest;
  const framesByPass = new Map<Pass, PackInput[]>();
  for (const pass of manifest.passes as Pass[]) {
    if (!PASSES.includes(pass)) throw new Error(`unknown pass ${pass}`);
    const files = readdirSync(join(dir, pass))
      .filter((f) => f.endsWith('.png'))
      .sort();
    framesByPass.set(
      pass,
      files.map((f) => {
        const id = parseFrameFileName(f.slice(0, -4));
        if (id.body !== manifest.body) throw new Error(`${f} is not body ${manifest.body}`);
        const png = readFileSync(join(dir, pass, f));
        return { name: frameKey(pass, id), png: bleed ? alphaBleed(png) : png };
      }),
    );
  }
  return { manifest, framesByPass };
}

export function writeFiles(outDir: string, files: Map<string, Buffer>): void {
  mkdirSync(outDir, { recursive: true });
  for (const [name, bytes] of files) writeFileSync(join(outDir, name), bytes);
}

// CLI: tsx tools/sprites/pack.ts <finished render dir, e.g. build/finished/baker> <out dir> [--style <id>]
// Each art style (style.json `artStyles`, DECISIONS A79) packs its own `pixel` output: the 8-bit style's
// finished frames as they are, the low-poly style's unfinished frames alpha-bled.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--style');
  const style = at >= 0 ? artStyle(args.splice(at, 2)[1] ?? '') : defaultArtStyle();
  const [renderDir, outDir] = args;
  if (!renderDir || !outDir) {
    console.error('usage: tsx pack.ts <render dir> <out dir> [--style <id>]');
    process.exit(2);
  }
  const { manifest, framesByPass } = readRender(renderDir, !style.pixelFinish);
  const files = await packCharacter(manifest.body, framesByPass, manifest);
  writeFiles(outDir, files);
  console.log(`pack: ${[...files.keys()].join(', ')} -> ${outDir}`);
}
