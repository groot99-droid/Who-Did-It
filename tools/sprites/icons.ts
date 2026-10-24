// The status icons of round 8 (8N, docs/round8/teardown.md 3; DECISIONS A172): every effect the game once named
// with a word, drawn as one small square that reads at HUD size. Each icon is a hand-built SVG master on the 48 px
// grid of SPRITES 9 (2 px ink stroke, round caps and joins, palette colours only) with one builder per icon and a
// `look` switch: `flat` is the faceted, hard-toned drawing the 8-bit and low-poly styles share, `hd` the same
// drawing with gradients, highlights and soft shadows. The masters are rasterised here through @napi-rs/canvas and
// finished like every other render (pixel.ts): the 8-bit style snaps and mode-halves the 48 px drawing to a 24 px
// cell, low poly box-halves and bleeds it, HD keeps the full drawing at its display size.
//
// The owner's brief for the first one (A168): "when a player is three tiles of someone bleeding it doesn't say
// bleeding there is a dagger partially stabbed in a white background with red and around it and seemingly dripping".
import { loadImage, createCanvas } from '@napi-rs/canvas';
import type { Rgba } from './bleed.ts';
import { paletteFile } from './palette.ts';
import { finishRender } from './pixel.ts';

/** The world ramps of palette.json, the only colours an icon may use (the pixel finish snaps to them). */
const R = paletteFile.world.ramps as Record<string, string[]>;
const c = (ramp: string, i: number): string => R[ramp]![i]!;
const INK = paletteFile.colors['ink']!;
/** The "white" ground of every icon: the bone ramp's lightest tone (the palette has no white in art, UI.md 2). */
export const GROUND = c('bone', 3);

export type IconLook = 'flat' | 'hd';

/** The effect icons, in `EffectId` order (constants.ts); `icon_effect_<id>` is the atlas frame and SVG stem. */
export const EFFECT_ICON_IDS = [
  'slowed',
  'wounded',
  'bleeding',
  'weakened',
  'poisoned',
  'fatigued',
  'stunned',
  'dazed',
  'famished',
  'knockedOut',
  'indebted',
] as const;
export type EffectIconId = (typeof EFFECT_ICON_IDS)[number];

/** The first sheet (teardown.md 3): bleeding first, in the owner's words, then five more for the look sign-off. */
export const FIRST_SHEET: readonly EffectIconId[] = [
  'bleeding',
  'wounded',
  'poisoned',
  'stunned',
  'dazed',
  'knockedOut',
];

export const GRID = 48;
/** The packed cell of the 8-bit and low-poly styles (half the grid, like every other packed sprite). */
export const CELL = 24;

type Pt = readonly [number, number];
const f1 = (n: number): string => String(Math.round(n * 10) / 10);
const pts = (list: readonly Pt[]): string => list.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ');

/** The stroke every shape carries: 2 px ink, round caps and joins (SPRITES 9). */
const STROKE = `stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;

interface Ctx {
  look: IconLook;
  defs: string[];
  n: number;
}

/** A fill: flat colour, or in HD a linear gradient from a lighter tone (top-left) to the colour (bottom-right). */
function fill(ctx: Ctx, colour: string, light?: string): string {
  if (ctx.look === 'flat' || light === undefined) return colour;
  const id = `g${ctx.n++}`;
  ctx.defs.push(
    `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${colour}"/></linearGradient>`,
  );
  return `url(#${id})`;
}

/**
 * A radial fill for round things: a highlight tone at the upper left fading to the colour. In user space with the
 * ellipse's own centre and radii: the rasteriser draws a bounding-box gradient on an ellipse as black.
 */
function radial(
  ctx: Ctx,
  colour: string,
  light: string | undefined,
  x: number,
  y: number,
  rx: number,
  ry: number,
): string {
  if (ctx.look === 'flat' || light === undefined) return colour;
  const id = `g${ctx.n++}`;
  const r = Math.max(rx, ry) * 1.35;
  ctx.defs.push(
    `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f1(x - rx * 0.3)}" cy="${f1(y - ry * 0.4)}" r="${f1(r)}"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${colour}"/></radialGradient>`,
  );
  return `url(#${id})`;
}

