// Placeholder stand-ins owned by Session 5L (art plan 1.2 item 6): the world looks of looks.json, the
// villager and the vfx sheet. placeholder.ts collects `placeholderEntries()`.
//
// Each character is a greybox figure in the look's base and second tokens, drawn at the display scale
// (128 px cells, `die` 256) and finished like the real renders (snapped and mode-halved to 64 px cells,
// `die` 128, feet halved), so `?art=placeholder` has the real keys' cells, pivots and draw scale.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, type Canvas, type SKRSContext2D } from '@napi-rs/canvas';
import { encodePng, type Rgba } from './bleed.ts';
import type { FeetManifest } from './gen-anims.ts';
import {
  CELL_PX,
  CLIP_CELL,
  DIRECTIONS,
  FEET_ROW_PX,
  PASSES,
  V1_CLIPS,
  VFX_CLIPS,
  frameFileName,
  frameKey,
  staticFrameNames,
  type Anim,
  type Dir,
  type Pass,
} from './keys.ts';
import { packCharacter, type PackInput } from './pack.ts';
import { packStatic, type StaticManifest } from './pack-static.ts';
import { encodeWebp, finishRender } from './pixel.ts';
import {
  PALETTE,
  inFolder,
  label,
  registerFont,
  shape,
  type PlaceholderEntry,
  type Token,
} from './placeholder-kit.ts';

export const BODY = 'villager';

interface LookRow {
  id: string;
  portrait: string;
  bodyAtlas: string | null;
  palette: { base: Token; second: Token; accent: Token };
}
const LOOKS_JSON = join(import.meta.dirname, '../../packages/content/data/looks.json');

/** Every look of looks.json, in file order: the world looks and the portrait-only cover cards. */
export function allLooks(): LookRow[] {
  const doc = JSON.parse(readFileSync(LOOKS_JSON, 'utf8')) as { looks: Record<string, LookRow> };
  return Object.values(doc.looks);
}

/** The world looks (a non-null `bodyAtlas`), in file order; the cover cards have no body. */
export function worldLooks(): LookRow[] {
  return allLooks().filter((l) => l.bodyAtlas !== null);
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

// ---------------------------------------------------------------- characters

/** Pose of a frame: vertical bob (px), lean angle (radians) about the feet, and an arm angle. */
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
    case 'interact':
      return { bob: 4, lean: 0.1 * side, arm: 0.5 + 0.3 * Math.sin(t * 2 * Math.PI) };
    case 'die':
      return { bob: 0, lean: side * (Math.PI / 2) * Math.min(1, i / (n - 2)), arm: null };
  }
}

const BODY_W = 30;
const BODY_H = 96;

interface Colours {
  base: Token;
  second: Token;
}

