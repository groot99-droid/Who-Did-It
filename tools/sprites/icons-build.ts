// Generates the 8-bit and low-poly rasters of every round-8 icon master (icons.ts, SPRITES 9.1): for each
// `apps/client/public/assets/ui/icons/hd/<key>.svg`, writes `8bit/<key>.png` and `lowpoly/<key>.png` beside it.
// The rasters are build output: edit the master and run this again, never the PNGs.
//
//   pnpm --filter @wdi/sprites icons             every master
//   pnpm --filter @wdi/sprites icons <key> ...   only these
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePng } from './bleed.ts';
import { ICONS_DIR, RASTER_STYLES, masterKeys, readMaster, renderIcon } from './icons.ts';

export async function buildIcons(keys: readonly string[] = masterKeys(), dir = ICONS_DIR): Promise<void> {
  for (const style of RASTER_STYLES) mkdirSync(join(dir, style), { recursive: true });
  for (const key of keys) {
    const svg = readMaster(key, join(dir, 'hd'));
    for (const style of RASTER_STYLES)
      writeFileSync(join(dir, style, `${key}.png`), encodePng(await renderIcon(svg, style)));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const keys = process.argv.slice(2);
  await buildIcons(keys.length > 0 ? keys : undefined);
}
