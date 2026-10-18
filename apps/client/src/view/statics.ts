// The pure side of the static world (SPRITES 10.5 to 10.7, 10.14): what a kit piece, a building slice or a tall prop
// is, whether it hides you, how it fades, and which of them are worth drawing. `StaticView` puts it on screen.
import metrics from '@wdi/content/data/metrics.json';
import { TILE_PX } from '@wdi/shared/constants';
import { ISO_TILE_H, ISO_TILE_W, toScreen } from '@wdi/shared/iso';
import { type PaletteToken } from './greyboxColours';
import { BIAS, type Rect, depthAt } from './iso';

/** One static world sprite: a kit piece, a building slice, a one-tile prop or a spot. */
export interface StaticDef {
  id: string;
  /** Texture key of the atlas and the frame to try; the greybox block stands in when either is missing. */
  atlas: string;
  frame: string;
  /** World px of the ground point the sprite is placed at (SPRITES 10.5). Every slice of a building shares it. */
  x: number;
  y: number;
  /** World px of the ground point that decides its depth: its own tile's centre for a slice. */
  depthX: number;
  depthY: number;
  /** Depth bias (SPRITES 10.6). */
  bias: number;
  /** Footprint in tiles of the greybox stand-in, and its height in screen px. */
  tilesW: number;
  tilesH: number;
  heightPx: number;
  /** Hides you when it stands in front of you (SPRITES 10.7), so it fades. */
  occluder: boolean;
  /** Label of the greybox block, for interactable props. */
  label?: string;
  /** Palette token of the greybox block (default: slate for an occluder, ink otherwise). */
  colour?: PaletteToken;
  /** The frame drawn while the light is off (`setLit(false)`): `frame` is the lit one (lantern posts). */
  frameAlt?: string;
  /** The art decides whether it hides you: true when its frame rises more than `TALL_PROP_PX` above its pivot. */
  autoOccluder?: boolean;
  /** Not drawn until `setShown(id, true)` (the boarded overlay of a portal). */
  hidden?: boolean;
}

export type KitKind = 'wall' | 'tree' | 'boulder' | 'cliff' | 'fence' | 'stack';
export type KitHeight = 'full' | 'half' | 'stub';

const KIT_KINDS: readonly string[] = ['wall', 'tree', 'boulder', 'cliff', 'fence', 'stack'];

/** Screen px of one metre of wall height (`metrics.camera.wallPxPerMeter`, SPRITES 10.3). */
export const WALL_PX_PER_M = metrics.camera.wallPxPerMeter;
/** A prop whose frame rises more than this above its pivot hides what stands behind it (SPRITES 10.7). */
export const TALL_PROP_PX = 96;

/** Displayed height of a kit height in screen px (`iso.wallHeightM`). */
export const kitHeightPx = (h: KitHeight): number => metrics.iso.wallHeightM[h] * WALL_PX_PER_M;

/** Parses a kit frame name `<kind>/<height>/<variant>` (the `type` of a `solids` object, SPRITES 10.12). */
export function parseKitFrame(name: string): { kind: KitKind; height: KitHeight; variant: number } | null {
  const [kind, height, variant, ...rest] = name.split('/');
  if (rest.length > 0 || kind === undefined || !KIT_KINDS.includes(kind)) return null;
  if (height !== 'full' && height !== 'half' && height !== 'stub') return null;
  const v = Number(variant);
  if (!Number.isInteger(v) || v < 0 || v > 3) return null;
  return { kind: kind as KitKind, height, variant: v };
}

/**
 * Whether a kit piece hides you (SPRITES 10.7): walls, trees and cliffs at full or half height. Boulders, fences
 * and stacks follow the tall-prop rule, by the height their one frame has.
 */
export function kitOccludes(kind: KitKind, height: KitHeight): boolean {
  if (kind === 'wall' || kind === 'tree' || kind === 'cliff') return height !== 'stub';
  return kitHeightPx(height) > TALL_PROP_PX;
}

/** A prop is an occluder when its frame rises more than `TALL_PROP_PX` above its pivot. */
export const propOccludes = (risePx: number): boolean => risePx > TALL_PROP_PX;

/** The frame name of one building slice (SPRITES 10.5). */
export const sliceFrame = (art: string, dx: number, dy: number): string => `${art}#${dx}_${dy}`;