const poly = (ctx: Ctx, colour: string, list: readonly Pt[], light?: string, stroke = true): string =>
  `<polygon points="${pts(list)}" fill="${fill(ctx, colour, light)}" ${stroke ? STROKE : ''}/>`;
const ell = (
  ctx: Ctx,
  colour: string,
  x: number,
  y: number,
  rx: number,
  ry: number,
  light?: string,
  stroke = true,
): string =>
  `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${radial(ctx, colour, light, x, y, rx, ry)}" ${stroke ? STROKE : ''}/>`;
const path = (ctx: Ctx, colour: string, d: string, light?: string, stroke = true): string =>
  `<path d="${d}" fill="${fill(ctx, colour, light)}" ${stroke ? STROKE : ''}/>`;
const line = (colour: string, a: Pt, b: Pt, w: number): string =>
  `<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${colour}" stroke-width="${w}" stroke-linecap="round"/>`;
/** A small bright spot, HD only: the specular highlight the flat looks leave to a lighter facet. */
const shine = (ctx: Ctx, x: number, y: number, rx: number, ry: number, colour = c('bone', 3)): string =>
  ctx.look === 'hd'
    ? `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${colour}" opacity="0.7"/>`
    : '';

/** The square every icon sits on: paper with the ink stroke, a faint lower shade in HD. */
function tile(ctx: Ctx): string {
  const paper = ctx.look === 'hd' ? fill(ctx, c('bone', 2), GROUND) : GROUND;
  const shade =
    ctx.look === 'hd'
      ? `<rect x="2" y="2" width="44" height="44" rx="5" fill="none" stroke="${c('bone', 1)}" stroke-width="2" opacity="0.5"/>`
      : '';
  return `<rect x="1" y="1" width="46" height="46" rx="6" fill="${paper}" ${STROKE}/>${shade}`;
}

/** A hanging drip of blood or liquid from (x, y0) down to (x, y1), with its drop at the end. */
function drip(ctx: Ctx, ramp: string, x: number, y0: number, y1: number, w: number): string {
  const r = w / 2 + 1;
  return (
    path(
      ctx,
      c(ramp, 1),
      `M${f1(x - w / 2)},${f1(y0)} L${f1(x - w / 2)},${f1(y1 - r)} A${f1(r)},${f1(r)} 0 1 0 ${f1(x + w / 2)},${f1(y1 - r)} L${f1(x + w / 2)},${f1(y0)} Z`,
      c(ramp, 2),
    ) + shine(ctx, x - 0.8, y1 - r - 0.5, 0.8, 1.2)
  );
}

// ---------------------------------------------------------------- the icons

