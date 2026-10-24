// Key grammar and frame naming from docs/SPRITES.md. The rig's Python copy is tools/blender/rig_common.py.

export const DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
export type Dir = (typeof DIRECTIONS)[number];

/** Round 5: hats are nameplate glyphs, so the hat passes are gone (art plan 4.2). */
export const PASSES = ['body', 'scarf', 'blood'] as const;
export type Pass = (typeof PASSES)[number];

/**
 * The V1 clips: frame count and whether the anim loops (docs/SPRITES.md 3); 272 frames per pass since the owner's
 * option B trimmed idle and interact to 6 (A161; 304 until then). The placeholder figures render these five.
 */
export const V1_CLIPS = {
  idle: { frames: 6, loop: true },
  walk: { frames: 8, loop: true },
  swing: { frames: 6, loop: false },
  interact: { frames: 6, loop: true },
  die: { frames: 8, loop: false },
} as const;
export type Anim = keyof typeof V1_CLIPS;

/** The four diagonals a four-direction clip renders, never mirrored (SPRITES 3). */
export const FOUR_DIRS = ['ne', 'se', 'sw', 'nw'] as const satisfies readonly Dir[];

export interface ClipSpec {
  frames: number;
  loop: boolean;
  /** The directions rendered: all eight, or the four diagonals. */
  dirs: readonly Dir[];
  /** On the look's lazy second pair of pages (`char_<look>_2`, `ovl_<look>_2`), loaded on first use. */
  lazy: boolean;
}
const clip = (frames: number, loop: boolean, dirs: readonly Dir[] = DIRECTIONS, lazy = false): ClipSpec => ({
  frames,
  loop,
  dirs,
  lazy,
});

/**
 * The clip table of a look (SPRITES 3; the rig's copy is `tools/blender/rig_common.py` `R8_CLIPS`), at the frame
 * counts of the owner's option B (A161): the V1 five, `run`, `strike` and `hurt` in eight directions; `limp`,
 * `stagger`, the one-shots and the mood idles in four; the rare clips on the lazy pair, outside the resident cap.
 */
export const R8_CLIPS = {
  idle: clip(6, true),
  walk: clip(8, true),
  swing: clip(6, false),
  interact: clip(6, true),
  die: clip(8, false),
  run: clip(6, true),
  limp: clip(6, true, FOUR_DIRS),
  stagger: clip(6, true, FOUR_DIRS),
  strike: clip(4, false),
  hurt: clip(3, false),
  inspect: clip(4, false, FOUR_DIRS),
  cower: clip(4, true, FOUR_DIRS),
  fidget: clip(4, true, FOUR_DIRS),
  stomp: clip(4, true, FOUR_DIRS),
  stunned: clip(4, true, FOUR_DIRS),
  knockdown: clip(4, false, FOUR_DIRS, true),
  down: clip(2, true, FOUR_DIRS, true),
  getup: clip(4, false, FOUR_DIRS, true),
  rob: clip(4, false, FOUR_DIRS, true),
  eat: clip(4, false, FOUR_DIRS, true),
  threaten: clip(4, false, FOUR_DIRS, true),
} as const satisfies Record<string, ClipSpec>;
export type Clip = keyof typeof R8_CLIPS;
export const CLIP_NAMES = Object.keys(R8_CLIPS) as Clip[];

/**
 * The clips a townsfolk look never plays (option B, A161; seams.md 5): a villager figure is never a seat, so the
 * family renders neither the Knife's swing nor strike, rob, threaten or inspect.
 */
export const FAMILY_DROPS: readonly Clip[] = ['swing', 'strike', 'rob', 'threaten', 'inspect'];
/** Every townsfolk look id begins with this (looks.json `villagers`). */
export const VILLAGER_PREFIX = 'villager';
export const isVillager = (body: string): boolean => body.startsWith(VILLAGER_PREFIX);

