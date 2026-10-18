// Placeholder stand-ins owned by Session 5K (art plan 1.2 item 6): clues, props, the building exteriors
// and the tilesets. placeholder.ts collects `placeholderEntries()`; 5K adds its keys' greybox stand-ins
// here and removes its retired keys.
import { createCanvas } from '@napi-rs/canvas';
import { atlasJson, packFrames, type PackInput } from './pack.ts';
import {
  KIT_CELLS,
  KIT_FRAMES,
  KIT_THEMES,
  MAP_PROPS_FRAMES,
  PROPS_FRAMES,
  packStatic,
  type StaticManifest,
} from './pack-static.ts';
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
  type PlaceholderEntry,
  type Token,
} from './placeholder-kit.ts';

// Scarf tints proposed in SPRITES.md 7; mud tints dark / mid / light.
const SCARF: Record<string, Token> = { red: 'blood', green: 'teal', blue: 'moon' };
const MUD: Record<string, Token> = { dark: 'ink', mid: 'slate', light: 'fog' };

/**
 * Each map's buildings (art plan 3.4, world.md 7-8): art id and footprint in tiles, as
 * tools/blender/build_buildings.py RECIPES; and the multi-tile props sliced the same way (3.5).
 */
export const MAP_BUILDINGS: Record<string, ReadonlyArray<{ art: string; w: number; h: number }>> = {
  hollowmere: [
    { art: 'manor', w: 13, h: 6 },
    { art: 'barn', w: 10, h: 5 },
    { art: 'bakery', w: 6, h: 4 },
    { art: 'apoth', w: 10, h: 8 },
    { art: 'widow', w: 8, h: 7 },
    { art: 'tavern', w: 12, h: 7 },
    { art: 'chapel', w: 9, h: 8 },
    { art: 'netloft', w: 5, h: 9 },
    { art: 'mollHut', w: 4, h: 3 },
  ],
  blackpine: [
    { art: 'lodge', w: 14, h: 7 },
    { art: 'mill', w: 12, h: 7 },
    { art: 'office', w: 8, h: 6 },
    { art: 'smithy', w: 7, h: 5 },
    { art: 'woodshed', w: 5, h: 3 },
  ],
};
export const MAP_SLICED_PROPS: Record<string, ReadonlyArray<{ art: string; w: number; h: number }>> = {
  props_hollowmere: [
    { art: 'prop_wakeTable', w: 5, h: 2 },
    { art: 'prop_hanging_oak', w: 2, h: 2 },
    { art: 'prop_clamp', w: 2, h: 2 },
    { art: 'prop_pump_beam', w: 2, h: 3 },
  ],
  props_blackpine: [
    { art: 'prop_trestle', w: 3, h: 2 },
    { art: 'prop_mess_table', w: 6, h: 2 },
    { art: 'prop_bunks_n', w: 7, h: 2 },
    { art: 'prop_bunks_s', w: 7, h: 2 },
    { art: 'prop_head_saw', w: 3, h: 2 },
    { art: 'prop_kiln_0', w: 2, h: 2 },
    { art: 'prop_kiln_1', w: 2, h: 2 },
    { art: 'prop_map_table', w: 2, h: 2 },
    { art: 'prop_forge', w: 3, h: 1 },
  ],
};

/** The slice names `<art>#<dx>_<dy>` of a footprint. */
export function sliceNames(art: string, w: number, h: number): string[] {
  const out: string[] = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push(`${art}#${dx}_${dy}`);
  return out;
}

/**
 * Greybox slices of one footprint (SPRITES 10.5, 10.13): every tile a prism `tall` art px high on the packed
 * canvas build_buildings.py renders ((w + h) * 32 + 32 by (w + h) * 16 + 216), all slices pivoted on the
 * footprint centre.
 */
