// Code-drawn M5b art (route R5, art plan 1.5) at display scale, in the world ramps of palette.json: the
// resource nodes, the held tools and the light glows. m5b.ts finishes and packs them for each style.
import type { SKRSContext2D } from '@napi-rs/canvas';
import type { Dir } from './keys.ts';
import { paletteFile } from './palette.ts';

const R = paletteFile.world.ramps as Record<string, string[]>;
const c = (ramp: string, i: number): string => R[ramp]![i]!;
const INK = c('ink', 1);

type Pt = readonly [number, number];

function poly(g: SKRSContext2D, fill: string, pts: readonly Pt[], line = 2): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (line) {
    g.lineWidth = line;
    g.lineJoin = 'round';
    g.strokeStyle = INK;
    g.stroke();
  }
}

function ell(g: SKRSContext2D, fill: string, x: number, y: number, rx: number, ry: number, line = 2): void {
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  if (line) {
    g.lineWidth = line;
    g.strokeStyle = INK;
    g.stroke();
  }
}

function seg(g: SKRSContext2D, colour: string, a: Pt, b: Pt, width: number): void {
  g.beginPath();
  g.moveTo(...a);
  g.lineTo(...b);
  g.lineCap = 'round';
  g.lineWidth = width;
  g.strokeStyle = colour;
  g.stroke();
}

/** A bar outlined in ink: an ink stroke `width + 4` under a coloured one. */
function bar(g: SKRSContext2D, colour: string, a: Pt, b: Pt, width: number): void {
  seg(g, INK, a, b, width + 4);
  seg(g, colour, a, b, width);
}

// ---------------------------------------------------------------- nodes (ground point at `o`)

/** A log lying along the iso x axis, its cut end at (x, y). */
function log(g: SKRSContext2D, x: number, y: number, r: number, len: number): void {
  const [dx, dy] = [len * 0.894, -len * 0.447];
  ell(g, c('wood', 2), x + dx, y + dy, r * 0.55, r);
  poly(g, c('wood', 3), [
    [x, y - r],
    [x + dx, y + dy - r],
    [x + dx, y + dy + r],
    [x, y + r],
  ]);
  seg(g, c('wood', 4), [x + 2, y - r + 4], [x + dx, y + dy - r + 4], 3);
  ell(g, c('plaster', 2), x, y, r * 0.55, r);
  ell(g, c('wood', 4), x, y, r * 0.28, r * 0.5, 0);
}

/** An irregular boulder of radius s, its top facet a step lighter. */
function rock(g: SKRSContext2D, x: number, y: number, s: number, ramp: string, tone: number): void {
  const at = (pts: readonly Pt[]) => pts.map(([px, py]) => [x + px * s, y + py * s * 0.8] as const);
  poly(
    g,
    c(ramp, tone),
    at([
      [-1, 0.2],
      [-0.7, -0.6],
      [0, -0.9],
      [0.7, -0.55],
      [1, 0.15],
      [0.4, 0.55],
      [-0.4, 0.55],
    ]),
  );
  poly(
    g,
    c(ramp, tone + 1),
    at([
      [-0.62, -0.55],
      [0, -0.8],
      [0.62, -0.5],
      [0.2, -0.18],
      [-0.4, -0.22],
    ]),
    0,
  );
}

/** A trunk of the given height standing on the ground point, its broken top a ring of plaster. */
function trunk(g: SKRSContext2D, o: Pt, h: number): void {
  const [x, y] = o;
  ell(g, c('wood', 1), x, y, 13, 6);
  poly(g, c('wood', 2), [
    [x - 12, y - h],
    [x + 12, y - h],
    [x + 12, y],
    [x - 12, y],
  ]);
  for (const bx of [-6, 1, 7]) seg(g, c('wood', 1), [x + bx, y - h + 8], [x + bx, y - 4], 2);
  ell(g, c('plaster', 1), x, y - h, 12, 6);
  ell(g, c('wood', 4), x, y - h, 6, 3, 0);
}

function drip(g: SKRSContext2D, x: number, y: number): void {
  ell(g, c('lantern', 0), x, y, 3.5, 6);
  ell(g, c('lantern', 3), x - 1, y - 2, 1.5, 2, 0);
}

function leaf(g: SKRSContext2D, x: number, y: number, r: number, tone: number): void {
  ell(g, c('moss', tone), x, y, r, r * 0.75);
}

function mushroom(g: SKRSContext2D, x: number, y: number, s: number): void {
  poly(g, c('bone', 2), [
    [x - s * 0.3, y],
    [x + s * 0.3, y],
    [x + s * 0.25, y - s],
    [x - s * 0.25, y - s],
  ]);
  g.beginPath();
  g.ellipse(x, y - s, s, s * 0.75, 0, Math.PI, 0);
  g.closePath();
  g.fillStyle = c('brick', 3);
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = INK;
  g.stroke();
  ell(g, c('bone', 3), x - s * 0.4, y - s * 1.35, s * 0.18, s * 0.14, 0);
  ell(g, c('bone', 3), x + s * 0.35, y - s * 1.2, s * 0.15, s * 0.12, 0);
}

