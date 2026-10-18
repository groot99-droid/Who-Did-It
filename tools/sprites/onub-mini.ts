// The mini-game atlas `onub_mini` (art plan 5.7): one 512 x 512 page at art size, drawn by the client at
// style.pixel.illustrationScale (3) with `nearest`. Generated objects are T5 cutouts fitted to their art box;
// dials, needles, fills, streams and glows are drawn in code; the fire loop cycles the oven mouth's flame
// pixels through the lantern ramp. No frame carries a target band: the client draws it (GDD 3.11).
//
//   tsx tools/sprites/onub-mini.ts      the atlas (also run by `onub.ts build`)
import { type Rgba } from './bleed.ts';
import { hexToRgb } from './oklab.ts';
import { indexOfRgb, paletteFile } from './palette.ts';
import { blankRgba, build, isMain, paste } from './onub.ts';

/** Every frame of the atlas with its art box; `item` names the batch item of a generated frame. */
export interface MiniFrame {
  name: string;
  w: number;
  h: number;
  item?: string;
  /** Pivot as a fraction of the frame (only the needle has one: its base). */
  pivot?: [number, number];
}

export const FIRE_FRAMES = 4;
export const MINI_FRAMES: readonly MiniFrame[] = [
  { name: 'mini_crate_butter', w: 24, h: 18, item: 'onub_mini#mini_crate_butter' },
  { name: 'mini_crate_milk', w: 24, h: 18, item: 'onub_mini#mini_crate_milk' },
  { name: 'mini_crate_eggs', w: 24, h: 18, item: 'onub_mini#mini_crate_eggs' },
  { name: 'mini_cart', w: 48, h: 32, item: 'onub_mini#mini_cart' },
  { name: 'mini_dial', w: 48, h: 48 },
  { name: 'mini_needle', w: 4, h: 20, pivot: [0.5, 0.9] },
  { name: 'mini_sack', w: 28, h: 32, item: 'onub_mini#mini_sack' },
  { name: 'mini_bucket', w: 24, h: 24, item: 'onub_mini#mini_bucket' },
  { name: 'mini_bowl', w: 64, h: 48, item: 'onub_mini#mini_bowl' },
  { name: 'mini_fill_flour', w: 8, h: 8 },
  { name: 'mini_fill_water', w: 8, h: 8 },
  { name: 'mini_stream_flour', w: 4, h: 8 },
  { name: 'mini_stream_water', w: 4, h: 8 },
  { name: 'mini_banneton', w: 28, h: 16, item: 'onub_mini#mini_banneton' },
  { name: 'mini_cabinet', w: 72, h: 88, item: 'onub_mini#mini_cabinet' },
  { name: 'mini_slot_glow', w: 28, h: 12 },
  { name: 'mini_log', w: 24, h: 10, item: 'onub_mini#mini_log' },
  ...Array.from({ length: FIRE_FRAMES }, (_, i) => ({
    name: `mini_oven/${i}`,
    w: 72,
    h: 48,
    item: 'onub_mini#mini_oven',
  })),
  { name: 'mini_gauge', w: 48, h: 48 },
];
/** The cleared inner window of `mini_bowl`, where the client draws the fill. */
export const BOWL_WINDOW = [8, 8, 48, 36] as const;
export const PAGE = 512;

const R = paletteFile.world.ramps;
const px = (img: Rgba, x: number, y: number, hex: string): void => {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  img.data.set([...hexToRgb(hex), 255], (y * img.width + x) * 4);
};

/** A round face with an ink rim and blank tick marks: the thermostat (`moon`) or the gauge (`brass`). */
function dial(rampName: 'moon' | 'brass'): Rgba {
  const img = blankRgba(48, 48);
  const r = R[rampName]!;
  const face = rampName === 'moon' ? R.moon![5]! : R.bone![3]!;
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      const d = Math.hypot(x - 23.5, y - 23.5);
      if (d > 23.5) continue;
      px(
        img,
        x,
        y,
        d > 22.5 ? '#12141C' : d > 19.5 ? r[Math.min(2, r.length - 1)]! : d > 18.5 ? r[0]! : face,
      );
    }
  // eleven ticks over the upper 270 degrees, the long ones every fifth
  for (let t = 0; t <= 10; t++) {
    const a = ((-225 + 27 * t) * Math.PI) / 180;
    const len = t % 5 === 0 ? 5 : 3;
    for (let s = 0; s < len; s++)
      px(
        img,
        Math.round(23.5 + Math.cos(a) * (17 - s)),
        Math.round(23.5 + Math.sin(a) * (17 - s)),
        '#1A1D29',
      );
  }
  return img;
}

/** The ink needle with a brass hub at its base (pivot (0.5, 0.9)), pointing up. */
function needle(): Rgba {
  const img = blankRgba(4, 20);
  for (let y = 0; y < 16; y++) for (let x = 1; x < 3; x++) px(img, x, y, '#12141C');
  for (let y = 16; y < 20; y++)
    for (let x = 0; x < 4; x++) px(img, x, y, x === 0 || x === 3 || y === 19 ? R.brass![0]! : R.brass![2]!);
  return img;
}

/** A tiling 8 x 8 fill: flour (bone) or water (moon), with a one-pixel speckle. */
function fillTile(kind: 'flour' | 'water'): Rgba {
  const img = blankRgba(8, 8);
  const [a, b] = kind === 'flour' ? [R.bone![3]!, R.bone![2]!] : [R.moon![3]!, R.moon![4]!];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) px(img, x, y, (x * 3 + y * 5) % 11 === 0 ? b : a);
  return img;
}

