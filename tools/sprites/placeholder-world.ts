// Placeholder stand-ins owned by Session 5K (art plan 1.2 item 6): clues, props, the building exteriors
// and the tilesets. placeholder.ts collects `placeholderEntries()`; 5K adds its keys' greybox stand-ins
// here and removes its retired keys.
import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
import { PROP_KEYS } from './keys.ts';
import { atlasJson, packFrames, type PackInput } from './pack.ts';
import { packStatic, type StaticManifest } from './pack-static.ts';
import {
  CELL_H,
  CELL_W,
  COLUMNS,
  GROUND_ROWS,
  GROUND_THEMES,
  SHEET_H,
  SHEET_W,
  cellUv,
  underFringe,
} from './tileset.ts';
import {
  FONT,
  PALETTE,
  inFolder,
  label,
  mulberry32,
  registerFont,
  seedOf,
  shape,
  type ManifestEntry,
  type PlaceholderEntry,
  type Token,
} from './placeholder-kit.ts';

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

// ---------------------------------------------------------------- isometric ground (art plan 3.2)

/** The map each ground theme belongs to (maps/<id>.json `theme`). */
export const GROUND_MAPS: Record<(typeof GROUND_THEMES)[number], string> = {
  harbour: 'hollowmere',
  timber: 'blackpine',
};

/** Greybox colour of each ground material (GROUND_ROWS order), and a mark colour for its variants. */
const GROUND_GREY: Record<string, [Token, Token]> = {
  g: ['slate', 'teal'],
  l: ['slate', 'mustard'],
  m: ['slate', 'teal'],
  p: ['fog', 'slate'],
  d: ['ink', 'slate'],
  c: ['fog', 'bone'],
  f: ['fog', 'ink'],
  w: ['fog', 'mustard'],
  r: ['ink', 'fog'],
  s: ['fog', 'moon'],
  '~': ['moon', 'bone'],
  u: ['slate', 'mustard'],
  '=': ['ink', 'bone'],
  O: ['ink', 'moon'],
};

/**
 * The greybox ground tileset (SPRITES 10.12 layout): flat diamonds in the material's grey, variant v
 * marked with v + 1 dots, and each edge overlay drawn under the real overlay's fringe (`underFringe`).
 */
export function groundTilesetImage(theme: string): Buffer {
  const c = createCanvas(SHEET_W, SHEET_H);
  const g = c.getContext('2d');
  const img = g.createImageData(SHEET_W, SHEET_H);
  const rnd = mulberry32(seedOf(`ground:${theme}`));
  [...GROUND_ROWS].forEach((char, m) => {
    const [base, mark] = GROUND_GREY[char]!;
    const rgb = (t: Token) => [1, 3, 5].map((i) => parseInt(PALETTE[t].slice(i, i + 2), 16));
    const fill = rgb(base);
    for (let cell = 0; cell < 19; cell++) {
      const ox = (cell % COLUMNS) * CELL_W;
      const oy = (2 * m + Math.floor(cell / COLUMNS)) * CELL_H;
      for (let y = 0; y < CELL_H; y++) {
        for (let x = 0; x < CELL_W; x++) {
          const [u, v] = cellUv(x, y, CELL_W, CELL_H);
          if (u < 0 || u > 1 || v < 0 || v > 1) continue;
          if (cell > 3 && !underFringe(cell - 3, u, v)) continue;
          img.data.set([...fill, 255], ((oy + y) * SHEET_W + ox + x) * 4);
        }
      }
      if (cell < 4) {
        const dot = rgb(mark);
        for (let k = 0; k <= cell; k++) {
          const dx = 52 + k * 8 + Math.floor(rnd() * 2);
          for (let y = 30; y < 34; y++)
            for (let x = dx; x < dx + 4; x++) img.data.set([...dot, 255], ((oy + y) * SHEET_W + ox + x) * 4);
        }
      }
    }
  });
  g.putImageData(img, 0, 0);
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

// ---------------------------------------------------------------- manifest

export function placeholderEntries(): PlaceholderEntry[] {
  return [
    {
      order: 20,
      entries: [
        { key: 'clues', type: 'multiatlas', url: 'clues/clues.json', path: 'clues/', filter: 'linear' },
      ],
      files: async () => {
        const clues = await packFrames('clues', clueFrames());
        const files = inFolder('clues/', clues.pages);
        files.set('clues/clues.json', Buffer.from(atlasJson(clues.atlas)));
        return files;
      },
    },
    {
      order: 30,
      entries: [
        { key: 'props', type: 'multiatlas', url: 'props/props.json', path: 'props/', filter: 'linear' },
      ],
      files: async () => {
        const props = propFrames();
        return inFolder('props/', await packStatic(props.manifest, props.inputs));
      },
    },
    ...BUILDINGS.map((b): PlaceholderEntry => {
      const key = `bld_${b.id}_ext`;
      return {
        order: 60,
        entries: [{ key, type: 'image', url: `buildings/${key}.png`, filter: 'linear', origin: [0.5, 1] }],
        files: () => new Map([[`buildings/${key}.png`, buildingImage(b)]]),
      };
    }),
    ...GROUND_THEMES.map((theme): PlaceholderEntry => {
      const key = `iso_ground_${theme}`;
      return {
        order: 65,
        // `maps` (SPRITES 10.13) is not in the core's ManifestEntry yet; the cast keeps the row as written.
        entries: [
          {
            key,
            type: 'image',
            url: `ground/${key}.png`,
            filter: 'nearest',
            maps: [GROUND_MAPS[theme]],
          } as ManifestEntry,
        ],
        files: () => new Map([[`ground/${key}.png`, groundTilesetImage(theme)]]),
      };
    }),
    ...Object.keys(TILESETS).map((biome): PlaceholderEntry => {
      const key = `tiles_${biome}`;
      return {
        order: 70,
        entries: [{ key, type: 'image', url: `tiles/${key}.png`, filter: 'linear' }],
        files: () => new Map([[`tiles/${key}.png`, tilesetImage(biome)]]),
      };
    }),
  ];
}
