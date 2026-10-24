// The pure side of `PlayerView.pose` (SPRITES 3, 10.4, docs/round5/npc.md 4, docs/round8/motion.md 1): which clip a
// presence animation id plays under the figure's status bits and speed, which atlas direction a yaw faces, and the
// diagonal a four-direction clip plays. Kept apart from Phaser so it is tested.
import balance from '@wdi/content/data/balance.json';
import metrics from '@wdi/content/data/metrics.json';
import type { Direction } from '@wdi/shared/direction';
import { screenDirOfYaw } from '@wdi/shared/iso';
import { AnimId, StatusBit } from './animIds';

/** Atlas direction (screen frame) of the server's yaw (radians clockwise from world north; SPRITES 10.4). */
export const dirFromYaw = (yaw: number): Direction => screenDirOfYaw(yaw);

export type Clip =
  | 'idle'
  | 'walk'
  | 'swing'
  | 'die'
  | 'interact'
  | 'strike'
  | 'hurt'
  | 'knockdown'
  | 'down'
  | 'getup'
  | 'run'
  | 'limp'
  | 'stagger'
  | 'stunned'
  | 'inspect'
  | 'threaten'
  | 'cower'
  | 'fidget'
  | 'stomp'
  | 'eat'
  | 'rob';

/** The clip of each server-sent animation id; the gaits and the status loops are picked below, not sent. */
const CLIP_OF: Record<number, Clip> = {
  [AnimId.idle]: 'idle',
  [AnimId.walk]: 'walk',
  [AnimId.swing]: 'swing',
  [AnimId.die]: 'die',
  [AnimId.interact]: 'interact',
  [AnimId.strike]: 'strike',
  [AnimId.hurt]: 'hurt',
  [AnimId.knockdown]: 'knockdown',
  [AnimId.down]: 'down',
  [AnimId.getup]: 'getup',
  [AnimId.run]: 'run',
  [AnimId.limp]: 'limp',
  [AnimId.stagger]: 'stagger',
  [AnimId.stunned]: 'stunned',
  [AnimId.inspect]: 'inspect',
  [AnimId.threaten]: 'threaten',
  [AnimId.cower]: 'cower',
  [AnimId.fidget]: 'fidget',
  [AnimId.stomp]: 'stomp',
  [AnimId.eat]: 'eat',
  [AnimId.rob]: 'rob',
};

/**
 * The clip a look without a round-8 clip plays instead, followed until the look has one (every look has `idle`):
 * a gait falls back to `walk`, a fist to the Knife's `swing`, the knockout set to `die`, a hold to `interact`.
 */
const FALLBACK: Partial<Record<Clip, Clip>> = {
  run: 'walk',
  limp: 'walk',
  stagger: 'walk',
  strike: 'swing',
  hurt: 'idle',
  knockdown: 'die',
  down: 'die',
  getup: 'idle',
  stunned: 'idle',
  inspect: 'interact',
  threaten: 'idle',
  cower: 'idle',
  fidget: 'idle',
  stomp: 'idle',
  eat: 'idle',
  rob: 'interact',
  interact: 'idle',
};

/** Clips rendered in the four diagonals only (SPRITES 3): the one-shots and the mood idles. */
export const FOUR_DIR_CLIPS: ReadonlySet<Clip> = new Set<Clip>([
  'knockdown',
  'down',
  'getup',
  'stunned',
  'inspect',
  'threaten',
  'cower',
  'fidget',
  'stomp',
  'eat',
  'rob',
]);
const DIAGONAL: Record<Direction, Direction> = {
  n: 'ne',
  ne: 'ne',
  e: 'se',
  se: 'se',
  s: 'sw',
  sw: 'sw',
  w: 'nw',
  nw: 'nw',
};

/** The atlas direction a clip is drawn in: its own for an 8-direction clip, the next diagonal clockwise for a 4. */
export function dirFor(clip: Clip, dir: Direction): Direction {
  return FOUR_DIR_CLIPS.has(clip) ? DIAGONAL[dir] : dir;
}

/**
 * The speed (world px per second) above which a moving figure runs: midway between the walking and the running
 * speed of GDD 3.7 (`balance.json` `movement`), so the slowed gaits and interpolation jitter stay a walk.
 */
export const RUN_SPEED_PX =
  ((balance.movement.walkTilesPerS + balance.movement.runTilesPerS) / 2) * metrics.tilePx;

export interface Motion {
  /** `Presence.statusBits` (animIds.ts `StatusBit`). */
  bits: number;
  /** The figure's drawn speed in world px per second. */
  speed: number;
}
const STILL: Motion = { bits: 0, speed: 0 };

/**
 * The clip for `animId` under the figure's status bits and speed (motion.md 1; the comments of animIds.ts): the
 * server sends the one-shots and the mood idles, the client picks the gaits and the status loops. A knocked-out
 * figure lies `down` and a stunned one sways `stunned` whatever idle or walk the server sends; a moving figure
 * limps under `limp`, staggers under `fatigued` or `dazed`, runs above `RUN_SPEED_PX`, else walks. A look without
 * the clip falls back (`FALLBACK`); a look without `interact` plays `idle`, and `tick` asks the greybox to mark the
 * hold with a small teal tick above the head instead (npc.md 4).
 */
export function clipFor(
  animId: number,
  has: (clip: Clip) => boolean,
  motion: Motion = STILL,
): { clip: Clip; tick: boolean } {
  let clip = CLIP_OF[animId] ?? 'idle';
  if (clip === 'idle' || clip === 'walk') {
    if (motion.bits & StatusBit.down) clip = 'down';
    else if (motion.bits & StatusBit.stunned) clip = 'stunned';
    else if (clip === 'walk') {
      if (motion.bits & StatusBit.limp) clip = 'limp';
      else if (motion.bits & (StatusBit.fatigued | StatusBit.dazed)) clip = 'stagger';
      else if (motion.speed > RUN_SPEED_PX) clip = 'run';
    }
  }
  const wanted = clip;
  while (clip !== 'idle' && !has(clip)) clip = FALLBACK[clip] ?? 'idle';
  const hold = wanted === 'interact' || wanted === 'inspect' || wanted === 'rob';
  return { clip, tick: hold && clip === 'idle' };
}
