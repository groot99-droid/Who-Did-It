// The world palette and the pixel-finish settings, read from packages/content/data (docs/ASSETS.md 6.1,
// 6.11). tools/sprites does not depend on @wdi/content, so it reads the two JSON files directly; their
// schemas and content tests live in packages/content.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dist2, hexToRgb, oklab, type Lab } from './oklab.ts';

const DATA = join(import.meta.dirname, '../../packages/content/data');

export type Mode = 'main' | 'onub';

interface PaletteJson {
  colors: Record<string, string>;
  rules: { maxSaturatedAccentShare: number };
  world: { ramps: Record<string, string[]>; saturated: string[] };
}

export interface PixelSettings {
  illustrationScale: number;
  alphaCut: number;
  match: 'oklab';
  tieBreak: 'darkest';
  keyTolerance: number;
  cutoutOutline: string;
  webpQuality: number;
}

interface StyleJson {
  keyColors: string[];
  pixel: PixelSettings;
  pixelFinish: { enabled: Record<Mode, boolean>; offWebpQuality: number };
  artStyles: { default: string; reserved: string[]; styles: ArtStyle[] };
  references: Record<string, Array<{ file: string; crop?: [number, number, number, number] }>>;
}

const readJson = <T>(name: string): T => JSON.parse(readFileSync(join(DATA, name), 'utf8')) as T;

export const paletteFile: PaletteJson = readJson<PaletteJson>('palette.json');
export const styleFile: StyleJson = readJson<StyleJson>('style.json');
export const pixelSettings: PixelSettings = styleFile.pixel;

/** Whether a mode's art takes the pixel finish (style.json `pixelFinish.enabled`; ONUB is always on). */
export function finishEnabled(mode: Mode): boolean {
  return styleFile.pixelFinish.enabled[mode];
}

/**
 * One art style a player can pick in the client (style.json `artStyles`, DECISIONS A79, SPRITES 5). Each style
 * ships the same keys, frame names, cells and pivots under `apps/client/public/assets/<root>manifest.json`.
 */
export interface ArtStyle {
  id: string;
  pixelFinish: boolean;
  filter: 'nearest' | 'linear';
  drawScale: number;
  root: string;
}

/** Every shipped art style, in file order (the 8-bit style first). */
export function artStyles(): readonly ArtStyle[] {
  return styleFile.artStyles.styles;
}

/** The style with this id; throws on an unknown or reserved id. */
export function artStyle(id: string): ArtStyle {
  const s = styleFile.artStyles.styles.find((x) => x.id === id);
  if (!s) throw new Error(`unknown art style ${id} (style.json artStyles)`);
  return s;
}

/** The style a new player starts with. */
export function defaultArtStyle(): ArtStyle {
  return artStyle(styleFile.artStyles.default);
}

export interface WorldColour {
  hex: string;
  rgb: readonly [number, number, number];
  lab: Lab;
  /** 0xRRGGBB, the key of `indexOfRgb`. */
  key: number;
}

/** The world palette: palette.json `world.ramps`, deduplicated, in file order (64 colours). */
export const WORLD: readonly WorldColour[] = (() => {
  const seen = new Set<string>();
  const out: WorldColour[] = [];
  for (const ramp of Object.values(paletteFile.world.ramps)) {
    for (const raw of ramp) {
      const hex = raw.toUpperCase();
      if (seen.has(hex)) continue;
      seen.add(hex);
      const rgb = hexToRgb(hex);
      out.push({ hex, rgb, lab: oklab(...rgb), key: (rgb[0] << 16) | (rgb[1] << 8) | rgb[2] });
    }
  }
  return out;
})();

export function worldPalette(): readonly string[] {
  return WORLD.map((c) => c.hex);
}

const INDEX_OF_KEY = new Map(WORLD.map((c, i) => [c.key, i]));

/** Index of an exact world colour, or -1. */
export function indexOfRgb(r: number, g: number, b: number): number {
  return INDEX_OF_KEY.get((r << 16) | (g << 8) | b) ?? -1;
}

/** Palette indices sorted darkest first (OKLab L, then file order): the order a tie is broken in. */
export const DARK_RANK: readonly number[] = (() => {
  const order = WORLD.map((_, i) => i).sort((p, q) => WORLD[p]!.lab[0] - WORLD[q]!.lab[0] || p - q);
  const rank = new Array<number>(WORLD.length);
  order.forEach((idx, r) => (rank[idx] = r));
  return rank;
})();

const NEAREST_CACHE = new Map<number, number>();

/** Index of the world colour nearest to an sRGB colour in OKLab; an exact tie goes to the darker one. */
export function nearestIndex(r: number, g: number, b: number): number {
  const key = (r << 16) | (g << 8) | b;
  const hit = NEAREST_CACHE.get(key);
  if (hit !== undefined) return hit;
  const lab = oklab(r, g, b);
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < WORLD.length; i++) {
    const d = dist2(lab, WORLD[i]!.lab);
    if (d < bestD || (d === bestD && DARK_RANK[i]! < DARK_RANK[best]!)) {
      best = i;
      bestD = d;
    }
  }
  NEAREST_CACHE.set(key, best);
  return best;
}

/** The `world.saturated` colours as 0xRRGGBB keys. */
export const SATURATED: ReadonlySet<number> = new Set(
  paletteFile.world.saturated.map((h) => {
    const [r, g, b] = hexToRgb(h);
    return (r << 16) | (g << 8) | b;
  }),
);

/** The outline colour of a finished cutout: the token `pixel.cutoutOutline` names (ink #12141C). */
export function outlineRgb(): [number, number, number] {
  const hex = paletteFile.colors[pixelSettings.cutoutOutline];
  if (!hex) throw new Error(`palette.json has no token ${pixelSettings.cutoutOutline}`);
  return hexToRgb(hex);
}