/** A tiling 4 x 8 stream: a two-pixel core with a lighter edge. */
function streamTile(kind: 'flour' | 'water'): Rgba {
  const img = blankRgba(4, 8);
  const [core, edge] = kind === 'flour' ? [R.bone![2]!, R.bone![3]!] : [R.moon![3]!, R.moon![5]!];
  for (let y = 0; y < 8; y++) {
    px(img, 1, y, core);
    px(img, 2, y, core);
    if (y % 4 === 0) px(img, 0, y, edge);
    if (y % 4 === 2) px(img, 3, y, edge);
  }
  return img;
}

/** A warm glow for a slot: lantern ramp, brightest at the centre line, cut to an ellipse. */
function slotGlow(): Rgba {
  const img = blankRgba(28, 12);
  const l = R.lantern!;
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 28; x++) {
      const d = Math.hypot((x - 13.5) / 14, (y - 5.5) / 6);
      if (d <= 1) px(img, x, y, l[Math.min(l.length - 1, Math.floor((1 - d) * l.length))]!);
    }
  return img;
}

/** `mini_bowl` with its inner window cleared for the fill. */
export function clearBowl(bowl: Rgba): Rgba {
  const out: Rgba = { width: bowl.width, height: bowl.height, data: new Uint8Array(bowl.data) };
  const [x0, y0, w, h] = BOWL_WINDOW;
  for (let y = y0; y < y0 + h; y++) out.data.fill(0, (y * out.width + x0) * 4, (y * out.width + x0 + w) * 4);
  return out;
}

/** The fire loop: frame f moves every lantern-ramp pixel f steps up its ramp, wrapping (R5 over R3). */
export function fireFrames(oven: Rgba): Rgba[] {
  const lantern = R.lantern!.map((h) => indexOfRgb(...hexToRgb(h)));
  return Array.from({ length: FIRE_FRAMES }, (_, f) => {
    const out: Rgba = { width: oven.width, height: oven.height, data: new Uint8Array(oven.data) };
    for (let i = 0; i < out.data.length; i += 4) {
      if (out.data[i + 3] === 0) continue;
      const at = lantern.indexOf(indexOfRgb(out.data[i]!, out.data[i + 1]!, out.data[i + 2]!));
      if (at < 0) continue;
      out.data.set(hexToRgb(R.lantern![(at + f) % lantern.length]!), i);
    }
    return out;
  });
}

/** Every frame's pixels; `objects` maps a batch item to its fitted cutout (or null for a greybox). */
export function miniPixels(objects: (item: string, w: number, h: number) => Rgba): Map<string, Rgba> {
  const out = new Map<string, Rgba>();
  const fire = fireFrames(objects('onub_mini#mini_oven', 72, 48));
  for (const f of MINI_FRAMES) {
    if (f.name.startsWith('mini_oven/')) out.set(f.name, fire[Number(f.name.slice(10))]!);
    else if (f.item)
      out.set(
        f.name,
        f.name === 'mini_bowl' ? clearBowl(objects(f.item, f.w, f.h)) : objects(f.item, f.w, f.h),
      );
  }
  out.set('mini_dial', dial('moon'));
  out.set('mini_gauge', dial('brass'));
  out.set('mini_needle', needle());
  out.set('mini_fill_flour', fillTile('flour'));
  out.set('mini_fill_water', fillTile('water'));
  out.set('mini_stream_flour', streamTile('flour'));
  out.set('mini_stream_water', streamTile('water'));
  out.set('mini_slot_glow', slotGlow());
  return out;
}

/** Shelf-pack the frames (tallest first, 1 px gap) onto one page; the Phaser multiatlas JSON beside it. */
export function packMini(
  frames: Map<string, Rgba>,
  image = 'onub_mini-0.png',
): { page: Rgba; json: unknown } {
  let page = blankRgba(PAGE, PAGE);
  const order = MINI_FRAMES.map((f) => f.name).sort((a, b) => {
    const fa = frames.get(a)!;
    const fb = frames.get(b)!;
    return fb.height - fa.height || fb.width - fa.width || a.localeCompare(b);
  });
  const out: unknown[] = [];
  let x = 1;
  let y = 1;
  let shelf = 0;
  for (const name of order) {
    const img = frames.get(name)!;
    if (x + img.width + 1 > PAGE) {
      x = 1;
      y += shelf + 1;
      shelf = 0;
    }
    if (y + img.height + 1 > PAGE) throw new Error('onub-mini: the frames do not fit one page');
    page = paste(page, img, x, y);
    const meta = MINI_FRAMES.find((f) => f.name === name)!;
    out.push({
      filename: name,
      rotated: false,
      trimmed: false,
      sourceSize: { w: img.width, h: img.height },
      spriteSourceSize: { x: 0, y: 0, w: img.width, h: img.height },
      frame: { x, y, w: img.width, h: img.height },
      ...(meta.pivot ? { pivot: { x: meta.pivot[0], y: meta.pivot[1] } } : {}),
    });
    x += img.width + 1;
    shelf = Math.max(shelf, img.height);
  }
  out.sort((a, b) => ((a as { filename: string }).filename < (b as { filename: string }).filename ? -1 : 1));
  const json = {
    textures: [{ image, format: 'RGBA8888', size: { w: PAGE, h: PAGE }, scale: 1, frames: out }],
  };
  return { page, json };
}

if (isMain(import.meta.url)) await build({ only: 'mini' });
