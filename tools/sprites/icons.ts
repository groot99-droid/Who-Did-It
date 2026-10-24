// The status and HUD icons of round 8 (8N, docs/round8/teardown.md 3; DECISIONS A172), drawn instead of a word.
// Each icon is one hand-written SVG master, `apps/client/public/assets/ui/icons/hd/<key>.svg`, on the 48 px grid
// of SPRITES 9.1. The master is the HD file the client shows as it is. The 8-bit and low-poly rasters beside it,
// `8bit/<key>.png` and `lowpoly/<key>.png`, are generated from it here and never edited by hand.
//
// One master carries both looks. The HD look is the file as drawn. The flat look the two pixel styles share drops
// every element marked `class="hd"` (highlights, glows, soft shades), shows every element marked `class="flat"`
// (hard facets, hidden in HD with `display="none"`), and paints each gradient with its `data-flat` colour.
//
// The owner's brief for the first one (A168): "when a player is three tiles of someone bleeding it doesn't say
// bleeding there is a dagger partially stabbed in a white background with red and around it and seemingly dripping".
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { Rgba } from './bleed.ts';
import { paletteFile } from './palette.ts';
import { finishRender, upscaleNearest } from './pixel.ts';

/** The ground of every icon: the bone ramp's lightest tone (the palette has no white in art, UI.md 2). */
export const GROUND = (paletteFile.world.ramps as Record<string, string[]>)['bone']![3]!;
export const GRID = 48;
export const ICONS_DIR = join(import.meta.dirname, '../../apps/client/public/assets/ui/icons');
export const MASTER_DIR = join(ICONS_DIR, 'hd');
/** The generated styles, each a folder of `<key>.png` beside the masters. */
export const RASTER_STYLES = ['8bit', 'lowpoly'] as const;
export type RasterStyle = (typeof RASTER_STYLES)[number];
export type IconStyleId = RasterStyle | 'hd';

/** The keys of every master, sorted. */
export function masterKeys(dir = MASTER_DIR): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.svg'))
    .map((f) => f.slice(0, -4))
    .sort();
}

export const readMaster = (key: string, dir = MASTER_DIR): string =>
  readFileSync(join(dir, `${key}.svg`), 'utf8');

/** The flat look of a master: HD-only elements dropped, flat-only ones shown, gradients as their flat colour. */
export function flatten(svg: string): string {
  const flat = new Map<string, string>();
  for (const [, id, colour] of svg.matchAll(/<(?:linear|radial)Gradient id="([^"]+)" data-flat="([^"]+)"/g))
    flat.set(id!, colour!);
  return svg
    .replace(/<defs>[\s\S]*?<\/defs>\n?/, '')
    .replace(/<[a-z]+ class="hd"[^>]*\/>\n?/g, '')
    .replace(/ class="flat" display="none"/g, '')
    .replace(/url\(#([^)]+)\)/g, (_, id: string) => {
      const c = flat.get(id);
      if (c === undefined) throw new Error(`icons: gradient ${id} has no data-flat colour`);
      return c;
    });
}

/** The master drawn at `px` (its viewBox stays the 48 grid). */
export const sized = (svg: string, px: number): string =>
  svg.replace(/<svg([^>]*?) width="\d+" height="\d+"/, `<svg$1 width="${px}" height="${px}"`);

/** Rasterises an SVG at `px` square. */
export async function rasterise(svg: string, px: number): Promise<Rgba> {
  const img = await loadImage(Buffer.from(sized(svg, px)));
  const canvas = createCanvas(px, px);
  const g = canvas.getContext('2d');
  g.drawImage(img, 0, 0, px, px);
  const d = g.getImageData(0, 0, px, px);
  return { width: px, height: px, data: new Uint8Array(d.data.buffer.slice(0)) };
}

/**
 * A master finished for one art style, 48 px square: 8-bit is the flat look at 48 snapped to the world palette,
 * mode-halved to the 24 px cell and doubled back with nearest scaling; low poly the flat look at 96 box-halved and
 * alpha-bled; HD the master as drawn, at `hdPx`.
 */
export async function renderIcon(svg: string, style: IconStyleId, hdPx = GRID): Promise<Rgba> {
  if (style === 'hd') return rasterise(svg, hdPx);
  if (style === '8bit') return upscaleNearest(finishRender(await rasterise(flatten(svg), GRID), true), 2);
  return finishRender(await rasterise(flatten(svg), GRID * 2), false);
}
