// Key grammar and frame naming from docs/SPRITES.md. The rig's Python copy is tools/blender/rig_common.py.

export const DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type Dir = (typeof DIRECTIONS)[number];

export const PASSES = ['body', 'scarf', 'hat_cap', 'hat_bowler', 'blood'] as const;
export type Pass = (typeof PASSES)[number];

/** V1 clips: frame count and whether the anim loops (docs/SPRITES.md 3). */
export const V1_CLIPS = {
  idle: { frames: 8, loop: true },
  walk: { frames: 8, loop: true },
  swing: { frames: 6, loop: false },
  die: { frames: 8, loop: false },
} as const;
export type Anim = keyof typeof V1_CLIPS;

export const CELL_PX = 128;
export const FEET_ROW_PX = 112;
export const FPS = 12;
/** Clips rendered in a larger cell, as [cell px, feet row px] (tools/blender/rig_common.py CLIP_CELL). */
export const CLIP_CELL: Partial<Record<Anim, readonly [number, number]>> = { die: [256, 128] };

export const FRAME_RE =
  /^char_(\w+)_(idle|walk|run|interact|swing|carry|die|hide)_(n|ne|e|se|s|sw|w|nw)_(\d{3})$/;
export const BODY_RE = /^[a-z][a-z0-9]*$/;

export interface FrameId {
  body: string;
  anim: string;
  dir: Dir;
  index: number;
}

/** Rendered file stem, e.g. char_villager_walk_se_003. */
export function frameFileName(f: FrameId): string {
  if (!BODY_RE.test(f.body)) throw new Error(`body id ${f.body} must match ${BODY_RE}`);
  const name = `char_${f.body}_${f.anim}_${f.dir}_${String(f.index).padStart(3, '0')}`;
  if (!FRAME_RE.test(name)) throw new Error(`bad frame name ${name}`);
  return name;
}

export function parseFrameFileName(stem: string): FrameId {
  const m = FRAME_RE.exec(stem);
  if (!m) throw new Error(`${stem} does not match the frame regex`);
  const [, body, anim, dir, index] = m as unknown as [string, string, string, Dir, string];
  if (!BODY_RE.test(body)) throw new Error(`body id ${body} must match ${BODY_RE}`);
  return { body, anim, dir, index: Number(index) };
}

/** Layer prefix of a pass in anim keys: the body pass is `char`, overlays use their own name. */
export function passPrefix(pass: Pass): string {
  return pass === 'body' ? 'char' : pass;
}

/** Anim key, e.g. char/villager/walk/se or scarf/villager/walk/se. */
export function animKey(pass: Pass, body: string, anim: string, dir: Dir): string {
  return `${passPrefix(pass)}/${body}/${anim}/${dir}`;
}

/** Atlas frame name: the anim key plus the 3-digit frame number. */
export function frameKey(pass: Pass, f: FrameId): string {
  return `${animKey(pass, f.body, f.anim, f.dir)}/${String(f.index).padStart(3, '0')}`;
}

export function textureKey(pass: Pass, body: string): string {
  return pass === 'body' ? `char_${body}` : `ovl_${body}`;
}

// ---------------------------------------------------------------- static sheets (docs/SPRITES.md 8)

const HEIGHT_CODES = ['s', 'm', 't'] as const;
const MUD_TINTS = ['dark', 'mid', 'light'] as const;

/** The 21 clue keys of the `clues` texture, one frame each. */
export const CLUE_KEYS: readonly string[] = [
  ...HEIGHT_CODES.flatMap((h) => MUD_TINTS.map((t) => `clue_footprint_${h}_${t}`)),
  ...['red', 'green', 'blue'].map((c) => `clue_thread_${c}`),
  ...['cap', 'bowler', 'bare'].map((k) => `clue_felt_${k}`),
  'clue_smear',
  'clue_print',
  'clue_bucket_wet',
  'clue_fur',
  'clue_claw',
  'clue_drag',
];

/** The square props of the `props` texture: `prop_<kind>` of overworld.json, plus the lantern states. */
export const SQUARE_PROP_KEYS: readonly string[] = [
  'prop_bell',
  'prop_pump',
  'prop_noticeBoard',
  'prop_kitChest',
  'prop_lanternPost_lit',
  'prop_lanternPost_unlit',
];

/** The bakery props of the `props` texture: `prop_<kind>` of bakery.json, the flour sacks by id tail. */
export const BAKERY_PROP_KEYS: readonly string[] = [
  'prop_wakeTable',
  'prop_plate',
  'prop_deadLoaf',
  'prop_ledger',
  'prop_oven',
  'prop_basin',
  'prop_flour_sacks',
];

/** Every frame of the `props` texture. */
export const PROP_KEYS: readonly string[] = [...SQUARE_PROP_KEYS, ...BAKERY_PROP_KEYS];

/** The dark-loft images (`type: image`, DOM backgrounds of the quick-mode loft; GDD 3.11). */
export const LOFT_KEYS: readonly string[] = ['loft_backdrop', 'prop_bedroll', 'prop_bedroll_self'];

/** The `vfx` texture: anim key -> frame count; frames are `<anim>/<nnn>`, 12 fps, played once. */
export const VFX_CLIPS: Readonly<Record<string, number>> = {
  vfx_blood_pool: 8,
  vfx_blood_splat: 12,
  vfx_vote_stamp: 10,
  vfx_dust_step: 6,
};

/** Every frame name a static atlas must contain, in sorted order. */
export function staticFrameNames(atlas: 'clues' | 'props' | 'vfx'): string[] {
  const names =
    atlas === 'clues'
      ? [...CLUE_KEYS]
      : atlas === 'props'
        ? [...PROP_KEYS]
        : Object.entries(VFX_CLIPS).flatMap(([anim, n]) =>
            Array.from({ length: n }, (_, i) => `${anim}/${String(i).padStart(3, '0')}`),
          );
  return names.sort();
}
