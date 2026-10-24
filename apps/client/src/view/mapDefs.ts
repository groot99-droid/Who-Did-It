// Turns a scene's tilemap objects into the static sprites the World draws (SPRITES 10.12, 10.13). Pure: the caller says
// which atlas frames exist, and a missing frame falls back to the greybox block of 10.13.
import { TILE_PX } from '@wdi/shared/constants';
import type { MapObject, SceneMap } from './sceneMap';
import {
  type Footprint,
  type StaticDef,
  kitHeightPx,
  kitOccludes,
  parseKitFrame,
  propOccludes,
  sliceDefs,
} from './statics';
import { BIAS } from './iso';

export interface DefContext {
  mapId: string;
  theme: string;
  hasFrame(atlas: string, frame: string): boolean;
}

/** Props that draw a labelled greybox when their art is missing; `decor` and `teachingClue` draw nothing (SPRITES 10.13). */
export const INTERACTABLE_PROPS: Record<string, string> = {
  bell: 'Bell',
  pump: 'Pump',
  noticeBoard: 'Board',
  kitChest: 'Chest',
  basin: 'Basin',
  taskSource: 'Task',
  lanternPost: 'Lamp',
  oven: 'Oven',
};

/** Height in screen px of the greybox of a prop kind, and of a building. */
const PROP_BOX_PX: Record<string, number> = { lanternPost: 140, bell: 110, noticeBoard: 90, oven: 90 };
const DEFAULT_PROP_BOX_PX = 60;
const BUILDING_BOX_PX = 200;
const SPOT_BOX_PX = 28;
const PORTAL_BOX_PX = 56;

const tile = (o: MapObject) => ({ tx: Math.round(o.x / TILE_PX), ty: Math.round(o.y / TILE_PX) });
const centre = (tx: number, ty: number) => ({ x: (tx + 0.5) * TILE_PX, y: (ty + 0.5) * TILE_PX });

/** `x,y,w,h` in tiles, or null when it is not four non-negative integers with a positive size. */
export function parseFootprint(text: unknown): Footprint | null {
  if (typeof text !== 'string') return null;
  const n = text.split(',').map(Number);
  if (n.length !== 4 || n.some((v) => !Number.isInteger(v) || v < 0) || n[2]! < 1 || n[3]! < 1) return null;
  return { x: n[0]!, y: n[1]!, w: n[2]!, h: n[3]! };
}

/** The atlases a map's props are looked up in, in order (SPRITES 10.13). */
export const propAtlases = (ctx: DefContext) => [`props_${ctx.mapId}`, `bld_${ctx.mapId}`, 'props'];

/** The first `(atlas, frame)` that exists, atlases in lookup order and frames in the order given. */
function find(ctx: DefContext, frames: string[]): { atlas: string; frame: string } | null {
  for (const atlas of propAtlases(ctx))
    for (const frame of frames) if (ctx.hasFrame(atlas, frame)) return { atlas, frame };
  return null;
}

const base = (id: string, x: number, y: number): StaticDef => ({
  id,
  atlas: '',
  frame: '',
  x,
  y,
  depthX: x,
  depthY: y,
  bias: BIAS.kit,
  tilesW: 1,
  tilesH: 1,
  heightPx: 0,
  occluder: false,
});

function solidDef(o: MapObject, ctx: DefContext): StaticDef | null {
  const kit = parseKitFrame(o.type);
  if (!kit) return null;
  const { tx, ty } = tile(o);
  const c = centre(tx, ty);
  return {
    ...base(`solid.${tx},${ty}`, c.x, c.y),
    atlas: `iso_kit_${ctx.theme}`,
    frame: o.type,
    heightPx: kitHeightPx(kit.height),
    occluder: typeof o.props.occluder === 'boolean' ? o.props.occluder : kitOccludes(kit.kind, kit.height),
  };
}

/**
 * The art stems a prop is looked up by, in order (SPRITES 3): its kind, its id tail, then the tail without a
 * trailing `_<n>`, so `bm.ore_cart_0` and `bw.kiln_1` share one frame.
 */
export function propStems(kind: string, id: string): string[] {
  const tail = id.includes('.') ? id.slice(id.indexOf('.') + 1) : id;
  return [...new Set([kind, tail, tail.replace(/_\d+$/, '')])];
}

