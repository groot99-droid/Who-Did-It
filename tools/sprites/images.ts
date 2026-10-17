// Finishes the single-image keys rendered by tools/blender (docs/SPRITES.md 8): the dark-loft images
// (build_loft.py), the building exteriors (build_buildings.py) and the ground tilesets (build_tiles.py,
// four 64 px variants joined into one 256 x 64 row). Each image is checked against its size, alpha-bled
// and re-encoded, which also drops the render's date stamp, so a re-render writes byte-identical files.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bleed, decodePng, encodePng, type Rgba } from './bleed.ts';
import { BUILDING_KEYS, LOFT_KEYS, TILESET_KEYS } from './keys.ts';
import { writeFiles } from './pack.ts';

/** Pixel size of each image key (the buildings as tools/blender/build_buildings.py image_size). */
export const IMAGE_SIZES: Readonly<Record<string, readonly [number, number]>> = {
  loft_backdrop: [1280, 720],
  prop_bedroll: [112, 184], // twice the 56 x 92 px blanket of apps/client/public/mockups/loft.html
  prop_bedroll_self: [112, 184],
  bld_tavern_ext: [566, 394],
  bld_apoth_ext: [438, 345],
  bld_widow_ext: [438, 345],
  bld_bakery_ext: [438, 345],
  ...Object.fromEntries(TILESET_KEYS.map((k) => [k, [256, 64] as const])),
};

export const TILE_VARIANTS = 4;
const TILE_PX = 64;

function checked(key: string, img: Rgba): Rgba {
  const [w, h] = IMAGE_SIZES[key]!;
  if (img.width !== w || img.height !== h) {
    throw new Error(`images: ${key} is ${img.width}x${img.height}, want ${w}x${h}`);
  }
  return img;
}

/** One image per key: `inputs` maps a key to its render (a tileset key to its four variants in order). */
export function finishImages(
  keys: readonly string[],
  inputs: Map<string, Buffer | Buffer[]>,
): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const key of keys) {
    const src = inputs.get(key);
    if (!src) throw new Error(`images: missing ${key}`);
    if (Array.isArray(src)) {
      if (src.length !== TILE_VARIANTS) throw new Error(`images: ${key} has ${src.length} variants`);
      const row: Rgba = {
        width: TILE_PX * TILE_VARIANTS,
        height: TILE_PX,
        data: new Uint8Array(TILE_PX * TILE_VARIANTS * TILE_PX * 4),
      };
      src.forEach((png, v) => {
        const tile = decodePng(png);
        if (tile.width !== TILE_PX || tile.height !== TILE_PX)
          throw new Error(`images: ${key}_${v} is not 64 px`);
        for (let y = 0; y < TILE_PX; y++) {
          row.data.set(
            tile.data.subarray(y * TILE_PX * 4, (y + 1) * TILE_PX * 4),
            (y * row.width + v * TILE_PX) * 4,
          );
        }
      });
      out.set(`${key}.png`, encodePng(checked(key, row)));
    } else {
      out.set(`${key}.png`, encodePng(bleed(checked(key, decodePng(src)))));
    }
  }
  return out;
}

/** The render folder and the asset folder of each image set. */
export const IMAGE_SETS = [
  { dir: 'loft', keys: LOFT_KEYS },
  { dir: 'buildings', keys: BUILDING_KEYS },
  { dir: 'tiles', keys: TILESET_KEYS },
] as const;

// CLI: tsx tools/sprites/images.ts <render root, e.g. build/render> <assets dir>; sets not rendered are skipped.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [renderRoot, outRoot] = process.argv.slice(2);
  if (!renderRoot || !outRoot) {
    console.error('usage: tsx images.ts <render root> <assets dir>');
    process.exit(2);
  }
  for (const { dir, keys } of IMAGE_SETS) {
    const from = join(renderRoot, dir);
    if (!existsSync(from)) continue;
    const read = (name: string) => readFileSync(join(from, `${name}.png`));
    const inputs = new Map<string, Buffer | Buffer[]>(
      keys.map((k) => [
        k,
        dir === 'tiles' ? Array.from({ length: TILE_VARIANTS }, (_, v) => read(`${k}_${v}`)) : read(k),
      ]),
    );
    const files = finishImages(keys, inputs);
    writeFiles(join(outRoot, dir), files);
    console.log(`images: ${[...files.keys()].join(', ')} -> ${join(outRoot, dir)}`);
  }
}
