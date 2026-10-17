// Placeholder art for every key in docs/SPRITES.md 8, so playtests run before real art (ROADMAP 7.3).
// tsx tools/sprites/placeholder.ts [out dir]   (default apps/client/public/assets/placeholder)
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import type { FeetManifest } from './gen-anims.ts';
import {
  CELL_PX,
  CLIP_CELL,
  DIRECTIONS,
  FEET_ROW_PX,
  PASSES,
  V1_CLIPS,
  frameFileName,
  frameKey,
  type Anim,
  type Dir,
  type Pass,
} from './keys.ts';
import { LOFT_KEYS, PROP_KEYS, VFX_CLIPS, staticFrameNames } from './keys.ts';
import { IMAGE_SIZES } from './images.ts';
import { atlasJson, packCharacter, packFrames, writeFiles, type PackInput } from './pack.ts';
import { packStatic, type StaticManifest } from './pack-static.ts';

// docs/ASSETS.md 6.1. TODO: read packages/content/data/palette.json once @wdi/content merges.
export const PALETTE = {
  ink: '#12141C',
  slate: '#2C3240',
  fog: '#6F7A8C',
  bone: '#D9D2C2',
  mustard: '#F2B33D',
  teal: '#2EC4B6',
  magenta: '#E04E9A',
  blood: '#B3121F',
  lantern: '#FFB457',
  moon: '#7FA8FF',
} as const;
type Token = keyof typeof PALETTE;

export const BODY = 'villager';
// Scarf tints proposed in SPRITES.md 7; mud tints dark / mid / light.
const SCARF: Record<string, Token> = { red: 'blood', green: 'teal', blue: 'moon' };
const MUD: Record<string, Token> = { dark: 'ink', mid: 'slate', light: 'fog' };

/** Small-profile buildings (SPRITES.md 8): id, label, footprint in tiles (w, d). */
export const BUILDINGS = [
  { id: 'tavern', label: 'The Drowned Lantern', w: 8, d: 5 },
  { id: 'apoth', label: 'Mallory Apothecary', w: 6, d: 4 },
  { id: 'widow', label: 'Widow Vane', w: 6, d: 4 },
  { id: 'bakery', label: "Crumb's Ovens", w: 6, d: 4 },
] as const;

export const TILESETS: Record<string, { base: Token; fleck: Token; kind: 'specks' | 'stones' | 'planks' }> = {
  grass: { base: 'slate', fleck: 'teal', kind: 'specks' },
  path: { base: 'fog', fleck: 'slate', kind: 'specks' },
  cobble: { base: 'slate', fleck: 'fog', kind: 'stones' },
  floorboards: { base: 'fog', fleck: 'slate', kind: 'planks' },
  caverock: { base: 'ink', fleck: 'slate', kind: 'stones' },
  forestfloor: { base: 'slate', fleck: 'moon', kind: 'specks' },
};

const FONT = 'WdiInter';
let fontReady = false;
function registerFont(): void {
  if (fontReady) return;
  const require = createRequire(import.meta.url);
  const dir = dirname(require.resolve('@fontsource/inter/package.json'));
  GlobalFonts.registerFromPath(join(dir, 'files', 'inter-latin-600-normal.woff2'), FONT);
  fontReady = true;
}

const DIR_VEC: Record<Dir, [number, number]> = {
  n: [0, -1],
  ne: [0.7071, -0.7071],
  e: [1, 0],
  se: [0.7071, 0.7071],
  s: [0, 1],
  sw: [-0.7071, 0.7071],
  w: [-1, 0],
  nw: [-0.7071, -0.7071],
};

