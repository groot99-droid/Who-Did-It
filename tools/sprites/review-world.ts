// Review sheets of the world art (art plan 1.6, 3.10), composited from the packed atlases by the projection of
// docs/SPRITES.md 10.2 (sx = x - y, sy = (x + y) / 2 on 64 px world tiles), as the client draws them:
//
//   tsx review-world.ts gate <assets dir> <out.png> [--finish on|off] [--look baker]
//   tsx review-world.ts ground <assets dir> <theme> <out.png>
//   tsx review-world.ts kit <assets dir> <theme> <out.png>
//   tsx review-world.ts atlas <assets dir> <atlas json, e.g. props/props.json> <out.png>
//   tsx review-world.ts buildings <assets dir> <mapId> <out.png>
//   tsx review-world.ts thumbs <assets dir> <out dir> [--finish on|off]   (thumb_<mapId>.webp, art plan 3.9)
//   tsx review-world.ts proposal <out.png> <label>=<assets dir>[:texels][:smooth]...   (art.md 5, the look PR)
//   tsx review-world.ts look <out dir> <label>=<assets dir>[:texels][:smooth]...   (docs/round8/hd-look, A164)
//
// `gate` is Gate A's Hollowmere square vignette: ground with blends, kit walls, a tree line, boulders, the
// hedge-wall, the tavern's slices, the bell, the pump, two lantern posts and a look idling in 8 directions,
// as a day frame and a night frame (a simulated darkness layer with the lantern pools), each at zoom 1
// and a zoom-2 crop. Its two runs differ only in the assets folder they read (the same raw renders finished
// on and off) and the texture filter. Missing frames draw the greybox of SPRITES 10.13. An assets folder of
// the HD style holds `texels` render px per display px (hd.ts): its frames draw at 1 / texels of the scale.
//
// `proposal` is the look proposal of docs/round8/art.md 5: one cell per assets folder (a style, flat or
// textured), each the square's room with three figures at zoom 2 and the same view at zoom 1, in the order
// given, two cells per row. `look` writes the owner's look sheet from the same columns, one PNG per column and
// subject: `figure-<label>.png` (the look idling in three directions at zoom 3), `room-<label>.png` (the
// square's room at zoom 2) and `building-<label>.png` (the BlackPine lodge whole at zoom 1 and its middle at
// zoom 2), so each file stays small and the looks compare file by file.
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, type Canvas, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import type { MultiAtlas } from './pack.ts';
import { CELL_H, CELL_W, COLUMNS, GROUND_ROWS } from './tileset.ts';
import { KIT_CELLS } from './pack-static.ts';
import type { Rgba } from './bleed.ts';
import { boxResize, crop, encodeWebp, finishIllustration, offWebpQuality, upscaleNearest } from './pixel.ts';

const BLEND_RANK = 'O~r=wfcdpslmgu'; // packages/content/src/schemas/scene.ts
const KIT_OF: Record<string, string> = {
  W: 'wall',
  T: 'tree',
  R: 'boulder',
  X: 'cliff',
  F: 'fence',
  K: 'stack',
};
const ART_SCALE = 2; // metrics.json iso.artScale
const INK = '#12141C';

export const toScreen = (wx: number, wy: number) => ({ x: wx - wy, y: (wx + wy) / 2 });
export const tileCentre = (tx: number, ty: number) => toScreen((tx + 0.5) * 64, (ty + 0.5) * 64);

interface Sprite {
  img: Image;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Offset of the trimmed frame from the anchor, at scale 1. */
  dx: number;
  dy: number;
}

/** Every frame of a packed multiatlas, keyed by name, positioned against its pivot. */
export async function readAtlas(json: string): Promise<Map<string, Sprite>> {
  const out = new Map<string, Sprite>();
  if (!existsSync(json)) return out;
  const atlas = JSON.parse(readFileSync(json, 'utf8')) as MultiAtlas;
  for (const t of atlas.textures) {
    const img = await loadImage(readFileSync(join(json, '..', t.image)));
    for (const f of t.frames) {
      const px = (f.pivot?.x ?? 0.5) * f.sourceSize.w;
      const py = (f.pivot?.y ?? 0.5) * f.sourceSize.h;
      out.set(f.filename, {
        img,
        sx: f.frame.x,
        sy: f.frame.y,
        sw: f.frame.w,
        sh: f.frame.h,
        dx: f.spriteSourceSize.x - px,
        dy: f.spriteSourceSize.y - py,
      });
    }
  }
  return out;
}