function drawLayer(
  g: SKRSContext2D,
  pass: Pass,
  anim: Anim,
  dir: Dir,
  i: number,
  feet: [number, number],
  c: Colours,
): void {
  const p = pose(anim, dir, i);
  const [vx, vy] = DIR_VEC[dir];
  g.save();
  g.translate(feet[0], feet[1] - p.bob);
  g.rotate(p.lean);
  const top = -BODY_H;
  const headY = top + 14;
  if (pass === 'body') {
    shape(g, c.base, () => g.roundRect(-BODY_W / 2, top + 26, BODY_W, BODY_H - 26, 8));
    shape(g, 'bone', () => g.arc(0, headY, 12, 0, 2 * Math.PI));
    // Facing arrow on the chest in the second token, and a nose dot on the head towards the facing.
    shape(g, c.second, () => g.arc(0, top + 50, 9, 0, 2 * Math.PI));
    g.beginPath();
    g.moveTo(-vx * 6, top + 50 - vy * 6);
    g.lineTo(vx * 6, top + 50 + vy * 6);
    g.moveTo(vx * 6 - (vx * 4 - vy * 4), top + 50 + vy * 6 - (vy * 4 + vx * 4));
    g.lineTo(vx * 6, top + 50 + vy * 6);
    g.lineTo(vx * 6 - (vx * 4 + vy * 4), top + 50 + vy * 6 - (vy * 4 - vx * 4));
    g.lineWidth = 3;
    g.strokeStyle = PALETTE.ink;
    g.stroke();
    if (vy >= 0 || Math.abs(vx) > 0.5)
      shape(g, 'slate', () => g.arc(vx * 8, headY + vy * 3, 3, 0, 2 * Math.PI), false);
    if (p.arm !== null) {
      const a = Math.atan2(vy, vx) + p.arm;
      g.beginPath();
      g.moveTo(0, top + 36);
      g.lineTo(Math.cos(a) * 30, top + 36 + Math.sin(a) * 30);
      g.lineWidth = 6;
      g.strokeStyle = PALETTE.ink;
      g.stroke();
    }
  } else if (pass === 'scarf') {
    shape(g, 'bone', () => g.roundRect(-BODY_W / 2 - 2, top + 26, BODY_W + 4, 10, 3));
    shape(g, 'bone', () => g.rect(-vx * 12 - 4, top + 32, 8, 16));
  } else {
    shape(g, 'blood', () => g.arc(-6, top + 48, 8, 0, 2 * Math.PI), false);
    shape(g, 'blood', () => g.arc(7, top + 62, 6, 0, 2 * Math.PI), false);
    shape(g, 'blood', () => g.arc(-BODY_W / 2, top + 68, 5, 0, 2 * Math.PI), false);
  }
  g.restore();
}

function finished(canvas: Canvas): Buffer {
  const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  const img: Rgba = { width: d.width, height: d.height, data: new Uint8Array(d.data.buffer) };
  return encodePng(finishRender(img, true));
}

/** Every frame of one greybox body, finished to packed size, with its halved Feet manifest. */
export function characterFrames(
  body: string = BODY,
  colours: Colours = { base: 'fog', second: 'bone' },
): { manifest: FeetManifest; framesByPass: Map<Pass, PackInput[]> } {
  const manifest: FeetManifest = {
    version: 1,
    body,
    cell: CELL_PX / 2,
    fps: 12,
    passes: [...PASSES],
    frames: {},
  };
  const framesByPass = new Map<Pass, PackInput[]>(PASSES.map((p) => [p, []]));
  for (const anim of Object.keys(V1_CLIPS) as Anim[]) {
    const [cell, feetRow] = CLIP_CELL[anim] ?? [CELL_PX, FEET_ROW_PX];
    const feet: [number, number] = [cell / 2, feetRow];
    const half: [number, number] = [feet[0] / 2, feet[1] / 2];
    for (const dir of DIRECTIONS) {
      for (let index = 0; index < V1_CLIPS[anim].frames; index++) {
        const id = { body, anim, dir, index };
        manifest.frames[frameFileName(id)] =
          cell === CELL_PX ? { feet: half } : { feet: half, cell: cell / 2 };
        for (const pass of PASSES) {
          const c = createCanvas(cell, cell);
          drawLayer(c.getContext('2d'), pass, anim, dir, index, feet, colours);
          framesByPass.get(pass)!.push({ name: frameKey(pass, id), png: finished(c) });
        }
      }
    }
  }
  return { manifest, framesByPass };
}

// ---------------------------------------------------------------- portraits

/** A labelled greybox card, 384 x 576 lossless WebP like the real `portrait_<lookId>` (art plan 4.5). */
async function portraitPlaceholder(look: LookRow): Promise<Buffer> {
  registerFont();
  const c = createCanvas(384, 576);
  const g = c.getContext('2d');
  g.fillStyle = PALETTE.ink;
  g.fillRect(0, 0, 384, 576);
  shape(g, look.palette.base, () => g.roundRect(96, 220, 192, 356, 40));
  shape(g, 'bone', () => g.arc(192, 170, 62, 0, 2 * Math.PI));
  shape(g, look.palette.second, () => g.rect(150, 300, 84, 30));
  label(g, look.id, 192, 60, 28);
  const d = g.getImageData(0, 0, 384, 576);
  return encodeWebp({ width: 384, height: 576, data: new Uint8Array(d.data.buffer) });
}