/** Bleeding: a dagger half driven into the paper, blood pooled around the wound and running down. */
function bleeding(ctx: Ctx): string {
  // The blade runs from the guard at B down-left into the paper at E; what is under the surface is not drawn.
  const B: Pt = [33, 13];
  const E: Pt = [19, 30];
  const d: Pt = [-0.636, 0.772];
  const p: Pt = [0.772, 0.636];
  const at = (o: Pt, along: number, across: number): Pt => [
    o[0] + d[0] * along + p[0] * across,
    o[1] + d[1] * along + p[1] * across,
  ];
  const blade = [at(B, 0, -3.5), at(B, 0, 3.5), at(E, 1, 2.6), at(E, 1, -2.6)];
  const ridge = [at(B, 0, 0), at(E, 0.5, 0), at(E, 0.5, -2.6), at(B, 0, -3.5)];
  const guard = [at(B, -1.5, -7.5), at(B, -1.5, 7.5), at(B, 1.5, 7.5), at(B, 1.5, -7.5)];
  const grip = [at(B, -1.5, -2.2), at(B, -1.5, 2.2), at(B, -10, 2), at(B, -10, -2)];
  const pommel = at(B, -11.5, 0);
  return [
    // The pool first, the blade over it, so the blade reads as entering the paper.
    ell(ctx, c('blood', 2), E[0] + 1.5, E[1] + 2, 12.5, 6.5, c('blood', 2)),
    ell(ctx, c('blood', 1), E[0] + 1.5, E[1] + 3, 7.5, 3, undefined, false),
    drip(ctx, 'blood', 12.5, 34, 41, 3.4),
    drip(ctx, 'blood', 20, 35, 45, 4.2),
    drip(ctx, 'blood', 27.5, 34.5, 39.5, 3),
    ell(ctx, c('blood', 2), 34.5, 42.5, 2, 2.5, c('blood', 2)),
    // The wound: a dark slit where the blade goes in.
    line(c('blood', 0), at(E, 0.5, -4), at(E, 0.5, 4), 2.5),
    poly(ctx, c('fog', 2), blade, c('bone', 3)),
    ctx.look === 'hd' ? '' : poly(ctx, c('fog', 1), ridge, undefined, false),
    poly(ctx, c('brass', 1), guard, c('brass', 2)),
    poly(ctx, c('wood', 2), grip, c('wood', 3)),
    line(INK, at(B, -4, -2), at(B, -4, 2), 1),
    line(INK, at(B, -7, -2), at(B, -7, 2), 1),
    ell(ctx, c('brass', 1), pommel[0], pommel[1], 2.6, 2.6, c('brass', 2)),
    shine(ctx, at(B, 3, -1.5)[0], at(B, 3, -1.5)[1], 1, 3),
    shine(ctx, E[0] - 4, E[1] + 1, 2, 0.9, c('blood', 2)),
  ].join('');
}

/** Wounded: a limb wrapped in bandage, blood soaking through the middle wrap. */
function wounded(ctx: Ctx): string {
  // The limb lies diagonally from bottom-left to top-right; the wraps cross it.
  const d: Pt = [0.707, -0.707];
  const p: Pt = [0.707, 0.707];
  const O: Pt = [24, 24];
  const at = (along: number, across: number): Pt => [
    O[0] + d[0] * along + p[0] * across,
    O[1] + d[1] * along + p[1] * across,
  ];
  const limb = `M${pts([at(-19, -6)])} L${pts([at(19, -6)])} A6,6 0 0 1 ${pts([at(19, 6)])} L${pts([at(-19, 6)])} A6,6 0 0 1 ${pts([at(-19, -6)])} Z`;
  const wrap = (s: number, w: number): string =>
    poly(
      ctx,
      c('bone', 2),
      [at(s - w, -7.5), at(s + w, -7.5), at(s + w + 1.5, 7.5), at(s - w + 1.5, 7.5)],
      c('bone', 3),
    );
  const wrapLine = (s: number): string => line(c('bone', 1), at(s, -7), at(s + 1.5, 7), 1);
  const blot: Pt = at(1, 0.5);
  return [
    path(ctx, c('skin', 3), limb, c('skin', 4)),
    ctx.look === 'hd'
      ? ''
      : path(
          ctx,
          c('skin', 2),
          `M${pts([at(-19, 2)])} L${pts([at(19, 2)])} A6,6 0 0 1 ${pts([at(19, 6)])} L${pts([at(-19, 6)])} A6,6 0 0 1 ${pts([at(-19, 2)])} Z`,
          undefined,
          false,
        ),
    wrap(-12, 3),
    wrapLine(-11),
    wrap(-4, 4),
    wrap(4, 4),
    wrap(12, 3),
    wrapLine(13),
    ell(ctx, c('blood', 2), blot[0], blot[1], 5.5, 4.6, c('blood', 2)),
    ell(ctx, c('blood', 1), blot[0] + 0.5, blot[1] + 1, 2.8, 2, undefined, false),
    shine(ctx, blot[0] - 2, blot[1] - 1.8, 1.4, 0.8, c('blood', 2)),
  ].join('');
}