function draw(g: SKRSContext2D, s: Sprite, x: number, y: number, scale: number): void {
  g.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, x + s.dx * scale, y + s.dy * scale, s.sw * scale, s.sh * scale);
}

/** A labelled greybox block standing on (x, y), for a frame the atlases do not have yet. */
function greybox(g: SKRSContext2D, x: number, y: number, h: number, w = 40): void {
  g.fillStyle = '#5E6C84';
  g.fillRect(x - w / 2, y - h, w, h);
  g.fillStyle = '#8892A2';
  g.fillRect(x - w / 2, y - h - 10, w, 10);
}

// ---------------------------------------------------------------- the vignette

/** A test scene: ground chars, solid chars (`.` = none), one building, props and an optional row of a look. */
export interface Layout {
  ground: string[];
  solids: string[];
  building: { x: number; y: number; w: number; h: number; art: string };
  props: Array<{ frame: string; x: number; y: number }>;
  people?: { x0: number; y: number; dirs: string[] };
  /** The zoom-2 crop's centre tile. */
  focus?: [number, number];
}

/** Hollowmere's square in miniature: ground chars, solid chars (`.` = none) and objects. */
export const VIGNETTE: Layout = {
  ground: [
    'gggggggggggggggggggggg',
    'gggccccccccccccccggggg',
    'gggccccccccccccccggggg',
    'gggccccccccccccccggggg',
    'gggccccccccccccccggggg',
    'gggccccccccccccccggggg',
    'gggccccccccccccccggggg',
    'gggccccccccccccccggggg',
    'gggcccccccccccccccpppg',
    'ggccccccccccccccccpggg',
    'ggcccccccfffccccccpggg',
    'ggcccccccfffccccccpggg',
    'ggccccccccccccccccpggg',
    'gggcccccccccccccccpggg',
    'ggggggggggggggggppgggg',
    'gggggggggggggggggggggg',
  ],
  solids: [
    'TT.T.TT.TT.TT.TT.T.TTT',
    'F....................T',
    'F....................R',
    'F...................TT',
    'F.....................',
    'F...................TT',
    'F....................R',
    'F.....................',
    '......................',
    'R.....................',
    '......................',
    '...................K..',
    'F..................K..',
    'F.....................',
    'R.....................',
    'TTT.TRT..FFFFFFF.TT.TT',
  ],
  building: { x: 3, y: 1, w: 12, h: 7, art: 'tavern' },
  props: [
    { frame: 'prop_bell', x: 10, y: 10 },
    { frame: 'prop_pump', x: 7, y: 11 },
    { frame: 'prop_lanternPost_lit', x: 5, y: 9 },
    { frame: 'prop_lanternPost_lit', x: 15, y: 12 },
  ],
  /** The look idling in 8 directions on a row across the square. */
  people: { x0: 5, y: 13, dirs: ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] },
};

/** Blackpine's yard in miniature: the Forge behind the shift bell and the pump, pines and the tram rails. */
export const CAMP: Layout = {
  ground: [
    'gggggggggggggggggg',
    'gggppppppppppppggg',
    'ggpppppppppppppggg',
    'ggpppppppppppppggg',
    'ggpppppppppppppggg',
    'ggpppppppppppppppg',
    'ggpppppppdddpppppg',
    'ggppppppddddpppppg',
    'ggpppppppdddppppgg',
    'ggpppppppppppp=ggg',
    'gggppppppppppp=ggg',
    'gggggggggggggg=ggg',
    'gggggggggggggg=ggg',
    'gggggggggggggg=ggg',
  ],
  solids: [
    'TTTTT.TTTTTTT.TTTT',
    'T.................',
    'T................T',
    'T.................',
    'T................T',
    'T.................',
    '..................',
    'R................T',
    '..................',
    'K................T',
    'K.................',
    'T....F.F.F.F......',
    'TT..............TT',
    'TTTT.TTTTT.TT..TTT',
  ],
  building: { x: 5, y: 1, w: 7, h: 5, art: 'smithy' },
  props: [
    { frame: 'prop_bell', x: 9, y: 8 },
    { frame: 'prop_pump', x: 6, y: 9 },
    { frame: 'prop_lanternPost_lit', x: 4, y: 7 },
    { frame: 'prop_lanternPost_lit', x: 13, y: 9 },
  ],
  focus: [8, 7],
};