// ---------------------------------------------------------------- vfx (greybox marks)

/** A centred palette mark per VFX frame that grows or fades over the clip, so the timing reads. */
export function vfxFrames(): { manifest: StaticManifest; inputs: PackInput[] } {
  const look: Record<string, { cell: number; fill: Token }> = {
    vfx_blood_pool: { cell: 128, fill: 'blood' },
    vfx_blood_splat: { cell: 128, fill: 'blood' },
    vfx_vote_stamp: { cell: 256, fill: 'blood' },
    vfx_dust_step: { cell: 64, fill: 'fog' },
    vfx_disguise: { cell: 128, fill: 'fog' },
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
    } else if (anim === 'vfx_disguise') {
      shape(g, fill, () =>
        g.ellipse(m, m * 1.75 - m * t, m * 0.35, m * 0.6 * (1 - t * 0.7), 0, 0, 2 * Math.PI),
      );
      shape(g, 'mustard', () => g.rect(m - 3, m * 1.6 - m * 1.2 * t, 6, 6), false);
    } else {
      g.globalAlpha = 1 - t * 0.85;
      shape(g, fill, () => g.arc(m, m, m * (0.3 + 0.5 * t), 0, 2 * Math.PI), false);
    }
    manifest.frames[name] = { file: `${name.replace('/', '_')}.png`, cell };
    inputs.push({ name, png: c.toBuffer('image/png') });
  }
  return { manifest, inputs };
}

// ---------------------------------------------------------------- manifest

const charEntries = (body: string) => [
  {
    key: `char_${body}`,
    type: 'multiatlas' as const,
    url: `chars/char_${body}.json`,
    path: 'chars/',
    filter: 'nearest' as const,
  },
  {
    key: `ovl_${body}`,
    type: 'multiatlas' as const,
    url: `chars/ovl_${body}.json`,
    path: 'chars/',
    filter: 'nearest' as const,
  },
  { key: `anims_${body}`, type: 'animation' as const, url: `chars/${body}.anims.json` },
];

export function placeholderEntries(): PlaceholderEntry[] {
  const looks = worldLooks();
  return [
    {
      order: 10,
      entries: charEntries(BODY),
      files: async () => {
        const { manifest, framesByPass } = characterFrames();
        return inFolder('chars/', await packCharacter(BODY, framesByPass, manifest));
      },
    },
    {
      // The world looks, after the villager in the character block (art plan 1.1).
      order: 11,
      entries: looks.flatMap((l) => charEntries(l.id)),
      files: async () => {
        const out = new Map<string, Buffer>();
        for (const l of looks) {
          const { manifest, framesByPass } = characterFrames(l.id, l.palette);
          for (const [k, v] of inFolder('chars/', await packCharacter(l.id, framesByPass, manifest)))
            out.set(k, v);
        }
        return out;
      },
    },
    {
      // Card portraits of every look, world and cover (DOM images, loaded at boot).
      order: 12,
      entries: allLooks().map((l) => ({
        key: l.portrait,
        type: 'image' as const,
        url: `portraits/${l.portrait}.webp`,
      })),
      files: async () => {
        const out = new Map<string, Buffer>();
        for (const l of allLooks()) out.set(`portraits/${l.portrait}.webp`, await portraitPlaceholder(l));
        return out;
      },
    },
    {
      order: 40,
      entries: [
        { key: 'vfx', type: 'multiatlas', url: 'vfx/vfx.json', path: 'vfx/', filter: 'nearest' },
        { key: 'anims_vfx', type: 'animation', url: 'vfx/vfx.anims.json' },
      ],
      files: async () => {
        const vfx = vfxFrames();
        return inFolder('vfx/', await packStatic(vfx.manifest, vfx.inputs));
      },
    },
  ];
}
