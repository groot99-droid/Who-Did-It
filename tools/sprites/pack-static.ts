// Packs a static sheet (clues, props, vfx) rendered by tools/blender/build_props.py or build_vfx.py
// (docs/SPRITES.md 8): pivots from the render manifest, and for `vfx` the Phaser anims file.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alphaBleed } from './bleed.ts';
import type { PhaserAnim } from './gen-anims.ts';
import { FPS, staticFrameNames } from './keys.ts';
import { atlasJson, packFrames, writeFiles, type MultiAtlas, type PackInput } from './pack.ts';

export type StaticAtlas = 'clues' | 'props' | 'vfx';

export interface StaticManifest {
  version: number;
  atlas: StaticAtlas;
  frames: Record<string, { file: string; cell: number; pivot?: [number, number]; clipped?: boolean }>;
}

/** Pivot (pivot px / cell) on every frame whose render recorded one; others stay centred. */
export function applyStaticPivots(atlas: MultiAtlas, manifest: StaticManifest): void {
  for (const t of atlas.textures) {
    for (const f of t.frames) {
      const entry = manifest.frames[f.filename];
      if (!entry) throw new Error(`no manifest entry for ${f.filename}`);
      if (!entry.pivot) continue;
      const round4 = (v: number) => Math.round(v * 10000) / 10000;
      f.pivot = { x: round4(entry.pivot[0] / f.sourceSize.w), y: round4(entry.pivot[1] / f.sourceSize.h) };
    }
  }
}

/** One anim per `<anim>/<nnn>` group, 12 fps, played once (Phaser holds the last frame). */
export function staticAnims(texture: string, frameNames: string[]): { anims: PhaserAnim[] } {
  const groups = new Map<string, string[]>();
  for (const name of [...frameNames].sort()) {
    const anim = name.slice(0, name.lastIndexOf('/'));
    groups.set(anim, [...(groups.get(anim) ?? []), name]);
  }
  return {
    anims: [...groups].map(([key, frames]) => ({
      key,
      frames: frames.map((frame) => ({ key: texture, frame })),
      frameRate: FPS,
      repeat: 0,
    })),
  };
}

/** Pack a static sheet; the frame set must match the keys of docs/SPRITES.md 8 exactly. */
export async function packStatic(manifest: StaticManifest, inputs: PackInput[]): Promise<Map<string, Buffer>> {
  const want = staticFrameNames(manifest.atlas);
  const got = inputs.map((i) => i.name).sort();
  const missing = want.filter((n) => !got.includes(n));
  const extra = got.filter((n) => !want.includes(n));
  if (missing.length || extra.length) {
    throw new Error(`${manifest.atlas}: missing [${missing.join(', ')}], unexpected [${extra.join(', ')}]`);
  }
  const { atlas, pages } = await packFrames(manifest.atlas, inputs);
  applyStaticPivots(atlas, manifest);
  const out = new Map<string, Buffer>(pages);
  out.set(`${manifest.atlas}.json`, Buffer.from(atlasJson(atlas)));
  if (manifest.atlas === 'vfx') {
    out.set('vfx.anims.json', Buffer.from(`${JSON.stringify(staticAnims('vfx', got), null, 1)}\n`));
  }
  return out;
}

/** Read a render folder (`<dir>/manifest.json` + PNGs); every frame is alpha-bled like the characters. */
export function readStatic(dir: string): { manifest: StaticManifest; inputs: PackInput[] } {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as StaticManifest;
  const inputs = Object.entries(manifest.frames).map(([name, f]) => ({
    name,
    png: alphaBleed(readFileSync(join(dir, f.file))),
  }));
  return { manifest, inputs };
}

// CLI: tsx tools/sprites/pack-static.ts <render dir, e.g. build/render/props> <out dir>
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [renderDir, outDir] = process.argv.slice(2);
  if (!renderDir || !outDir) {
    console.error('usage: tsx pack-static.ts <render dir> <out dir>');
    process.exit(2);
  }
  const { manifest, inputs } = readStatic(renderDir);
  const files = await packStatic(manifest, inputs);
  writeFiles(outDir, files);
  console.log(`pack-static: ${[...files.keys()].join(', ')} -> ${outDir}`);
}