interface Atlases {
  ground: Image | null;
  kit: Map<string, Sprite>;
  props: Map<string, Sprite>;
  bld: Map<string, Sprite>;
  look: Map<string, Sprite>;
  lookId: string;
  /** Render px per display px of this folder's frames (1 for the 8-bit and low-poly sets). */
  texels: number;
}

async function loadAtlases(
  assets: string,
  theme: string,
  map: string,
  look: string,
  texels = 1,
): Promise<Atlases> {
  const ground = join(assets, 'ground', `iso_ground_${theme}.png`);
  const props = await readAtlas(join(assets, 'props', 'props.json'));
  for (const [k, v] of await readAtlas(join(assets, 'props', `props_${map}.json`))) props.set(k, v);
  const lookFile = join(assets, 'chars', `char_${look}.json`);
  const lookId = existsSync(lookFile) ? look : 'villager';
  return {
    ground: existsSync(ground) ? await loadImage(readFileSync(ground)) : null,
    kit: await readAtlas(join(assets, 'kit', `iso_kit_${theme}.json`)),
    props,
    bld: await readAtlas(join(assets, 'buildings', `bld_${map}.json`)),
    look: await readAtlas(join(assets, 'chars', `char_${lookId}.json`)),
    lookId,
    texels,
  };
}

/** Ground cell of material `char`, cell c, drawn with its top vertex at (x, y). */
function groundCell(g: SKRSContext2D, a: Atlases, char: string, c: number, x: number, y: number): void {
  const m = GROUND_ROWS.indexOf(char);
  if (!a.ground) return;
  const col = c % COLUMNS;
  const row = 2 * m + Math.floor(c / COLUMNS);
  const t = a.texels;
  g.drawImage(
    a.ground,
    col * CELL_W * t,
    row * CELL_H * t,
    CELL_W * t,
    CELL_H * t,
    x - CELL_W / 2,
    y,
    CELL_W,
    CELL_H,
  );
}

/** The ground layer and the two blend layers of SPRITES 10.12 for a grid of material chars. */
export function drawGround(g: SKRSContext2D, a: Atlases, grid: string[], ox: number, oy: number): void {
  const at = (x: number, y: number) => grid[y]?.[x];
  const variant = (x: number, y: number) => {
    if (at(x, y) !== '=') return (x * 7 + y * 13) % 4;
    if (at(x - 1, y) === '=' || at(x + 1, y) === '=') return (x * 7 + y * 13) % 2;
    if (at(x, y - 1) === '=' || at(x, y + 1) === '=') return 2 + ((x * 7 + y * 13) % 2);
    return 0;
  };
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y]!.length; x++) {
      const t = toScreen(x * 64, y * 64);
      groundCell(g, a, at(x, y)!, variant(x, y), ox + t.x, oy + t.y);
    }
  }
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y]!.length; x++) {
      const own = at(x, y)!;
      const masks = new Map<string, number>();
      const sides: Array<[number, number, number]> = [
        [1, 0, -1],
        [2, 1, 0],
        [4, 0, 1],
        [8, -1, 0],
      ];
      for (const [bit, dx, dy] of sides) {
        const n = at(x + dx, y + dy);
        if (n && BLEND_RANK.indexOf(n) > BLEND_RANK.indexOf(own)) masks.set(n, (masks.get(n) ?? 0) | bit);
      }
      const order = [...masks.keys()]
        .sort((p, q) => BLEND_RANK.indexOf(q) - BLEND_RANK.indexOf(p))
        .slice(0, 2);
      const t = toScreen(x * 64, y * 64);
      for (const n of order) groundCell(g, a, n, 3 + masks.get(n)!, ox + t.x, oy + t.y);
    }
  }
}

interface Placed {
  depth: number;
  paint: () => void;
}