export function greyboxSlices(
  art: string,
  w: number,
  h: number,
  tall: number,
  fill: Token,
): { frames: StaticManifest['frames']; inputs: PackInput[] } {
  const cw = (w + h) * 32 + 32;
  const ch = (w + h) * 16 + 216;
  const pivot: [number, number] = [cw / 2, 200 + (w + h) * 8];
  const frames: StaticManifest['frames'] = {};
  const inputs: PackInput[] = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const c = createCanvas(cw, ch);
      const g = c.getContext('2d');
      const ox = (dx + 0.5 - w / 2) * 32;
      const oy = (dy + 0.5 - h / 2) * 32;
      const x = pivot[0] + (ox - oy);
      const y = pivot[1] + (ox + oy) / 2;
      shape(g, fill, () => {
        g.moveTo(x - 32, y);
        g.lineTo(x, y + 16);
        g.lineTo(x + 32, y);
        g.lineTo(x + 32, y - tall);
        g.lineTo(x - 32, y - tall);
        g.closePath();
      });
      shape(g, fill === 'fog' ? 'bone' : 'fog', () => {
        g.moveTo(x - 32, y - tall);
        g.lineTo(x, y + 16 - tall);
        g.lineTo(x + 32, y - tall);
        g.lineTo(x, y - 16 - tall);
        g.closePath();
      });
      const name = `${art}#${dx}_${dy}`;
      frames[name] = { file: `${name.replace('#', '__')}.png`, cell: [cw, ch], pivot };
      inputs.push({ name, png: c.toBuffer('image/png') });
    }
  }
  return { frames, inputs };
}

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
    add(`clue_footprint_${h}_glow`, 'moon', 'F', radius[h]);
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