/** Poisoned: a green skull, its cast dripping from the jaw. */
function poisoned(ctx: Ctx): string {
  const skull = `M13,21 A11,11 0 1 1 35,21 L34,27 L31,30 L31,34 L17,34 L17,30 L14,27 Z`;
  return [
    drip(ctx, 'moss', 19, 33, 42, 3.4),
    drip(ctx, 'moss', 26, 33, 45, 3.8),
    path(ctx, c('moss', 4), skull, c('moss', 5)),
    ctx.look === 'hd'
      ? ''
      : path(
          ctx,
          c('moss', 3),
          `M14,27 L17,30 L17,34 L31,34 L31,30 L34,27 L31,27 L17,27 Z`,
          undefined,
          false,
        ),
    ell(ctx, INK, 18.5, 20, 3.4, 3.8, undefined, false),
    ell(ctx, INK, 29.5, 20, 3.4, 3.8, undefined, false),
    poly(
      ctx,
      INK,
      [
        [24, 24],
        [22.2, 27.5],
        [25.8, 27.5],
      ],
      undefined,
      false,
    ),
    line(INK, [20.5, 30.5], [20.5, 34], 1.4),
    line(INK, [24, 30.5], [24, 34], 1.4),
    line(INK, [27.5, 30.5], [27.5, 34], 1.4),
    shine(ctx, 20, 13, 3, 1.6),
    ell(ctx, c('moss', 5), 37, 14, 1.6, 1.6, undefined, false),
    ell(ctx, c('moss', 5), 40, 9.5, 1.1, 1.1, undefined, false),
  ].join('');
}

/** Stunned: the spark of a hit, a burst of brass and lantern. */
function stunned(ctx: Ctx): string {
  const star = (cx: number, cy: number, n: number, ro: number, ri: number, rot: number): Pt[] =>
    Array.from({ length: n * 2 }, (_, i) => {
      const a = rot + (Math.PI * i) / n;
      const r = i % 2 === 0 ? ro : ri;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;
    });
  return [
    ctx.look === 'hd' ? `<circle cx="24" cy="24" r="19" fill="${c('lantern', 3)}" opacity="0.35"/>` : '',
    poly(ctx, c('lantern', 1), star(24, 24, 8, 19, 9, -Math.PI / 2), c('lantern', 3)),
    poly(ctx, c('lantern', 3), star(24, 24, 8, 11, 5.5, -Math.PI / 2 + Math.PI / 8), c('lantern', 4), false),
    ell(ctx, c('bone', 3), 24, 24, 3.2, 3.2, undefined, false),
    // Loose sparks.
    poly(ctx, c('lantern', 2), star(9, 11, 4, 3.2, 1.3, 0), undefined, false),
    poly(ctx, c('lantern', 2), star(39.5, 37, 4, 3.4, 1.4, 0), undefined, false),
    poly(ctx, c('lantern', 2), star(40, 9, 4, 2.4, 1, 0), undefined, false),
  ].join('');
}

/** Dazed: three stars wobbling round the head's orbit. */
function dazed(ctx: Ctx): string {
  const star = (cx: number, cy: number, ro: number, ri: number, rot: number): Pt[] =>
    Array.from({ length: 10 }, (_, i) => {
      const a = rot + (Math.PI * i) / 5;
      const r = i % 2 === 0 ? ro : ri;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;
    });
  const dash = ctx.look === 'hd' ? 'stroke-dasharray="4 3"' : '';
  const orbit = `<ellipse cx="24" cy="27" rx="17" ry="8" fill="none" stroke="${INK}" stroke-width="2" ${dash} stroke-linecap="round" transform="rotate(-14 24 27)"/>`;
  return [
    orbit,
    ctx.look === 'hd' ? `<circle cx="12" cy="20" r="10" fill="${c('brass', 2)}" opacity="0.25"/>` : '',
    poly(ctx, c('moon', 3), star(34, 14, 6.5, 2.9, -Math.PI / 2 + 0.3), c('moon', 5)),
    poly(ctx, c('brass', 2), star(12, 20, 8.5, 3.8, -Math.PI / 2), c('lantern', 3)),
    poly(ctx, c('brass', 2), star(33, 34, 7, 3.1, -Math.PI / 2 - 0.4), c('lantern', 3)),
    shine(ctx, 10, 17, 1.4, 0.9),
  ].join('');
}

