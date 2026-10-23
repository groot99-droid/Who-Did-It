import mobsJson from '@wdi/content/data/mobs.json';
import resources from '@wdi/content/data/resources.json';
import type { Direction } from '@wdi/shared/direction';
import { screenDir, screenDirOfYaw } from '@wdi/shared/iso';
import type { AvatarSnap } from '../net/world';
import { AnimId, StatusBit } from './animIds';

// Round 6 (6I): the Phaser-free half of the M5b views, so the frame names, the directions and the lantern carriers can
// be tested without a canvas.

const NODE_ROWS = resources.resources as Record<string, { sprite: string }>;
const MOB_ROWS = mobsJson.mobs as Record<string, { sprite: string }>;

/** The frame of a node: `node_<snake id>/ready` while it holds its yield, `/spent` while it regrows (SPRITES 10.14). */
export function nodeFrame(resource: string, active: boolean): string {
  const stem = NODE_ROWS[resource]?.sprite ?? `node_${resource}`;
  return `${stem}/${active ? 'ready' : 'spent'}`;
}

/**
 * `Mob.state` on the wire (the server's `sim/mobs/ai.ts` `MobState`): the view reads only `flee` and `dead`. A creature
 * asleep for its part of the day leaves the feed, so `dead` in the feed is a creature killed (round 8, 8G).
 */
export const MobWireState = { flee: 3, dead: 4 } as const;
/** `AnimId.hurt` of seams.md 2, which 8A appends to `animIds.ts`; a creature's flinch when a hit lands. */
export const MOB_HURT_ANIM = 6;

export type MobClip = 'idle' | 'walk' | 'attack' | 'hurt' | 'death' | 'flee';

/**
 * The clip of a creature (SPRITES 10.14, motion.md 2): `death` once killed, the flinch on a hit, the attack on a
 * swing, and while it moves the `flee` gait when it runs from a light, else the walk.
 */
export function mobClip(animId: number, state = 0): MobClip {
  if (state === MobWireState.dead) return 'death';
  if (animId === MOB_HURT_ANIM) return 'hurt';
  if (animId === AnimId.swing) return 'attack';
  if (animId === AnimId.walk) return state === MobWireState.flee ? 'flee' : 'walk';
  return 'idle';
}

/** The animation key `mob_<id>/<clip>/<dir>`; the facing is the world-frame yaw, turned into the screen frame. */
export function mobAnimKey(kind: string, animId: number, yaw: number, state = 0): string {
  return `${MOB_ROWS[kind]?.sprite ?? `mob_${kind}`}/${mobClip(animId, state)}/${screenDirOfYaw(yaw)}`;
}

/** The world-frame vector of a `scene.givers[].facing` name (the frozen direction names of the scene files). */
const FACING: Record<string, [number, number]> = {
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
  nw: [-1, -1],
};

/** The atlas direction (screen frame) a giver faces: its `facing` is the world frame (SPRITES 10.14). */
export function giverDir(facing: string): Direction {
  const v = FACING[facing] ?? FACING.s!;
  return screenDir(v[0], v[1]);
}

/** The animation key `giver_<npc>/idle/<dir>`. */
export const giverAnimKey = (npc: string, facing: string): string => `giver_${npc}/idle/${giverDir(facing)}`;

/** A lit carried light in world px: `own` is this client's seat, whose pool is its sight, not a second disc. */
export interface Carrier {
  key: string;
  x: number;
  y: number;
  own: boolean;
}

/**
 * Who carries a lit light in this scene (`StatusBit.lantern`, GDD 3.15): the own seat at `viewer` when its presence has
 * the bit, and every other avatar whose bit is set. The own avatar also appears in `avatars` and is skipped there.
 */
export function lanternCarriers(
  avatars: readonly AvatarSnap[],
  selfHandle: string,
  viewer: { x: number; y: number } | null,
  ownBits: number,
): Carrier[] {
  const out: Carrier[] = [];
  if (viewer && (ownBits & StatusBit.lantern) !== 0)
    out.push({ key: 'self', x: viewer.x, y: viewer.y, own: true });
  for (const a of avatars)
    if (a.handle !== selfHandle && (a.statusBits & StatusBit.lantern) !== 0)
      out.push({ key: a.handle, x: a.x, y: a.y, own: false });
  return out;
}