/** Deterministic PRNG (mulberry32), same as @wdi/shared. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function shape(g: SKRSContext2D, fill: Token, draw: () => void, stroke = true): void {
  g.beginPath();
  draw();
  g.fillStyle = PALETTE[fill];
  g.fill();
  if (stroke) {
    g.lineWidth = 2;
    g.lineJoin = g.lineCap = 'round';
    g.strokeStyle = PALETTE.ink;
    g.stroke();
  }
}

function label(g: SKRSContext2D, text: string, x: number, y: number, size = 9): void {
  g.font = `${size}px ${FONT}`;
  const w = Math.ceil(g.measureText(text).width) + 4;
  g.fillStyle = PALETTE.bone;
  g.fillRect(Math.round(x - w / 2), y - size, w, size + 3);
  g.fillStyle = PALETTE.ink;
  g.textAlign = 'center';
  g.fillText(text, x, y);
}

// ---------------------------------------------------------------- characters

/** Pose of a frame: vertical bob (px) and lean angle (radians) about the feet. */
function pose(anim: Anim, dir: Dir, i: number): { bob: number; lean: number; arm: number | null } {
  const n = V1_CLIPS[anim].frames;
  const t = i / n;
  const side = DIR_VEC[dir][0] < 0 ? -1 : 1;
  switch (anim) {
    case 'idle':
      return { bob: Math.round(Math.sin(t * 2 * Math.PI)), lean: 0, arm: null };
    case 'walk':
      return { bob: Math.round(Math.abs(Math.sin(t * 2 * Math.PI)) * 3), lean: 0.06 * side, arm: null };
    case 'swing':
      return { bob: 0, lean: 0, arm: -1.2 + (2.4 * i) / (n - 1) };
    case 'die':
      return { bob: 0, lean: side * (Math.PI / 2) * Math.min(1, i / (n - 2)), arm: null };
  }
}

const BODY_W = 30;
const BODY_H = 84;

function drawLayer(
  g: SKRSContext2D,
  pass: Pass,
  anim: Anim,
  dir: Dir,
  i: number,
  feet: [number, number],
): void {
  const p = pose(anim, dir, i);
  const [vx, vy] = DIR_VEC[dir];
  g.save();
  g.translate(feet[0], feet[1] - p.bob);
  g.rotate(p.lean);
  const top = -BODY_H;
  const headY = top + 16;
  if (pass === 'body') {
    shape(g, 'fog', () => g.roundRect(-BODY_W / 2, top + 22, BODY_W, BODY_H - 22, 10));
    shape(g, 'bone', () => g.arc(0, headY, 15, 0, 2 * Math.PI));
    // Facing arrow on the chest, and a nose dot on the head towards the facing.
    shape(g, 'bone', () => g.arc(0, top + 50, 9, 0, 2 * Math.PI));
    g.beginPath();
    g.moveTo(-vx * 6, top + 50 - vy * 6);
    g.lineTo(vx * 6, top + 50 + vy * 6);
    g.moveTo(vx * 6 - (vx * 4 - vy * 4), top + 50 + vy * 6 - (vy * 4 + vx * 4));
    g.lineTo(vx * 6, top + 50 + vy * 6);
    g.lineTo(vx * 6 - (vx * 4 + vy * 4), top + 50 + vy * 6 - (vy * 4 - vx * 4));
    g.lineWidth = 2;
    g.strokeStyle = PALETTE.ink;
    g.stroke();
    if (vy >= 0 || Math.abs(vx) > 0.5)
      shape(g, 'slate', () => g.arc(vx * 9, headY + vy * 4, 3, 0, 2 * Math.PI), false);
    if (p.arm !== null) {
      const a = Math.atan2(vy, vx) + p.arm;
      g.beginPath();
      g.moveTo(0, top + 36);
      g.lineTo(Math.cos(a) * 30, top + 36 + Math.sin(a) * 30);
      g.lineWidth = 5;
      g.strokeStyle = PALETTE.ink;
      g.stroke();
    }
    g.restore();
    label(g, `${anim} ${dir} ${i}`, feet[0], feet[1] - BODY_H - 18);
    return;
  }
  if (pass === 'scarf') {
    shape(g, 'bone', () => g.roundRect(-BODY_W / 2 - 2, top + 26, BODY_W + 4, 9, 3));
    shape(g, 'bone', () => g.rect(-vx * 12 - 3, top + 32, 6, 14));
  } else if (pass === 'hat_cap') {
    shape(g, 'slate', () => g.ellipse(0, headY - 11, 15, 7, 0, 0, 2 * Math.PI));
    shape(g, 'slate', () => g.ellipse(vx * 12, headY - 9 + vy * 4, 8, 4, Math.atan2(vy, vx), 0, 2 * Math.PI));
  } else if (pass === 'hat_bowler') {
    shape(g, 'ink', () => g.ellipse(0, headY - 10, 19, 5, 0, 0, 2 * Math.PI));
    shape(g, 'ink', () => g.arc(0, headY - 12, 12, Math.PI, 2 * Math.PI));
    g.fillStyle = PALETTE.fog;
    g.fillRect(-12, headY - 16, 24, 3);
  } else if (pass === 'blood') {
    shape(g, 'blood', () => g.arc(-6, top + 44, 7, 0, 2 * Math.PI), false);
    shape(g, 'blood', () => g.arc(7, top + 58, 5, 0, 2 * Math.PI), false);
    shape(g, 'blood', () => g.arc(-BODY_W / 2, top + 64, 4, 0, 2 * Math.PI), false);
  }
  g.restore();
}