/** Knocked out: a figure flat on the ground, out cold, the sleeper's zigzags rising from its head. */
function knockedOut(ctx: Ctx): string {
  const zig = (x: number, y: number, w: number, h: number, sw: number): string =>
    `<polyline points="${pts([
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ])}" fill="none" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
  const hd = ctx.look === 'hd';
  return [
    // The ground line.
    line(INK, [5, 41], [43, 41], 2),
    // The body lying along it: torso and legs as one capsule, the arm flung out, the head at the left.
    path(ctx, c('slate', 2), 'M18,31 L36,31 A5,5 0 0 1 36,41 L18,41 Z', c('slate', 3)),
    path(ctx, c('slate', 1), 'M36,31 L42,34.5 A3.2,3.2 0 0 1 39,41 L36,41 Z', c('slate', 2)),
    line(INK, [22, 31], [24.5, 25], 3.6),
    ell(ctx, c('skin', 3), 12.5, 34.5, 6.5, 6.5, c('skin', 4)),
    // Eyes shut.
    line(INK, [9, 33.5], [11.5, 33.5], 1.8),
    line(INK, [13.5, 33.5], [16, 33.5], 1.8),
    // The zigzags: two big ones the 24 px cell can hold, a third small one in HD.
    hd ? zig(6, 21, 6, 4, 2.2) : '',
    zig(hd ? 12 : 9, hd ? 12 : 15, hd ? 9 : 10, hd ? 6 : 7, 3),
    zig(hd ? 22 : 24, hd ? 3 : 4, hd ? 13 : 14, hd ? 8 : 9, 3.4),
  ].join('');
}

const BUILDERS: Partial<Record<EffectIconId, (ctx: Ctx) => string>> = {
  bleeding,
  wounded,
  poisoned,
  stunned,
  dazed,
  knockedOut,
};

/** The SVG master of an icon at `size` px (the viewBox is always the 48 grid). */
export function iconSvg(id: EffectIconId, look: IconLook, size = GRID): string {
  const build = BUILDERS[id];
  if (!build) throw new Error(`icons: ${id} is not drawn yet`);
  const ctx: Ctx = { look, defs: [], n: 0 };
  const body = tile(ctx) + build(ctx);
  const defs = ctx.defs.length ? `<defs>${ctx.defs.join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" width="${size}" height="${size}">${defs}${body}</svg>`;
}

/** Rasterises an SVG string at its own width and height. */
export async function rasterise(svg: string, px: number): Promise<Rgba> {
  const img = await loadImage(Buffer.from(svg));
  const canvas = createCanvas(px, px);
  const g = canvas.getContext('2d');
  g.drawImage(img, 0, 0, px, px);
  const d = g.getImageData(0, 0, px, px);
  return { width: px, height: px, data: new Uint8Array(d.data.buffer.slice(0)) };
}

export type IconStyleId = '8bit' | 'lowpoly' | 'hd';

/**
 * An icon finished for one art style: 8-bit is the flat master snapped to the world palette and mode-halved to
 * the 24 px cell; low poly the flat master box-halved and bled to the same cell; HD the gradient master at `hdPx`.
 */
export async function renderIcon(id: EffectIconId, style: IconStyleId, hdPx = GRID): Promise<Rgba> {
  if (style === 'hd') return rasterise(iconSvg(id, 'hd', hdPx), hdPx);
  const master = await rasterise(iconSvg(id, 'flat', GRID), GRID);
  return finishRender(master, style === '8bit');
}
