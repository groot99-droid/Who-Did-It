// Deterministic atlas packing on free-tex-packer-core (docs/ASSETS.md 6.3, docs/SPRITES.md 3).
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packAsync } from 'free-tex-packer-core';
import { applyPivots, buildAnims, type FeetManifest } from './gen-anims.ts';
import { PASSES, frameKey, parseFrameFileName, textureKey, type Pass } from './keys.ts';

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
}

/**
 * Pack frames into `<textureName>-<n>.png` pages and one multiatlas JSON. Inputs are sorted by name
 * so the same frames always produce byte-identical pages.
 */
export async function packFrames(textureName: string, inputs: PackInput[]): Promise<PackResult> {
  const names = new Set<string>();
  for (const i of inputs) {
    if (names.has(i.name)) throw new Error(`duplicate frame ${i.name}`);
    names.add(i.name);
  }
  const files = [...inputs]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((i) => ({ path: `${i.name}.png`, contents: i.png }));
  const out = await packAsync(files, { ...PACK_OPTIONS, textureName } as Parameters<typeof packAsync>[1]);

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
  return { atlas: { textures, meta }, pages };
}

export function atlasJson(atlas: MultiAtlas): string {
  return `${JSON.stringify(atlas, null, 1)}\n`;
}

/**
 * Pack one body's passes: `char_<body>` (body pass) and `ovl_<body>` (every overlay pass), pivots
 * from the Feet manifest, and `<body>.anims.json`. Returns output file name -> bytes.
 */
export async function packCharacter(
  body: string,
  framesByPass: Map<Pass, PackInput[]>,
  manifest: FeetManifest,
): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  const bodyFrames = framesByPass.get('body') ?? [];
  const overlayFrames = PASSES.filter((p) => p !== 'body').flatMap((p) => framesByPass.get(p) ?? []);
  const textures: { key: string; atlas: MultiAtlas }[] = [];
  for (const [key, frames] of [
    [textureKey('body', body), bodyFrames],
    [textureKey('scarf', body), overlayFrames],
  ] as const) {
    if (frames.length === 0) continue;
    const { atlas, pages } = await packFrames(key, frames);
    applyPivots(atlas, manifest);
    textures.push({ key, atlas });
    for (const [name, png] of pages) out.set(name, png);
    out.set(`${key}.json`, Buffer.from(atlasJson(atlas)));
  }
  out.set(`${body}.anims.json`, Buffer.from(`${JSON.stringify(buildAnims(textures), null, 1)}\n`));
  return out;
}

/** Read batch_render output (<dir>/<pass>/char_*.png + manifest.json) into pack inputs. */
export function readRender(dir: string): { manifest: FeetManifest; framesByPass: Map<Pass, PackInput[]> } {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as FeetManifest;
  const framesByPass = new Map<Pass, PackInput[]>();
  for (const pass of manifest.passes as Pass[]) {
    if (!PASSES.includes(pass)) throw new Error(`unknown pass ${pass}`);
    const files = readdirSync(join(dir, pass)).filter((f) => f.endsWith('.png')).sort();
    framesByPass.set(
      pass,
      files.map((f) => {
        const id = parseFrameFileName(f.slice(0, -4));
        if (id.body !== manifest.body) throw new Error(`${f} is not body ${manifest.body}`);
        return { name: frameKey(pass, id), png: readFileSync(join(dir, pass, f)) };
      }),
    );
  }
  return { manifest, framesByPass };
}

export function writeFiles(outDir: string, files: Map<string, Buffer>): void {
  mkdirSync(outDir, { recursive: true });
  for (const [name, bytes] of files) writeFileSync(join(outDir, name), bytes);
}

// CLI: node tools/sprites/pack.ts <render dir, e.g. build/render/villager> <out dir>
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [renderDir, outDir] = process.argv.slice(2);
  if (!renderDir || !outDir) {
    console.error('usage: node pack.ts <render dir> <out dir>');
    process.exit(2);
  }
  const { manifest, framesByPass } = readRender(renderDir);
  const files = await packCharacter(manifest.body, framesByPass, manifest);
  writeFiles(outDir, files);
  console.log(`pack: ${[...files.keys()].join(', ')} -> ${outDir}`);
}