export function characterFrames(): { manifest: FeetManifest; framesByPass: Map<Pass, PackInput[]> } {
  registerFont();
  const manifest: FeetManifest = {
    version: 1,
    body: BODY,
    cell: CELL_PX,
    fps: 12,
    passes: [...PASSES],
    frames: {},
  };
  const framesByPass = new Map<Pass, PackInput[]>(PASSES.map((p) => [p, []]));
  for (const anim of Object.keys(V1_CLIPS) as Anim[]) {
    const [cell, feetRow] = CLIP_CELL[anim] ?? [CELL_PX, FEET_ROW_PX];
    const feet: [number, number] = [cell / 2, feetRow];
    for (const dir of DIRECTIONS) {
      for (let index = 0; index < V1_CLIPS[anim].frames; index++) {
        const id = { body: BODY, anim, dir, index };
        manifest.frames[frameFileName(id)] = cell === CELL_PX ? { feet } : { feet, cell };
        for (const pass of PASSES) {
          const c = createCanvas(cell, cell);
          drawLayer(c.getContext('2d'), pass, anim, dir, index, feet);
          framesByPass.get(pass)!.push({ name: frameKey(pass, id), png: c.toBuffer('image/png') });
        }
      }
    }
  }
  return { manifest, framesByPass };
}

// ---------------------------------------------------------------- clues, buildings, tiles

export function clueFrames(): PackInput[] {
  registerFont();
  const out: PackInput[] = [];
  const add = (key: string, fill: Token, letter: string, r = 20) => {
    const c = createCanvas(64, 64);
    const g = c.getContext('2d');
    shape(g, fill, () => g.arc(32, 30, r, 0, 2 * Math.PI));
    g.font = `16px ${FONT}`;
    g.textAlign = 'center';
    g.fillStyle = fill === 'ink' || fill === 'slate' || fill === 'blood' ? PALETTE.bone : PALETTE.ink;
    g.fillText(letter, 32, 36);
    label(g, key.replace('clue_', ''), 32, 61, 7);
    out.push({ name: key, png: c.toBuffer('image/png') });
  };
  const radius = { s: 14, m: 18, t: 22 } as const;
  for (const h of ['s', 'm', 't'] as const) {
    for (const [tint, token] of Object.entries(MUD))
      add(`clue_footprint_${h}_${tint}`, token, 'F', radius[h]);
  }
  for (const [colour, token] of Object.entries(SCARF)) add(`clue_thread_${colour}`, token, 'T');
  add('clue_felt_cap', 'slate', 'H');
  add('clue_felt_bowler', 'ink', 'H');
  add('clue_felt_bare', 'bone', 'H');
  add('clue_smear', 'blood', 'S');
  add('clue_print', 'bone', 'P');
  add('clue_bucket_wet', 'moon', 'W');
  add('clue_fur', 'fog', 'U');
  add('clue_claw', 'magenta', 'C');
  add('clue_drag', 'blood', 'D');
  return out;
}