function propDefs(o: MapObject, ctx: DefContext): StaticDef[] {
  const stems = propStems(o.type, o.name);
  const label = INTERACTABLE_PROPS[o.type];
  const boxPx = PROP_BOX_PX[o.type] ?? DEFAULT_PROP_BOX_PX;
  const fp = parseFootprint(o.props.footprint);
  if (fp && (fp.w > 1 || fp.h > 1)) {
    const art = find(
      ctx,
      stems.map((s) => `prop_${s}#0_0`),
    );
    if (art)
      return sliceDefs(o.name, art.atlas, art.frame.slice(0, -'#0_0'.length), fp, boxPx).map((d) => ({
        ...d,
        occluder: false,
        autoOccluder: true,
      }));
    if (label === undefined) return [];
    const c = centre(fp.x + (fp.w - 1) / 2, fp.y + (fp.h - 1) / 2);
    return [
      {
        ...base(o.name, c.x, c.y),
        tilesW: fp.w,
        tilesH: fp.h,
        heightPx: boxPx,
        occluder: propOccludes(boxPx),
        label,
      },
    ];
  }
  const { tx, ty } = tile(o);
  const c = centre(tx, ty);
  const lit = o.type === 'lanternPost' ? find(ctx, [`prop_${o.type}_lit`]) : null;
  const art =
    lit ??
    find(
      ctx,
      stems.map((s) => `prop_${s}`),
    );
  if (art) {
    const def: StaticDef = {
      ...base(o.name, c.x, c.y),
      atlas: art.atlas,
      frame: art.frame,
      autoOccluder: true,
      heightPx: boxPx,
    };
    if (lit) def.frameAlt = `prop_${o.type}_unlit`;
    return [def];
  }
  if (label === undefined) return [];
  return [
    { ...base(o.name, c.x, c.y), heightPx: boxPx, occluder: propOccludes(boxPx), label, colour: 'slate' },
  ];
}

function spotDef(o: MapObject, ctx: DefContext): StaticDef {
  const { tx, ty } = tile(o);
  const c = centre(tx, ty);
  const variant = typeof o.props.variant === 'string' ? o.props.variant : o.type;
  const art = find(ctx, [`spot_${variant}`]);
  const colour = o.type === 'hide' ? 'teal' : o.type === 'body' ? 'blood' : 'fog';
  return art
    ? { ...base(o.name, c.x, c.y), atlas: art.atlas, frame: art.frame, heightPx: SPOT_BOX_PX }
    : { ...base(o.name, c.x, c.y), tilesW: 0.8, tilesH: 0.8, heightPx: SPOT_BOX_PX, colour };
}

/** `portal_<kind>_<face>`, or the flat frames of a hatch and a drop (SPRITES 10.12). */
export function portalFrame(kind: string, face: string | null): string | null {
  if (kind === 'hatch' || kind === 'drop') return `portal_${kind}`;
  return face === null ? null : `portal_${kind}_${face}`;
}

function portalDefs(p: SceneMap['portals'][number], ctx: DefContext): StaticDef[] {
  const out: StaticDef[] = [];
  const tx = Math.floor(p.x / TILE_PX);
  const ty = Math.floor(p.y / TILE_PX);
  const c = centre(tx, ty);
  const name = portalFrame(p.kind, p.face);
  const art = !p.inBuilding && name !== null ? find(ctx, [name]) : null;
  if (art) out.push({ ...base(p.id, c.x, c.y), atlas: art.atlas, frame: art.frame, heightPx: PORTAL_BOX_PX });
  else if (!p.inBuilding)
    out.push({
      ...base(p.id, c.x, c.y),
      tilesW: 0.9,
      tilesH: 0.9,
      heightPx: p.kind === 'hatch' || p.kind === 'drop' ? 6 : PORTAL_BOX_PX,
      colour: 'mustard',
    });
  if (p.face !== null) {
    const boarded = find(ctx, [`portal_boarded_${p.face}`]);
    if (boarded)
      out.push({
        ...base(`${p.id}~boarded`, c.x, c.y),
        atlas: boarded.atlas,
        frame: boarded.frame,
        bias: BIAS.overlay,
        hidden: true,
      });
  }
  return out;
}

/** Every static world sprite of a scene (SPRITES 10.12): solids, building slices, props, spots and portal frames. */
export function mapStatics(map: SceneMap, ctx: DefContext): StaticDef[] {
  const out: StaticDef[] = [];
  for (const o of map.solids) {
    const d = solidDef(o, ctx);
    if (d) out.push(d);
  }
  for (const o of map.buildings) {
    const art = typeof o.props.art === 'string' ? o.props.art : o.name;
    const fp = {
      x: Math.round(o.x / TILE_PX),
      y: Math.round(o.y / TILE_PX),
      w: Math.round(o.width / TILE_PX),
      h: Math.round(o.height / TILE_PX),
    };
    if (fp.w < 1 || fp.h < 1) continue;
    out.push(...sliceDefs(o.name, `bld_${ctx.mapId}`, art, fp, BUILDING_BOX_PX));
  }
  for (const o of map.props) out.push(...propDefs(o, ctx));
  for (const o of map.interact) out.push(spotDef(o, ctx));
  for (const p of map.portals) out.push(...portalDefs(p, ctx));
  return out;
}
