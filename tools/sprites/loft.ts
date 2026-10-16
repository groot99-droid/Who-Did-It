// Finishes the dark-loft images rendered by tools/blender/build_loft.py (docs/SPRITES.md 8): checks each
// key's size, alpha-bleeds it and re-encodes it, which also drops the render's date stamp, so a re-render
// writes byte-identical files.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bleed, decodePng, encodePng } from './bleed.ts';
import { LOFT_KEYS } from './keys.ts';
import { writeFiles } from './pack.ts';

/** Pixel size of each loft image: the backdrop, and the bedrolls at twice the mockup's 56 x 92 px blanket. */
export const LOFT_SIZES: Readonly<Record<string, readonly [number, number]>> = {
  loft_backdrop: [1280, 720],
  prop_bedroll: [112, 184],
  prop_bedroll_self: [112, 184],
};

export function finishLoft(inputs: Map<string, Buffer>): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const key of LOFT_KEYS) {
    const png = inputs.get(key);
    if (!png) throw new Error(`loft: missing ${key}`);
    const img = decodePng(png);
    const [w, h] = LOFT_SIZES[key]!;
    if (img.width !== w || img.height !== h) {
      throw new Error(`loft: ${key} is ${img.width}x${img.height}, want ${w}x${h}`);
    }
    out.set(`${key}.png`, encodePng(bleed(img)));
  }
  return out;
}

// CLI: tsx tools/sprites/loft.ts <render dir, e.g. build/render/loft> <out dir>
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [renderDir, outDir] = process.argv.slice(2);
  if (!renderDir || !outDir) {
    console.error('usage: tsx loft.ts <render dir> <out dir>');
    process.exit(2);
  }
  const inputs = new Map(LOFT_KEYS.map((k) => [k, readFileSync(join(renderDir, `${k}.png`))]));
  const files = finishLoft(inputs);
  writeFiles(outDir, files);
  console.log(`loft: ${[...files.keys()].join(', ')} -> ${outDir}`);
}