function vignette(
  a: Atlases,
  smooth: boolean,
  v: Layout = VIGNETTE,
): { canvas: Canvas; lights: { x: number; y: number }[]; focus: { x: number; y: number } } {
  const w = v.ground[0]!.length;
  const h = v.ground.length;
  const ox = h * 64 + 64;
  const oy = 220;
  const canvas = createCanvas((w + h) * 64 + 128, ((w + h) * 64) / 2 + oy + 64);
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = smooth;
  g.fillStyle = INK;
  g.fillRect(0, 0, canvas.width, canvas.height);
  drawGround(g, a, v.ground, ox, oy);
  const artScale = ART_SCALE / a.texels;

  const placed: Placed[] = [];
  const at = (tx: number, ty: number) => {
    const c = tileCentre(tx, ty);
    return { x: ox + c.x, y: oy + c.y, depth: c.y };
  };
  const inTavern = (x: number, y: number) =>
    x >= v.building.x &&
    x < v.building.x + v.building.w &&
    y >= v.building.y &&
    y < v.building.y + v.building.h;
  v.solids.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const kind = KIT_OF[ch];
      if (!kind || inTavern(x, y)) return;
      const p = at(x, y);
      const frame = `${kind}/full/${(x * 7 + y * 13) % 4}`;
      const s = a.kit.get(frame);
      const cell = KIT_CELLS[`${kind}/full`]!;
      placed.push({
        depth: p.depth,
        paint: () => (s ? draw(g, s, p.x, p.y, artScale) : greybox(g, p.x, p.y, cell[1] * 1.5)),
      });
    }),
  );
  for (let dy = 0; dy < v.building.h; dy++) {
    for (let dx = 0; dx < v.building.w; dx++) {
      const p = at(v.building.x + dx, v.building.y + dy);
      const s = a.bld.get(`${v.building.art}#${dx}_${dy}`);
      const anchor = toScreen((v.building.x + v.building.w / 2) * 64, (v.building.y + v.building.h / 2) * 64);
      placed.push({
        depth: p.depth,
        paint: () =>
          s
            ? draw(g, s, ox + anchor.x, oy + anchor.y, artScale)
            : dx === 0 || dy === 0
              ? undefined
              : greybox(g, p.x, p.y, 150, 128),
      });
    }
  }
  const lights: { x: number; y: number }[] = [];
  for (const pr of v.props) {
    const p = at(pr.x, pr.y);
    const s = a.props.get(pr.frame);
    if (pr.frame.startsWith('prop_lanternPost')) lights.push({ x: p.x, y: p.y - 100 });
    placed.push({
      depth: p.depth,
      paint: () => (s ? draw(g, s, p.x, p.y, artScale) : greybox(g, p.x, p.y, 90, 24)),
    });
  }
  (v.people?.dirs ?? []).forEach((dir, i) => {
    const p = at(v.people!.x0 + i, v.people!.y);
    const s = a.look.get(`char/${a.lookId}/idle/${dir}/000`);
    // A round-5 look is packed at half size; the round-4 villager atlas is still at display size.
    const scale = a.lookId === 'villager' ? 1 : artScale;
    placed.push({
      depth: p.depth + 0.5,
      paint: () => (s ? draw(g, s, p.x, p.y, scale) : greybox(g, p.x, p.y, 100, 30)),
    });
  });
  placed.sort((p, q) => p.depth - q.depth);
  for (const p of placed) p.paint();
  const f = at(...(v.focus ?? [8, 9])); // the zoom-2 crop's centre, by default between the tavern door and the bell
  return { canvas, lights, focus: { x: f.x, y: f.y - 60 } };
}

/** The night frame: the darkness ambient (ink 0.9, metrics.json lighting) with soft lantern pools and glows. */
function night(src: Canvas, lights: { x: number; y: number }[], alpha = 0.9): Canvas {
  const out = createCanvas(src.width, src.height);
  const g = out.getContext('2d');
  g.drawImage(src, 0, 0);
  const dark = createCanvas(src.width, src.height);
  const d = dark.getContext('2d');
  d.fillStyle = `rgba(18,20,28,${alpha})`;
  d.fillRect(0, 0, dark.width, dark.height);
  d.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    const r = 260;
    const grad = d.createRadialGradient(l.x, l.y + 100, 0, l.x, l.y + 100, r);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.8)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = grad;
    d.beginPath();
    d.ellipse(l.x, l.y + 100, r, r / 2, 0, 0, 2 * Math.PI);
    d.fill();
  }
  g.drawImage(dark, 0, 0);
  g.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    const grad = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, 180);
    grad.addColorStop(0, 'rgba(255,180,87,0.25)');
    grad.addColorStop(1, 'rgba(255,180,87,0)');
    g.fillStyle = grad;
    g.fillRect(l.x - 180, l.y - 180, 360, 360);
  }
  return out;
}