/** The lobby thumbnail stand-in (art plan 3.9): 480 x 270, the map's name on slate, lossless WebP. */
export function thumbImage(map: string): Buffer {
  registerFont();
  const c = createCanvas(480, 270);
  const g = c.getContext('2d');
  g.fillStyle = PALETTE.slate;
  g.fillRect(0, 0, 480, 270);
  label(g, map, 240, 140, 24);
  return c.toBuffer('image/webp', 100);
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

// ---------------------------------------------------------------- isometric kits (art plan 3.3)

/** Greybox height (art px above the ground point) and tones of each kit family. */
const KIT_GREY: Record<string, { h: number; side: Token; top: Token; w: number }> = {
  'wall/full': { h: 74, side: 'fog', top: 'bone', w: 32 },
  'wall/half': { h: 35, side: 'fog', top: 'bone', w: 32 },
  'wall/stub': { h: 9, side: 'fog', top: 'bone', w: 32 },
  'cliff/full': { h: 74, side: 'slate', top: 'fog', w: 32 },
  'cliff/half': { h: 35, side: 'slate', top: 'fog', w: 32 },
  'cliff/stub': { h: 12, side: 'slate', top: 'fog', w: 32 },
  'tree/full': { h: 90, side: 'slate', top: 'teal', w: 10 },
  'tree/stub': { h: 10, side: 'slate', top: 'mustard', w: 9 },
  'boulder/full': { h: 30, side: 'slate', top: 'fog', w: 16 },
  'fence/full': { h: 22, side: 'slate', top: 'teal', w: 28 },
  'stack/full': { h: 34, side: 'mustard', top: 'bone', w: 20 },
};

/**
 * A greybox kit (SPRITES 10.13): every frame a block on its tile's ground point, half a diamond `w` px wide,
 * the real frame's art cell and pivot; trees get a crown. Variant v is marked with v + 1 ink ticks.
 */
export function kitFrames(theme: string): { manifest: StaticManifest; inputs: PackInput[] } {
  const manifest: StaticManifest = { version: 1, atlas: `iso_kit_${theme}`, frames: {} };
  const inputs: PackInput[] = [];
  for (const [kind, height] of KIT_FRAMES) {
    const fam = `${kind}/${height}`;
    const [cw, chh] = KIT_CELLS[fam]!;
    const grey = KIT_GREY[fam]!;
    for (let v = 0; v < 4; v++) {
      const c = createCanvas(cw, chh);
      const g = c.getContext('2d');
      const px = cw / 2;
      const py = chh - 16;
      const w = grey.w;
      const top = py - grey.h;
      shape(g, grey.side, () => {
        g.moveTo(px - w, py - w / 2);
        g.lineTo(px, py);
        g.lineTo(px + w, py - w / 2);
        g.lineTo(px + w, top - w / 2);
        g.lineTo(px - w, top - w / 2);
        g.closePath();
      });
      shape(g, grey.top, () => {
        g.moveTo(px - w, top - w / 2);
        g.lineTo(px, top);
        g.lineTo(px + w, top - w / 2);
        g.lineTo(px, top - w);
        g.closePath();
      });
      if (fam === 'tree/full') shape(g, 'teal', () => g.ellipse(px, top - 18, 30, 26, 0, 0, 2 * Math.PI));
      g.fillStyle = PALETTE.ink;
      for (let k = 0; k <= v; k++) g.fillRect(px - 6 + k * 4, py - 6, 2, 3);
      const name = `${fam}/${v}`;
      manifest.frames[name] = { file: `${name}.png`, cell: [cw, chh], pivot: [px, py] };
      inputs.push({ name, png: c.toBuffer('image/png') });
    }
  }
  return { manifest, inputs };
}

// ---------------------------------------------------------------- props, vfx, loft (greybox marks)

/** The art cell of a round-5 prop, spot or portal frame (art plan 3.5-3.7), as `build_props.py` renders it. */
export function propCell(name: string): [number, number] {
  if (name.endsWith('_sill') || ['portal_hatch', 'portal_drop'].includes(name)) return [64, 48];
  if (name.startsWith('portal_')) return [64, 112];
  return PROP_CELLS[name] ?? [64, 64];
}

const PROP_CELLS: Record<string, [number, number]> = {
  prop_noticeBoard: [64, 96],
  prop_pump: [64, 96],
  prop_lanternPost_lit: [64, 128],
  prop_lanternPost_unlit: [64, 128],
  prop_bell: [64, 128],
  prop_oven: [64, 96],
  prop_deadLoaf: [64, 80],
  prop_ledger: [64, 80],
  prop_dartboard: [64, 96],
  prop_lockedDoor: [64, 112],
  prop_window: [64, 112],
  prop_fence: [64, 56],
  prop_letter_box: [64, 80],
  prop_shelf: [64, 112],
  prop_rope: [64, 112],
  prop_clock: [64, 128],
  prop_safe: [64, 80],
  prop_crepe: [64, 112],
  prop_scarecrow: [64, 112],
  prop_photos: [64, 96],
  prop_portrait: [64, 112],
  prop_drowned_lantern: [64, 80],
  prop_den: [64, 96],
  spot_wardrobe: [64, 128],
  spot_behindCounter: [64, 96],
  spot_underBed: [64, 80],
  spot_brush: [64, 80],
  spot_hollowTree: [64, 112],
  spot_timberCrib: [64, 96],
  spot_sump: [64, 48],
  spot_cratePile: [64, 96],
  spot_crates: [64, 80],
  spot_cryptNiche: [64, 112],
  spot_dumpSpot: [64, 48],
  spot_hayPile: [64, 80],
  spot_poolNiche: [64, 48],
  spot_atticHatch: [64, 48],
  spot_cart: [64, 96],
  spot_confessional: [64, 128],
  spot_curtain: [64, 112],
  spot_hedge: [64, 80],
  spot_herbLoft: [64, 112],
  spot_kegStack: [64, 96],
  spot_pantry: [64, 112],
  spot_stalagmite: [64, 96],
  spot_wineRack: [64, 112],
  spot_reeds: [64, 96],
  spot_bog: [64, 48],
  spot_charcoalPit: [64, 48],
  spot_oreChute: [64, 96],
  prop_flume: [64, 96],
  prop_gearing: [64, 112],
  prop_ledger_desk: [64, 80],
  prop_pegs: [64, 96],
  prop_plank_stack: [64, 80],
  prop_refuge_table: [64, 80],
  prop_shelves: [64, 112],
  prop_tally_board: [64, 96],
  prop_telephone: [64, 96],
  prop_tool_rack: [64, 112],
  spot_barrel: [64, 80],
  spot_bunk: [64, 112],
  spot_logChute: [64, 96],
  spot_logPile: [64, 80],
  spot_oldStope: [64, 80],
  spot_oreBin: [64, 80],
  spot_orePillar: [64, 112],
  spot_pool: [64, 48],
  spot_rootCellar: [64, 48],
  spot_strongroom: [64, 112],
};

/**
 * Greybox props (SPRITES 10.13): a block on the frame's pivot, the ground point under the tile centre,
 * (w / 2, h - 16) of the real art cell; props slate, spots fog, portals teal, floor features flat.
 */
export function propFrames(
  atlas = 'props',
  names: readonly string[] = PROPS_FRAMES,
): {
  manifest: StaticManifest;
  inputs: PackInput[];
} {
  const manifest: StaticManifest = { version: 1, atlas: atlas as StaticManifest['atlas'], frames: {} };
  const inputs: PackInput[] = [];
  for (const name of names) {
    const [w, h] = propCell(name);
    const c = createCanvas(w, h);
    const g = c.getContext('2d');
    const px = w / 2;
    const py = h - 16;
    const fill: Token = name.startsWith('portal_') ? 'teal' : name.startsWith('spot_') ? 'fog' : 'slate';
    const tall = h - 16 - 24;
    if (h <= 48) shape(g, fill, () => g.ellipse(px, py, 22, 11, 0, 0, 2 * Math.PI));
    else {
      shape(g, fill, () => g.rect(px - 16, py - tall, 32, tall));
      shape(g, fill === 'slate' ? 'fog' : 'bone', () => g.rect(px - 16, py - tall - 8, 32, 8));
    }
    manifest.frames[name] = { file: `${name}.png`, cell: [w, h], pivot: [px, py] };
    inputs.push({ name, png: c.toBuffer('image/png') });
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
        { key: 'props', type: 'multiatlas', url: 'props/props.json', path: 'props/', filter: 'nearest' },
      ],
      files: async () => {
        const props = propFrames();
        return inFolder('props/', await packStatic(props.manifest, props.inputs));
      },
    },
    ...Object.entries(MAP_PROPS_FRAMES).map(([key, names]): PlaceholderEntry => ({
      order: 31,
      entries: [
        {
          key,
          type: 'multiatlas',
          url: `props/${key}.json`,
          path: 'props/',
          filter: 'nearest',
          maps: [key.slice('props_'.length)],
        },
      ],
      files: async () => {
        const props = propFrames(key, names);
        for (const p of MAP_SLICED_PROPS[key] ?? []) {
          const sl = greyboxSlices(p.art, p.w, p.h, 24, 'slate');
          Object.assign(props.manifest.frames, sl.frames);
          props.inputs.push(...sl.inputs);
        }
        return inFolder('props/', await packStatic(props.manifest, props.inputs));
      },
    })),
    ...Object.entries(MAP_BUILDINGS).map(([map, buildings]): PlaceholderEntry => ({
      order: 60,
      entries: [
        {
          key: `bld_${map}`,
          type: 'multiatlas',
          url: `buildings/bld_${map}.json`,
          path: 'buildings/',
          filter: 'nearest',
          maps: [map],
        },
      ],
      files: async () => {
        const manifest: StaticManifest = { version: 1, atlas: `bld_${map}`, frames: {} };
        const inputs: PackInput[] = [];
        for (const b of buildings) {
          const s = greyboxSlices(b.art, b.w, b.h, 88, 'fog');
          Object.assign(manifest.frames, s.frames);
          inputs.push(...s.inputs);
        }
        return inFolder('buildings/', await packStatic(manifest, inputs));
      },
    })),
    ...Object.values(GROUND_MAPS).map((map): PlaceholderEntry => ({
      order: 64,
      entries: [{ key: `thumb_${map}`, type: 'image', url: `thumbs/thumb_${map}.webp` }],
      files: () => new Map([[`thumbs/thumb_${map}.webp`, thumbImage(map)]]),
    })),
    ...GROUND_THEMES.map((theme): PlaceholderEntry => {
      const key = `iso_ground_${theme}`;
      return {
        order: 65,
        entries: [
          {
            key,
            type: 'image',
            url: `ground/${key}.png`,
            filter: 'nearest',
            maps: [GROUND_MAPS[theme]],
          },
        ],
        files: () => new Map([[`ground/${key}.png`, groundTilesetImage(theme)]]),
      };
    }),
    ...KIT_THEMES.map((theme): PlaceholderEntry => {
      const key = `iso_kit_${theme}`;
      return {
        order: 66,
        entries: [
          {
            key,
            type: 'multiatlas',
            url: `kit/${key}.json`,
            path: 'kit/',
            filter: 'nearest',
            maps: [GROUND_MAPS[theme]],
          },
        ],
        files: async () => {
          const kit = kitFrames(theme);
          return inFolder('kit/', await packStatic(kit.manifest, kit.inputs));
        },
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