/** Exterior with roof from the 40-degree camera: roof depth d * 49 px over a 3 m (123 px) wall. */
export function buildingImage(b: (typeof BUILDINGS)[number]): Buffer {
  registerFont();
  const w = b.w * 64;
  const roof = Math.round(b.d * 49);
  const wall = 123;
  const c = createCanvas(w, roof + wall);
  const g = c.getContext('2d');
  shape(g, 'fog', () => g.rect(1, roof, w - 2, wall - 1));
  shape(g, 'slate', () => {
    g.moveTo(1, roof + 6);
    g.lineTo(24, 1);
    g.lineTo(w - 24, 1);
    g.lineTo(w - 1, roof + 6);
    g.closePath();
  });
  const doorX = w / 2 - 20;
  shape(g, 'teal', () => g.rect(doorX, roof + wall - 70, 40, 69));
  for (const x of [32, w - 72]) shape(g, 'lantern', () => g.rect(x, roof + 30, 40, 34));
  label(g, b.label, w / 2, Math.round(roof / 2) + 6, 14);
  return c.toBuffer('image/png');
}

/** Four 64 px variants in a row; flecks wrap so every variant tiles with every other. */
export function tilesetImage(biome: string): Buffer {
  const spec = TILESETS[biome]!;
  const c = createCanvas(256, 64);
  const g = c.getContext('2d');
  for (let v = 0; v < 4; v++) {
    const rnd = mulberry32(seedOf(`${biome}:${v}`));
    g.save();
    g.beginPath();
    g.rect(v * 64, 0, 64, 64);
    g.clip();
    g.fillStyle = PALETTE[spec.base];
    g.fillRect(v * 64, 0, 64, 64);
    g.fillStyle = PALETTE[spec.fleck];
    if (spec.kind === 'planks') {
      for (let y = 0; y < 64; y += 16) g.fillRect(v * 64, y, 64, 2);
      for (let y = 0; y < 64; y += 16) g.fillRect(v * 64 + Math.floor(rnd() * 60), y, 2, 16);
    } else {
      const count = spec.kind === 'stones' ? 7 : 14;
      for (let k = 0; k < count; k++) {
        const x = rnd() * 64;
        const y = rnd() * 64;
        const r = spec.kind === 'stones' ? 5 + rnd() * 5 : 1 + rnd() * 1.5;
        for (const dx of [-64, 0, 64]) {
          for (const dy of [-64, 0, 64]) {
            g.beginPath();
            g.arc(v * 64 + x + dx, y + dy, r, 0, 2 * Math.PI);
            g.fill();
          }
        }
      }
    }
    g.restore();
  }
  return c.toBuffer('image/png');
}

// ---------------------------------------------------------------- props, vfx, loft (greybox marks)

/**
 * A greybox prop: a block (front face, lighter top) standing on the frame's pivot, sized like the real
 * render (docs/SPRITES.md 8), with one accent so the bakery props tell apart without a text label.
 * `w` and `h` are the front face in px, `top` the depth of the top face, `lift` raises the block (a plate
 * sits on the table's top, 33 px up), `back` moves the pivot row towards the front edge (the Wake
 * Table's pivot is its back row).
 */
interface GreyProp {
  cell: number;
  ground: number;
  w: number;
  h: number;
  top: number;
  fill: Token;
  lift?: number;
  back?: number;
  accent?: (g: SKRSContext2D, cx: number, topY: number, w: number) => void;
}

const loafMark = (g: SKRSContext2D, cx: number, y: number) =>
  shape(g, 'mustard', () => g.ellipse(cx, y, 11, 6, 0, 0, 2 * Math.PI));