/** The clip table of one look, in table order: every clip of a deck look, less `FAMILY_DROPS` for the family. */
export function lookClips(body: string): ReadonlyMap<Clip, ClipSpec> {
  const drops = isVillager(body) ? new Set<Clip>(FAMILY_DROPS) : new Set<Clip>();
  return new Map(CLIP_NAMES.filter((c) => !drops.has(c)).map((c) => [c, R8_CLIPS[c]]));
}

/** True for a clip on the lazy pair; false for a resident clip or a name the table lacks. */
export const isLazy = (anim: string): boolean =>
  (R8_CLIPS as Record<string, ClipSpec | undefined>)[anim]?.lazy === true;

/** The frame tails `<body>/<anim>/<dir>/<nnn>` of one look's resident or lazy clips, in table order. */
export function lookTails(body: string, lazy: boolean): string[] {
  const tails: string[] = [];
  for (const [anim, c] of lookClips(body)) {
    if (c.lazy !== lazy) continue;
    for (const dir of c.dirs)
      for (let i = 0; i < c.frames; i++) tails.push(`${body}/${anim}/${dir}/${String(i).padStart(3, '0')}`);
  }
  return tails;
}

/** The rendered frames a pass of one look (SPRITES 3): the deck 504 resident and 88 lazy, the family 408 and 56. */
export function frameCounts(body: string): { resident: number; lazy: number } {
  let resident = 0;
  let lazy = 0;
  for (const c of lookClips(body).values()) {
    if (c.lazy) lazy += c.frames * c.dirs.length;
    else resident += c.frames * c.dirs.length;
  }
  return { resident, lazy };
}

/** Render cells at the display scale; the pixel finish halves them (64 px packed, feet at 56; SPRITES 10.3). */
export const CELL_PX = 128;
export const FEET_ROW_PX = 112;
/** Page caps of a look (art plan 1.4): one body page and one overlay page. */
export const CHAR_PAGE = { w: 1024, h: 1024 } as const;
export const OVL_PAGE = { w: 1024, h: 512 } as const;
export const FPS = 12;
/** Clips rendered in a larger cell, as [cell px, feet row px] (tools/blender/rig_common.py CLIP_CELL). */
export const CLIP_CELL: Partial<Record<Clip, readonly [number, number]>> = {
  die: [256, 128],
  knockdown: [256, 128],
  down: [256, 128],
  getup: [256, 128],
};

/** Every anim name a frame may carry: the clip table plus `carry` and `hide`, reserved and never rendered. */
export const ANIM_NAMES: readonly string[] = [...CLIP_NAMES, 'carry', 'hide'];
export const FRAME_RE = new RegExp(`^char_(\\w+)_(${ANIM_NAMES.join('|')})_(n|ne|e|se|s|sw|w|nw)_(\\d{3})$`);
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

/** `char_<body>` and `ovl_<body>`; the lazy pair of a look (SPRITES 3) is `char_<body>_2` and `ovl_<body>_2`. */
export function textureKey(pass: Pass, body: string, lazy = false): string {
  return `${pass === 'body' ? `char_${body}` : `ovl_${body}`}${lazy ? '_2' : ''}`;
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

/** The Small-profile building exteriors (`type: image`, origin at the front wall's base). */
export const BUILDING_KEYS: readonly string[] = [
  'bld_tavern_ext',
  'bld_apoth_ext',
  'bld_widow_ext',
  'bld_bakery_ext',
];

/** The ground tilesets (`type: image`, four 64 px variants in a 256 x 64 row). */
export const TILESET_KEYS: readonly string[] = [
  'tiles_grass',
  'tiles_path',
  'tiles_cobble',
  'tiles_floorboards',
  'tiles_caverock',
  'tiles_forestfloor',
];

/** The `vfx` texture: anim key -> frame count; frames are `<anim>/<nnn>`, 12 fps, played once. */
export const VFX_CLIPS: Readonly<Record<string, number>> = {
  vfx_blood_pool: 8,
  vfx_blood_splat: 12,
  vfx_vote_stamp: 10,
  vfx_dust_step: 6,
  vfx_disguise: 8,
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