export function drawNode(g: SKRSContext2D, id: string, state: 'ready' | 'spent', o: Pt): void {
  const [x, y] = o;
  const ready = state === 'ready';
  switch (id) {
    case 'timber':
      if (ready) {
        log(g, x - 30, y - 10, 10, 40);
        log(g, x - 10, y, 10, 40);
        log(g, x - 20, y - 24, 10, 40);
      } else {
        trunk(g, o, 14);
        for (const [cx, cy] of [
          [x - 22, y + 2],
          [x + 20, y - 2],
          [x + 8, y + 8],
        ] as const)
          poly(g, c('plaster', 1), [
            [cx - 4, cy],
            [cx + 3, cy - 2],
            [cx + 4, cy + 2],
          ]);
      }
      return;
    case 'stone':
      if (ready) {
        rock(g, x - 2, y - 16, 15, 'stone', 3);
        rock(g, x - 16, y - 4, 18, 'stone', 3);
        rock(g, x + 14, y - 2, 15, 'stone', 2);
      } else {
        rock(g, x - 12, y - 2, 7, 'stone', 2);
        rock(g, x + 8, y, 6, 'stone', 3);
        rock(g, x - 2, y - 8, 5, 'stone', 2);
      }
      return;
    case 'tinOre':
      if (ready) {
        rock(g, x, y - 12, 28, 'stone', 1);
        for (const [cx, cy, s] of [
          [x - 10, y - 18, 6],
          [x + 8, y - 24, 5],
          [x + 6, y - 8, 4],
          [x - 14, y - 6, 3],
        ] as const) {
          poly(g, c('moon', 2), [
            [cx, cy - s * 1.4],
            [cx + s, cy],
            [cx, cy + s * 0.8],
            [cx - s, cy],
          ]);
          poly(
            g,
            c('moon', 4),
            [
              [cx, cy - s * 1.2],
              [cx + s * 0.6, cy - s * 0.2],
              [cx, cy],
            ],
            0,
          );
        }
      } else {
        rock(g, x - 10, y - 4, 16, 'stone', 1);
        rock(g, x + 12, y - 2, 13, 'stone', 1);
        ell(g, c('stone', 0), x + 1, y - 8, 7, 3.5, 0);
      }
      return;
    case 'resin':
      trunk(g, o, 44);
      if (ready) {
        drip(g, x - 6, y - 30);
        drip(g, x + 5, y - 22);
        drip(g, x - 2, y - 12);
      } else
        for (const [sx, sy] of [
          [x - 5, y - 32],
          [x + 4, y - 20],
        ] as const)
          poly(
            g,
            c('plaster', 2),
            [
              [sx - 2, sy - 6],
              [sx + 2, sy - 6],
              [sx + 1, sy + 6],
              [sx - 1, sy + 6],
            ],
            0,
          );
      return;
    case 'herb':
      if (ready) {
        for (const [lx, ly, r, t] of [
          [x - 12, y - 10, 10, 2],
          [x + 12, y - 10, 10, 2],
          [x, y - 20, 11, 3],
          [x - 6, y - 4, 9, 3],
          [x + 8, y - 2, 9, 3],
        ] as const)
          leaf(g, lx, ly, r, t);
        for (const [fx, fy] of [
          [x - 8, y - 22],
          [x + 6, y - 16],
          [x - 14, y - 12],
          [x + 14, y - 8],
        ] as const)
          ell(g, c('bone', 3), fx, fy, 2.5, 2.5, 1);
      } else {
        for (const sx of [-8, -2, 5, 10]) seg(g, c('moss', 2), [x + sx, y], [x + sx + 1, y - 7], 3);
        leaf(g, x - 10, y - 2, 4, 1);
        leaf(g, x + 9, y - 1, 4, 1);
      }
      return;
    case 'mushroom':
      if (ready) {
        mushroom(g, x - 14, y - 2, 9);
        mushroom(g, x + 2, y - 8, 13);
        mushroom(g, x + 16, y + 2, 8);
      } else
        for (const [sx, sy] of [
          [x - 12, y],
          [x + 2, y - 6],
          [x + 14, y + 2],
        ] as const)
          poly(g, c('bone', 1), [
            [sx - 3, sy],
            [sx + 3, sy],
            [sx + 2, sy - 5],
            [sx - 2, sy - 5],
          ]);
      return;
    default:
      throw new Error(`m5b: no node art for ${id}`);
  }
}

// ---------------------------------------------------------------- held tools (grip at `hand`)

/** Facing left on screen, the tool is mirrored so it always hangs away from the body. */
const MIRRORED: readonly Dir[] = ['n', 'sw', 'w', 'nw'];