/** A building or multi-tile prop footprint, in tiles. */
export interface Footprint {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * One def per footprint tile (SPRITES 10.5): every slice is placed at the footprint's centre ground point, because
 * each keeps the untrimmed canvas, and sorts by the centre of its own tile.
 */
export function sliceDefs(
  id: string,
  atlas: string,
  art: string,
  fp: Footprint,
  heightPx: number,
  bias: number = BIAS.kit,
): StaticDef[] {
  const out: StaticDef[] = [];
  const cx = (fp.x + fp.w / 2) * TILE_PX;
  const cy = (fp.y + fp.h / 2) * TILE_PX;
  for (let dy = 0; dy < fp.h; dy++)
    for (let dx = 0; dx < fp.w; dx++)
      out.push({
        id: `${id}#${dx}_${dy}`,
        atlas,
        frame: sliceFrame(art, dx, dy),
        x: cx,
        y: cy,
        depthX: (fp.x + dx + 0.5) * TILE_PX,
        depthY: (fp.y + dy + 0.5) * TILE_PX,
        bias,
        tilesW: 1,
        tilesH: 1,
        heightPx,
        occluder: true,
      });
  return out;
}

/** The depth key of a def. */
export const defDepth = (d: StaticDef): number => depthAt(d.depthX, d.depthY, d.bias);

// ---- fade ------------------------------------------------------------------------------------------------------

const LIGHT = metrics.lighting;

/** The screen rectangle of a standing character, from its feet (world px): 64 wide, `maxStandingSilhouettePx` high. */
export function characterRect(wx: number, wy: number): Rect {
  const s = toScreen(wx, wy);
  const height = metrics.maxStandingSilhouettePx;
  return { x: s.x - 32, y: s.y - height, width: 64, height };
}

export const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Only occluders anchored within this many tiles south or east of you are tested (SPRITES 10.7). */
export const FADE_REACH_TILES = 4;

/**
 * Whether an occluder at `def`'s depth anchor, with screen bounds `bounds`, should be faded for a viewer standing
 * at world (wx, wy): it is drawn in front (greater depth) within the reach south and east, and covers the viewer's
 * frame. Other characters never cause a fade (GDD 3.13).
 */
export function shouldFade(def: StaticDef, bounds: Rect, wx: number, wy: number): boolean {
  if (!def.occluder) return false;
  const dx = (def.depthX - wx) / TILE_PX;
  const dy = (def.depthY - wy) / TILE_PX;
  if (dx > FADE_REACH_TILES || dy > FADE_REACH_TILES) return false;
  if (defDepth(def) <= depthAt(wx, wy, BIAS.character)) return false;
  return overlaps(bounds, characterRect(wx, wy));
}

/** One step of the fade toward `target` (alpha 1 or `occluderFadeAlpha`), taking `occluderFadeS` for the whole way. */
export function stepFade(current: number, target: number, dtS: number): number {
  const span = 1 - LIGHT.occluderFadeAlpha;
  const step = (span * dtS) / LIGHT.occluderFadeS;
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
}

export const FADED_ALPHA = LIGHT.occluderFadeAlpha;

// ---- culling ---------------------------------------------------------------------------------------------------

/** The view is grown by this many tiles when culling statics (SPRITES 10.14). */
export const CULL_MARGIN_TILES = 2;

/** `view` (the camera's world view in screen px) grown by the cull margin. */
export function cullRect(view: Rect): Rect {
  const mx = CULL_MARGIN_TILES * ISO_TILE_W;
  const my = CULL_MARGIN_TILES * ISO_TILE_H;
  return { x: view.x - mx, y: view.y - my, width: view.width + mx * 2, height: view.height + my * 2 };
}

/** Whether the camera has moved far enough since the last cull to redo it: more than a tile. */
export function moved(prev: { x: number; y: number } | null, now: { x: number; y: number }): boolean {
  return prev === null || Math.hypot(now.x - prev.x, now.y - prev.y) > TILE_PX;
}

/** Screen bounds of the greybox prism of `def` standing at screen point `at` (its ground point). */
export function prismRect(
  def: Pick<StaticDef, 'tilesW' | 'tilesH' | 'heightPx'>,
  at: { x: number; y: number },
): Rect {
  const hw = (def.tilesW * TILE_PX) / 2;
  const hh = (def.tilesH * TILE_PX) / 2;
  const corners = [toScreen(-hw, -hh), toScreen(hw, -hh), toScreen(hw, hh), toScreen(-hw, hh)];
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys) - def.heightPx;
  return { x: at.x + left, y: at.y + top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}