/** Gate A: day and night at zoom 1 above, a zoom-2 crop of each below. */
export async function gateSheet(assets: string, smooth: boolean, look = 'baker'): Promise<Buffer> {
  const a = await loadAtlases(assets, 'harbour', 'hollowmere', look);
  const { canvas: day, lights, focus } = vignette(a, smooth);
  const nightC = night(day, lights);
  const cw = 1280;
  const ch = 720;
  const out = createCanvas(day.width * 2 + 32, day.height + ch + 48);
  const g = out.getContext('2d');
  g.imageSmoothingEnabled = smooth;
  g.fillStyle = INK;
  g.fillRect(0, 0, out.width, out.height);
  g.drawImage(day, 0, 0);
  g.drawImage(nightC, day.width + 32, 0);
  const cx = focus.x - cw / 4;
  const cy = focus.y - ch / 4;
  g.drawImage(day, cx, cy, cw / 2, ch / 2, 0, day.height + 32, cw, ch);
  g.drawImage(nightC, cx, cy, cw / 2, ch / 2, day.width + 32, day.height + 32, cw, ch);
  return out.toBuffer('image/png');
}

/** The look proposal's view of the square: three figures by the pump, the crop between the tavern door and the bell. */
export const PROPOSAL: Layout = {
  ...VIGNETTE,
  people: { x0: 8, y: 11, dirs: ['s', 'se', 'sw'] },
  focus: [9, 10],
};

export interface ProposalColumn {
  label: string;
  assets: string;
  texels: number;
  smooth: boolean;
}

/** `<label>=<assets dir>[:texels][:smooth]` */
export function parseColumn(arg: string): ProposalColumn {
  const eq = arg.indexOf('=');
  if (eq < 0) throw new Error(`proposal: ${arg} is not <label>=<assets dir>[:texels][:smooth]`);
  const [assets, ...flags] = arg.slice(eq + 1).split(':') as [string, ...string[]];
  const texels = Number(flags.find((f) => /^\d+$/.test(f)) ?? 1);
  return { label: arg.slice(0, eq), assets, texels, smooth: flags.includes('smooth') };
}

/** One cell per column: the room at zoom 2 above the same view at zoom 1; two cells per row. */
export async function proposalSheet(columns: ProposalColumn[]): Promise<Buffer> {
  const cw = 800;
  const ch = 450;
  const pad = 16;
  const label = 28;
  const cellH = label + ch * 2 + pad;
  const cols = 2;
  const out = createCanvas(cols * (cw + pad) + pad, Math.ceil(columns.length / cols) * cellH + pad);
  const g = out.getContext('2d');
  g.fillStyle = INK;
  g.fillRect(0, 0, out.width, out.height);
  for (const [i, c] of columns.entries()) {
    const a = await loadAtlases(c.assets, 'harbour', 'hollowmere', 'baker', c.texels);
    const { canvas, focus } = vignette(a, c.smooth, PROPOSAL);
    const x = pad + (i % cols) * (cw + pad);
    const y = pad + Math.floor(i / cols) * cellH;
    g.fillStyle = '#D9D2C2';
    g.font = '18px sans-serif';
    g.fillText(`${c.label}  (zoom 2 above, zoom 1 below)`, x, y + 20);
    g.imageSmoothingEnabled = c.smooth;
    g.drawImage(canvas, focus.x - cw / 4, focus.y - ch / 4, cw / 2, ch / 2, x, y + label, cw, ch);
    g.drawImage(canvas, focus.x - cw / 2, focus.y - ch / 2, cw, ch, x, y + label + ch, cw, ch);
  }
  return out.toBuffer('image/png');
}