const GREY_PROPS: Record<string, GreyProp> = {
  prop_bell: {
    cell: 192,
    ground: 148,
    w: 80,
    h: 112,
    top: 18,
    fill: 'slate',
    accent: (g, cx, y) => shape(g, 'mustard', () => g.arc(cx, y + 50, 14, 0, 2 * Math.PI)),
  },
  prop_pump: {
    cell: 192,
    ground: 148,
    w: 56,
    h: 24,
    top: 40,
    fill: 'fog',
    accent: (g, cx, y) => shape(g, 'moon', () => g.ellipse(cx, y + 20, 20, 12, 0, 0, 2 * Math.PI)),
  },
  prop_noticeBoard: {
    cell: 192,
    ground: 148,
    w: 84,
    h: 100,
    top: 8,
    fill: 'slate',
    accent: (g, cx, y) => shape(g, 'bone', () => g.rect(cx - 28, y + 18, 56, 34)),
  },
  prop_kitChest: {
    cell: 192,
    ground: 148,
    w: 60,
    h: 28,
    top: 26,
    fill: 'slate',
    accent: (g, cx, y) => shape(g, 'mustard', () => g.rect(cx - 5, y + 30, 10, 10)),
  },
  prop_lanternPost_lit: {
    cell: 192,
    ground: 148,
    w: 10,
    h: 120,
    top: 6,
    fill: 'slate',
    accent: (g, cx, y) => shape(g, 'lantern', () => g.rect(cx - 9, y - 4, 18, 22)),
  },
  prop_lanternPost_unlit: {
    cell: 192,
    ground: 148,
    w: 10,
    h: 120,
    top: 6,
    fill: 'slate',
    accent: (g, cx, y) => shape(g, 'ink', () => g.rect(cx - 9, y - 4, 18, 22)),
  },
  prop_wakeTable: { cell: 384, ground: 176, w: 310, h: 32, top: 120, fill: 'slate', back: 93 },
  prop_plate: {
    cell: 96,
    ground: 72,
    w: 38,
    h: 3,
    top: 22,
    fill: 'bone',
    lift: 33,
    accent: (g, cx, y) => loafMark(g, cx, y + 11),
  },
  prop_deadLoaf: {
    cell: 128,
    ground: 84,
    w: 56,
    h: 30,
    top: 64,
    fill: 'fog',
    back: 32,
    accent: (g, cx, y) => {
      loafMark(g, cx, y + 32);
      g.fillStyle = PALETTE.ink;
      g.fillRect(cx - 2, y + 25, 4, 14);
    },
  },
  prop_ledger: {
    cell: 128,
    ground: 100,
    w: 54,
    h: 40,
    top: 28,
    fill: 'slate',
    accent: (g, cx, y) => shape(g, 'ink', () => g.rect(cx - 16, y + 6, 32, 18)),
  },
  prop_oven: {
    cell: 256,
    ground: 196,
    w: 96,
    h: 64,
    top: 60,
    fill: 'fog',
    accent: (g, cx, y, w) => {
      shape(g, 'fog', () => g.ellipse(cx, y + 10, w / 2 - 8, 34, 0, Math.PI, 2 * Math.PI));
      shape(g, 'ink', () => g.rect(cx - 20, y + 74, 40, 26));
    },
  },
  prop_basin: {
    cell: 128,
    ground: 92,
    w: 22,
    h: 26,
    top: 10,
    fill: 'slate',
    accent: (g, cx, y) => shape(g, 'moon', () => g.ellipse(cx, y - 2, 24, 13, 0, 0, 2 * Math.PI)),
  },
  prop_flour_sacks: {
    cell: 160,
    ground: 120,
    w: 60,
    h: 40,
    top: 14,
    fill: 'bone',
    accent: (g, cx, y) => shape(g, 'bone', () => g.ellipse(cx + 22, y + 56, 18, 7, 0, 0, 2 * Math.PI)),
  },
};

export function propFrames(): { manifest: StaticManifest; inputs: PackInput[] } {
  const manifest: StaticManifest = { version: 1, atlas: 'props', frames: {} };
  const inputs: PackInput[] = [];
  for (const key of PROP_KEYS) {
    const p = GREY_PROPS[key];
    if (!p) throw new Error(`placeholder: no greybox for ${key}`);
    const c = createCanvas(p.cell, p.cell);
    const g = c.getContext('2d');
    const cx = p.cell / 2;
    const base = p.ground - (p.lift ?? 0) + (p.back ?? 0);
    const front = base - p.h;
    const topY = front - p.top;
    if (p.back) {
      for (const sx of [-1, 1]) shape(g, 'ink', () => g.rect(cx + sx * (p.w / 2 - 8) - 4, front, 8, p.h + 4));
    }
    shape(g, p.fill, () => g.rect(cx - p.w / 2, front, p.w, p.back ? p.h / 2 : p.h));
    shape(g, p.fill === 'slate' ? 'fog' : p.fill === 'fog' ? 'bone' : p.fill, () =>
      g.rect(cx - p.w / 2, topY, p.w, p.top),
    );
    p.accent?.(g, cx, topY, p.w);
    manifest.frames[key] = { file: `${key}.png`, cell: p.cell, pivot: [cx, p.ground] };
    inputs.push({ name: key, png: c.toBuffer('image/png') });
  }
  return { manifest, inputs };
}

