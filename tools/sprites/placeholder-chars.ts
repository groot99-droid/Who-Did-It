// Placeholder stand-ins owned by Session 5L (art plan 1.2 item 6): the villager character and the vfx
// sheet. placeholder.ts collects `placeholderEntries()`; 5L adds its keys' greybox stand-ins here.
import { createCanvas, type SKRSContext2D } from '@napi-rs/canvas';
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

// ---------------------------------------------------------------- vfx (greybox marks)

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

// ---------------------------------------------------------------- manifest

export function placeholderEntries(): PlaceholderEntry[] {
  return [
    {
      order: 10,
      entries: [
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
      ],
      files: async () => {
        const { manifest, framesByPass } = characterFrames();
        return inFolder('chars/', await packCharacter(BODY, framesByPass, manifest));
      },
    },
    {
      order: 40,
      entries: [
        { key: 'vfx', type: 'multiatlas', url: 'vfx/vfx.json', path: 'vfx/', filter: 'linear' },
        { key: 'anims_vfx', type: 'animation', url: 'vfx/vfx.anims.json' },
      ],
      files: async () => {
        const vfx = vfxFrames();
        return inFolder('vfx/', await packStatic(vfx.manifest, vfx.inputs));
      },
    },
  ];
}