export function drawHeld(g: SKRSContext2D, tool: string, dir: Dir, hand: Pt): void {
  g.save();
  g.translate(hand[0], hand[1]);
  if (MIRRORED.includes(dir)) g.scale(-1, 1);
  switch (tool) {
    case 'torch':
      bar(g, c('wood', 3), [-2, 12], [4, -24], 4);
      bar(g, c('plaster', 1), [3, -18], [4, -24], 5);
      poly(g, c('lantern', 1), [
        [5, -42],
        [12, -28],
        [5, -22],
        [-2, -28],
      ]);
      poly(
        g,
        c('lantern', 3),
        [
          [5, -36],
          [8, -28],
          [5, -25],
          [2, -28],
        ],
        0,
      );
      break;
    case 'lantern':
      seg(g, INK, [0, 0], [0, 8], 2);
      poly(g, c('brass', 1), [
        [-6, 8],
        [6, 8],
        [9, 12],
        [-9, 12],
      ]);
      poly(g, c('lantern', 3), [
        [-7, 12],
        [7, 12],
        [7, 26],
        [-7, 26],
      ]);
      seg(g, c('brass', 0), [0, 12], [0, 26], 2);
      poly(g, c('brass', 1), [
        [-9, 26],
        [9, 26],
        [8, 30],
        [-8, 30],
      ]);
      break;
    case 'snare':
      seg(g, c('litter', 2), [0, 0], [2, 8], 3);
      g.lineWidth = 6;
      g.strokeStyle = INK;
      for (const k of [0, 1]) {
        g.beginPath();
        g.ellipse(3, 18, 9, 11, 0, 0, Math.PI * 2);
        if (k) {
          g.lineWidth = 3;
          g.strokeStyle = c('litter', 2);
        }
        g.stroke();
      }
      ell(g, c('plaster', 1), 3, 7, 2.5, 2.5, 1);
      break;
    case 'spade':
      bar(g, c('wood', 4), [-6, -22], [8, 26], 4);
      bar(g, c('wood', 3), [-11, -24], [-1, -20], 3);
      poly(g, c('stone', 3), [
        [3, 24],
        [14, 21],
        [19, 38],
        [10, 44],
      ]);
      seg(g, c('stone', 5), [11, 42], [18, 37], 2);
      break;
    case 'lockpicks':
      g.beginPath();
      g.ellipse(0, 3, 4, 4, 0, 0, Math.PI * 2);
      g.lineWidth = 5;
      g.strokeStyle = INK;
      g.stroke();
      g.lineWidth = 2;
      g.strokeStyle = c('brass', 1);
      g.stroke();
      for (const t of [-1, 0, 1]) seg(g, c('stone', 5), [t * 2, 8], [t * 6, 22], 3);
      break;
    case 'crowbar':
      bar(g, c('slate', 1), [-4, -20], [6, 26], 4);
      seg(g, c('slate', 3), [-3, -16], [5, 22], 1);
      g.beginPath();
      g.arc(-9, -21, 5, -0.2, Math.PI, true);
      g.lineCap = 'round';
      g.lineWidth = 8;
      g.strokeStyle = INK;
      g.stroke();
      g.lineWidth = 4;
      g.strokeStyle = c('slate', 1);
      g.stroke();
      bar(g, c('slate', 1), [6, 26], [11, 29], 4);
      break;
    default:
      throw new Error(`m5b: no held art for ${tool}`);
  }
  g.restore();
}

// ---------------------------------------------------------------- glows (centre of a 64 px cell)

const GLOW_RAMPS: Record<string, { scale: number[]; colours: string[] }> = {
  lantern: {
    scale: [1, 0.93, 0.97, 0.9],
    colours: [c('wood', 2), c('brick', 2), c('lantern', 0), c('lantern', 3)],
  },
  torch: {
    scale: [1, 0.86, 0.95, 0.8],
    colours: [c('brick', 1), c('brick', 3), c('lantern', 0), c('lantern', 3)],
  },
};

/**
 * An additive halo: concentric bands, dimmest outside, scaled per flicker frame. `smooth` (low poly) draws
 * the same colours as one radial gradient fading to transparent at the rim.
 */
export function drawGlow(g: SKRSContext2D, glow: string, n: number, smooth: boolean): void {
  const ramp = GLOW_RAMPS[glow];
  if (!ramp) throw new Error(`m5b: no glow ${glow}`);
  const radius = 30 * ramp.scale[n % ramp.scale.length]!;
  if (smooth) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, radius);
    [...ramp.colours].reverse().forEach((col, i) => grad.addColorStop(i / ramp.colours.length, col));
    grad.addColorStop(1, `${ramp.colours[0]!}00`);
    g.beginPath();
    g.arc(32, 32, radius, 0, Math.PI * 2);
    g.fillStyle = grad;
    g.fill();
    return;
  }
  ramp.colours.forEach((col, i) => {
    const r = radius * (1 - i / ramp.colours.length);
    ell(g, col, 32, 32, r, r, 0);
  });
}