/** One column of the look sheet: the three subjects as separate PNGs, named by the column's label. */
export async function lookSheets(c: ProposalColumn): Promise<Record<string, Buffer>> {
  const a = await loadAtlases(c.assets, 'harbour', 'hollowmere', 'baker', c.texels);
  const artScale = ART_SCALE / a.texels;
  const out: Record<string, Buffer> = {};
  const labelled = (w: number, h: number, text: string) => {
    const canvas = createCanvas(w, h);
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = c.smooth;
    g.fillStyle = INK;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#D9D2C2';
    g.font = '16px sans-serif';
    g.fillText(text, 8, 20);
    return { canvas, g };
  };
  // The figure: idle south, south-east and south-west at zoom 2, each in its own slot.
  {
    const zoom = 2;
    const { canvas, g } = labelled(540, 400, `${c.label}: ${a.lookId} idle at zoom 2`);
    ['s', 'se', 'sw'].forEach((dir, i) => {
      const s = a.look.get(`char/${a.lookId}/idle/${dir}/000`);
      const x = 90 + i * 180;
      if (s) draw(g, s, x, 380, zoom * (a.lookId === 'villager' ? 1 : artScale));
      else greybox(g, x, 380, 100 * zoom, 30 * zoom);
    });
    out.figure = canvas.toBuffer('image/png');
  }
  // The room: the tavern whole at zoom 1 above, its door and front wall at zoom 2 below.
  {
    const { canvas: v } = vignette(a, c.smooth, PROPOSAL);
    const at = (tx: number, ty: number, dy: number) => {
      const t = tileCentre(tx, ty);
      return { x: PROPOSAL.ground.length * 64 + 64 + t.x, y: 220 + t.y + dy };
    };
    const whole = at(9, 5, 20);
    const front = at(8, 8, -70);
    const cw = 1000;
    const ch = 500;
    const { canvas, g } = labelled(
      cw,
      ch * 2 + 40,
      `${c.label}: the tavern at zoom 1 above, its door at zoom 2 below`,
    );
    g.drawImage(v, whole.x - cw / 2, whole.y - ch / 2, cw, ch, 0, 28, cw, ch);
    g.drawImage(v, front.x - cw / 4, front.y - ch / 4, cw / 2, ch / 2, 0, ch + 40, cw, ch);
    out.room = canvas.toBuffer('image/png');
  }
  // The BlackPine lodge: whole at zoom 1, its middle at zoom 2 beside it; drawn from its slices alone.
  {
    const bld = await readAtlas(join(c.assets, 'buildings', 'bld_blackpine.json'));
    const slices = [...bld.entries()].filter(([k]) => k.startsWith('lodge#')).map(([, s]) => s);
    let x0 = 0;
    let y0 = 0;
    let x1 = 0;
    let y1 = 0;
    for (const s of slices) {
      x0 = Math.min(x0, s.dx * artScale);
      y0 = Math.min(y0, s.dy * artScale);
      x1 = Math.max(x1, (s.dx + s.sw) * artScale);
      y1 = Math.max(y1, (s.dy + s.sh) * artScale);
    }
    const w = Math.ceil(x1 - x0) || 400;
    const h = Math.ceil(y1 - y0) || 300;
    const whole = createCanvas(w, h);
    const wg = whole.getContext('2d');
    wg.imageSmoothingEnabled = c.smooth;
    if (slices.length === 0) greybox(wg, w / 2, h, 200, 300);
    for (const s of slices) draw(wg, s, -x0, -y0, artScale);
    const cw = 560;
    const ch = 400;
    const { canvas, g } = labelled(
      w + 16 + cw,
      Math.max(h, ch) + 28,
      `${c.label}: the lodge at zoom 1, its door end at zoom 2`,
    );
    g.drawImage(whole, 0, 28);
    // The zoom-2 crop sits on the end wall with the door, low and right of the slices' centre.
    g.drawImage(whole, w * 0.72 - cw / 4, h * 0.7 - ch / 4, cw / 2, ch / 2, w + 16, 28, cw, ch);
    out.building = canvas.toBuffer('image/png');
  }
  return out;
}

function withoutPeople(v: Layout): Layout {
  const { people: _people, ...rest } = v;
  return rest;
}

/**
 * The lobby thumbnail of a map (art plan 3.9): its hub vignette at dusk, the lanterns lit, finished like an
 * illustration to a 160 x 90 art grid and tripled to 480 x 270 lossless WebP; with the main finish off, the
 * composite box-resized to 480 x 270 at `offWebpQuality`.
 */