/** A centred palette mark per VFX frame that grows or fades over the clip, so the timing reads. */
export function vfxFrames(): { manifest: StaticManifest; inputs: PackInput[] } {
  const look: Record<string, { cell: number; fill: Token }> = {
    vfx_blood_pool: { cell: 128, fill: 'blood' },
    vfx_blood_splat: { cell: 128, fill: 'blood' },
    vfx_vote_stamp: { cell: 256, fill: 'blood' },
    vfx_dust_step: { cell: 64, fill: 'fog' },
  };
  const manifest: StaticManifest = { version: 1, atlas: 'vfx', frames: {} };
  const inputs: PackInput[] = [];
  for (const name of staticFrameNames('vfx')) {
    const anim = name.slice(0, name.lastIndexOf('/'));
    const i = Number(name.slice(name.lastIndexOf('/') + 1));
    const t = (i + 1) / VFX_CLIPS[anim]!;
    const { cell, fill } = look[anim]!;
    const c = createCanvas(cell, cell);
    const g = c.getContext('2d');
    const m = cell / 2;
    if (anim === 'vfx_blood_pool')
      shape(g, fill, () => g.ellipse(m, m, m * 0.7 * t, m * 0.45 * t, 0, 0, 2 * Math.PI));
    else if (anim === 'vfx_blood_splat') {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * 2 * Math.PI;
        shape(
          g,
          fill,
          () =>
            g.arc(
              m + Math.cos(a) * m * 0.7 * t,
              m + Math.sin(a) * m * 0.4 * t,
              5 * (1 - t) + 2,
              0,
              2 * Math.PI,
            ),
          false,
        );
      }
    } else if (anim === 'vfx_vote_stamp') {
      const r = m * (0.9 - 0.4 * Math.min(1, t * 2));
      shape(g, fill, () => g.rect(m - r / 2, m - r / 2, r, r));
    } else {
      g.globalAlpha = 1 - t * 0.85;
      shape(g, fill, () => g.arc(m, m, m * (0.3 + 0.5 * t), 0, 2 * Math.PI), false);
    }
    manifest.frames[name] = { file: `${name.replace('/', '_')}.png`, cell };
    inputs.push({ name, png: c.toBuffer('image/png') });
  }
  return { manifest, inputs };
}

/** The dark-loft images as flat marks at the real sizes: the loft's floor and window, and bedrolls. */
export function loftImages(): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  for (const key of LOFT_KEYS) {
    const [w, h] = IMAGE_SIZES[key]!;
    const c = createCanvas(w, h);
    const g = c.getContext('2d');
    if (key === 'loft_backdrop') {
      g.fillStyle = PALETTE.ink;
      g.fillRect(0, 0, w, h);
      g.fillStyle = PALETTE.slate;
      g.fillRect(0, h * 0.3, w, h * 0.7);
      for (let y = h * 0.3; y < h; y += 24) {
        g.fillStyle = PALETTE.ink;
        g.fillRect(0, y, w, 2);
      }
      shape(g, 'moon', () => g.ellipse(w * 0.58, h * 0.17, 60, 46, 0, 0, 2 * Math.PI));
      shape(g, 'lantern', () => g.rect(w * 0.15, h * 0.72, 80, 64));
    } else {
      shape(g, 'slate', () => g.roundRect(6, 6, w - 12, h - 12, 18));
      shape(g, 'bone', () => g.arc(w / 2, 34, 18, 0, 2 * Math.PI));
      shape(g, 'fog', () => g.roundRect(14, 64, w - 28, h - 80, 12));
      if (key === 'prop_bedroll_self') {
        g.fillStyle = PALETTE.moon;
        g.fillRect(14, 80, w - 28, 8);
      }
    }
    out.set(`${key}.png`, c.toBuffer('image/png'));
  }
  return out;
}