export async function thumbnail(
  assets: string,
  map: 'hollowmere' | 'blackpine',
  on: boolean,
): Promise<Buffer> {
  const theme = map === 'hollowmere' ? 'harbour' : 'timber';
  const a = await loadAtlases(assets, theme, map, 'none');
  const { canvas, lights } = vignette(a, !on, map === 'hollowmere' ? withoutPeople(VIGNETTE) : CAMP);
  const dusk = night(canvas, lights, 0.6);
  const ctx = dusk.getContext('2d');
  const img = ctx.getImageData(0, 0, dusk.width, dusk.height);
  const rgba: Rgba = { width: img.width, height: img.height, data: new Uint8Array(img.data.buffer) };
  // Crop the diamond's middle at 16:9 so the corners of void stay out.
  const cw = Math.round(dusk.width * 0.62);
  const ch = Math.round((cw * 9) / 16);
  const box: [number, number, number, number] = [
    Math.round((dusk.width - cw) / 2),
    Math.round((dusk.height - ch) / 2),
    cw,
    ch,
  ];
  if (on) {
    const art = finishIllustration(rgba, 160, 90, { crop: box });
    return encodeWebp(upscaleNearest(art, 3));
  }
  return encodeWebp(boxResize(crop(rgba, box, 16, 9), 480, 270), offWebpQuality);
}

/** A test patch of one theme's ground at zoom 1, with a zoom-2 crop. */
export async function groundSheet(assets: string, theme: string): Promise<Buffer> {
  const a = await loadAtlases(assets, theme, theme === 'harbour' ? 'hollowmere' : 'blackpine', 'none');
  const grid = [
    'gggggggggggggg',
    'gggggppppggggg',
    'ggcccccccpgggg',
    'ggcccccccpglll',
    'gccccffcccplll',
    'gccccffccccpll',
    'ggcccccccgggll',
    'gggccccggguull',
    'sssssggg==guul',
    '~~~ssssg==ssuu',
    'OO~~~sss==ss~~',
    'OOOO~~~~=====~',
    'OOOOOO~~~~~~OO',
    'OOOOOOOOOOOOOO',
  ];
  const n = grid.length;
  const day = createCanvas(n * 128 + 128, n * 64 + 64);
  const g = day.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = INK;
  g.fillRect(0, 0, day.width, day.height);
  drawGround(g, a, grid, n * 64 + 64, 32);
  const out = createCanvas(day.width, day.height + 640);
  const o = out.getContext('2d');
  o.imageSmoothingEnabled = false;
  o.fillStyle = INK;
  o.fillRect(0, 0, out.width, out.height);
  o.drawImage(day, 0, 0);
  o.drawImage(
    day,
    day.width / 2 - 320,
    day.height / 2 - 160,
    640,
    320,
    day.width / 2 - 640,
    day.height,
    1280,
    640,
  );
  return out.toBuffer('image/png');
}

/** Every frame of a kit in its grid order, drawn standing on a ground diamond, at 2x (the draw scale). */
export async function kitSheet(assets: string, theme: string): Promise<Buffer> {
  const a = await loadAtlases(assets, theme, 'none', 'none');
  return frameSheet(a, a.kit, theme === 'harbour' ? 'c' : 'p', ART_SCALE);
}

/**
 * Every frame of one atlas (`props/props.json`, `clues/clues.json`) in name order, each on a ground cell of
 * the harbour cobble; packed atlases are drawn at 2x, the display-size clue page at 1x.
 */
export async function atlasSheet(assets: string, rel: string): Promise<Buffer> {
  const a = await loadAtlases(assets, 'harbour', 'none', 'none');
  return frameSheet(a, await readAtlas(join(assets, rel)), 'c', rel.startsWith('clues') ? 1 : ART_SCALE);
}

/**
 * Every building of a `bld_<mapId>` atlas reassembled from its slices: each slice drawn at the building's
 * anchor, back tiles first, as the client y-sorts them (SPRITES 10.5, 10.6).
 */