// ---------------------------------------------------------------- manifest

export interface ManifestEntry {
  key: string;
  type: 'multiatlas' | 'image' | 'animation';
  url: string;
  path?: string;
  filter?: 'linear' | 'nearest';
  origin?: [number, number];
}

export async function generate(): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  const entries: ManifestEntry[] = [];

  const { manifest, framesByPass } = characterFrames();
  for (const [name, bytes] of await packCharacter(BODY, framesByPass, manifest))
    files.set(`chars/${name}`, bytes);
  entries.push(
    {
      key: `char_${BODY}`,
      type: 'multiatlas',
      url: `chars/char_${BODY}.json`,
      path: 'chars/',
      filter: 'linear',
    },
    {
      key: `ovl_${BODY}`,
      type: 'multiatlas',
      url: `chars/ovl_${BODY}.json`,
      path: 'chars/',
      filter: 'linear',
    },
    { key: `anims_${BODY}`, type: 'animation', url: `chars/${BODY}.anims.json` },
  );

  const clues = await packFrames('clues', clueFrames());
  for (const [name, bytes] of clues.pages) files.set(`clues/${name}`, bytes);
  files.set('clues/clues.json', Buffer.from(atlasJson(clues.atlas)));
  entries.push({
    key: 'clues',
    type: 'multiatlas',
    url: 'clues/clues.json',
    path: 'clues/',
    filter: 'linear',
  });

  const props = propFrames();
  for (const [name, bytes] of await packStatic(props.manifest, props.inputs))
    files.set(`props/${name}`, bytes);
  entries.push({
    key: 'props',
    type: 'multiatlas',
    url: 'props/props.json',
    path: 'props/',
    filter: 'linear',
  });

  const vfx = vfxFrames();
  for (const [name, bytes] of await packStatic(vfx.manifest, vfx.inputs)) files.set(`vfx/${name}`, bytes);
  entries.push(
    { key: 'vfx', type: 'multiatlas', url: 'vfx/vfx.json', path: 'vfx/', filter: 'linear' },
    { key: 'anims_vfx', type: 'animation', url: 'vfx/vfx.anims.json' },
  );

  for (const [name, bytes] of loftImages()) {
    files.set(`loft/${name}`, bytes);
    entries.push({ key: name.replace('.png', ''), type: 'image', url: `loft/${name}`, filter: 'linear' });
  }

  for (const b of BUILDINGS) {
    const key = `bld_${b.id}_ext`;
    files.set(`buildings/${key}.png`, buildingImage(b));
    entries.push({ key, type: 'image', url: `buildings/${key}.png`, filter: 'linear', origin: [0.5, 1] });
  }
  for (const biome of Object.keys(TILESETS)) {
    const key = `tiles_${biome}`;
    files.set(`tiles/${key}.png`, tilesetImage(biome));
    entries.push({ key, type: 'image', url: `tiles/${key}.png`, filter: 'linear' });
  }

  const doc = { version: 1, art: 'placeholder', entries };
  files.set('manifest.json', Buffer.from(`${JSON.stringify(doc, null, 2)}\n`));
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = dirname(fileURLToPath(import.meta.url));
  const outDir = resolve(process.argv[2] ?? join(here, '../../apps/client/public/assets/placeholder'));
  const files = await generate();
  for (const sub of new Set([...files.keys()].map((k) => dirname(k)))) {
    writeFiles(
      join(outDir, sub),
      new Map(
        [...files]
          .filter(([k]) => dirname(k) === sub)
          .map(([k, v]) => [k.slice(sub === '.' ? 0 : sub.length + 1), v]),
      ),
    );
  }
  console.log(`placeholder: ${files.size} files -> ${outDir}`);
}