export async function buildingSheet(assets: string, map: string): Promise<Buffer> {
  const slices = await readAtlas(join(assets, 'buildings', `bld_${map}.json`));
  const arts = new Map<string, Array<[number, number, Sprite]>>();
  for (const [name, sprite] of slices) {
    const [art, tile] = name.split('#') as [string, string];
    const [dx, dy] = tile.split('_').map(Number) as [number, number];
    arts.set(art, [...(arts.get(art) ?? []), [dx, dy, sprite]]);
  }
  const cols = 3;
  const cw = 1400;
  const ch = 1000;
  const out = createCanvas(cols * cw, Math.ceil(arts.size / cols) * ch);
  const g = out.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#2C3240';
  g.fillRect(0, 0, out.width, out.height);
  [...arts.keys()].sort().forEach((art, i) => {
    const x = (i % cols) * cw + cw / 2;
    const y = Math.floor(i / cols) * ch + ch - 380;
    const tiles = arts.get(art)!.sort((p, q) => p[0] + p[1] - (q[0] + q[1]));
    for (const [, , sprite] of tiles) draw(g, sprite, x, y, ART_SCALE);
  });
  return out.toBuffer('image/png');
}

function frameSheet(a: Atlases, frames: Map<string, Sprite>, floor: string, scale: number): Buffer {
  const names = [...frames.keys()].sort();
  const cols = 8;
  const out = createCanvas(cols * 200, Math.ceil(names.length / cols) * 300);
  const g = out.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#2C3240';
  g.fillRect(0, 0, out.width, out.height);
  names.forEach((name, i) => {
    const x = (i % cols) * 200 + 100;
    const y = Math.floor(i / cols) * 300 + 270;
    groundCell(g, a, floor, 0, x, y - 32);
    draw(g, frames.get(name)!, x, scale === 1 ? y - 32 : y, scale);
  });
  return out.toBuffer('image/png');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const fi = args.indexOf('--finish');
  const li = args.indexOf('--look');
  const smooth = fi >= 0 && args[fi + 1] === 'off';
  const look = li >= 0 ? args[li + 1]! : 'baker';
  const flags = new Set([fi, li].filter((i) => i >= 0).flatMap((i) => [i, i + 1]));
  const rest = args.filter((_, i) => !flags.has(i));
  const [mode, assets, ...more] = rest;
  let png: Buffer;
  let out: string | undefined;
  if (mode === 'gate' && assets) {
    out = more[0];
    png = await gateSheet(assets, smooth, look);
  } else if (mode === 'proposal' && assets && more.length > 0) {
    out = assets;
    png = await proposalSheet(more.map(parseColumn));
  } else if (mode === 'look' && assets && more.length > 0) {
    for (const c of more.map(parseColumn)) {
      for (const [subject, buf] of Object.entries(await lookSheets(c))) {
        const file = join(assets, `${subject}-${c.label}.png`);
        writeFileSync(file, buf);
        console.log(`review-world: look ${subject} -> ${file}`);
      }
    }
    process.exit(0);
  } else if (mode === 'thumbs' && assets && more[0]) {
    for (const map of ['hollowmere', 'blackpine'] as const) {
      const file = join(more[0], `thumb_${map}.webp`);
      writeFileSync(file, await thumbnail(assets, map, !smooth));
      console.log(`review-world: thumb_${map} -> ${file}`);
    }
    process.exit(0);
  } else if (mode === 'buildings' && assets && more[0]) {
    out = more[1];
    png = await buildingSheet(assets, more[0]);
  } else if (mode === 'atlas' && assets && more[0]) {
    out = more[1];
    png = await atlasSheet(assets, more[0]);
  } else if ((mode === 'ground' || mode === 'kit') && assets && more[0]) {
    out = more[1];
    png = mode === 'ground' ? await groundSheet(assets, more[0]) : await kitSheet(assets, more[0]);
  } else {
    console.error('usage: tsx review-world.ts gate <assets> <out.png> [--finish on|off] [--look id]');
    console.error('       tsx review-world.ts ground|kit <assets> <theme> <out.png>');
    console.error('       tsx review-world.ts proposal <out.png> <label>=<assets>[:texels][:smooth]...');
    console.error('       tsx review-world.ts look <out dir> <label>=<assets>[:texels][:smooth]...');
    process.exit(2);
  }
  if (!out) process.exit(2);
  writeFileSync(out, png);
  console.log(`review-world: ${mode} -> ${out}`);
}
