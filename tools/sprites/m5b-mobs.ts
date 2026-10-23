// Code-drawn M5b mobs (route R5, art plan 1.5): the wolf, boar, bat and rat of 6E's `mobs.json`, each a small
// rig of spheres, capsules and wing polygons in a mob-local frame (f forward, s to the right, h up, display
// px), posed per animation and projected onto the iso ground for each screen-frame direction. One rig gives
// all eight directions, so they agree with one another. m5b.ts finishes and packs the frames for each style.
import type { SKRSContext2D } from '@napi-rs/canvas';
import { DIRECTIONS, type Dir } from './keys.ts';
import { paletteFile } from './palette.ts';

const R = paletteFile.world.ramps as Record<string, string[]>;
export const ramp = (name: string, i: number): string => R[name]![i]!;
const c = ramp;
const INK = c('ink', 0);

export const MOB_IDS = ['wolf', 'boar', 'bat', 'rat'] as const;
export type MobId = (typeof MOB_IDS)[number];
export const MOB_ANIMS = ['idle', 'walk', 'attack', 'hurt', 'death', 'flee'] as const;
export type MobAnim = (typeof MOB_ANIMS)[number];
/**
 * Frames per animation, their rate and whether they loop. The attack, the hurt flinch and the death play once
 * (round 8, 8G: motion.md 2); the death holds its last frame, the body on its side.
 */
export const MOB_ANIM: Readonly<Record<MobAnim, { frames: number; fps: number; repeat: number }>> = {
  idle: { frames: 4, fps: 6, repeat: -1 },
  walk: { frames: 6, fps: 10, repeat: -1 },
  attack: { frames: 6, fps: 10, repeat: 0 },
  hurt: { frames: 3, fps: 12, repeat: 0 },
  death: { frames: 6, fps: 8, repeat: 0 },
  flee: { frames: 4, fps: 14, repeat: -1 },
};

/**
 * What a rig reads for one frame. `crouch` lowers and draws the body back (negative rears it up), `reach` carries
 * it forward (negative knocks it back), `jaw` opens the mouth, `stride` scales the gait and `low` flattens the ears
 * and drops the head and tail (the flee). `roll` is applied after the rig: the death's fall onto its side.
 */
export interface Pose {
  t: number;
  stride: number;
  crouch: number;
  reach: number;
  jaw: number;
  low: number;
  roll: number;
}

/** The wolf's bite as a readable sequence (motion.md 2): crouch, crouch, lunge, bite, recoil, settle. */
const ATTACK: ReadonlyArray<readonly [crouch: number, reach: number, jaw: number]> = [
  [0.5, 0, 0.2],
  [1, -0.1, 0.4],
  [0.2, 0.7, 1],
  [0, 1, 0.1],
  [-0.2, 0.35, 0.3],
  [0, 0.1, 0],
];
/** A hit knocks the head up and the body back, then it recovers. */
const HURT = [1, 0.55, 0.2] as const;
/** The fall: a stagger, then onto the side by a quarter turn. */
const FALL = [0.08, 0.35, 0.8, 1.25, 1.5, 1.57] as const;

export function pose(anim: MobAnim, t: number): Pose {
  const n = Math.round(t * MOB_ANIM[anim].frames);
  const p: Pose = { t, stride: 0, crouch: 0, reach: 0, jaw: 0, low: 0, roll: 0 };
  if (anim === 'walk') p.stride = 1;
  else if (anim === 'flee') Object.assign(p, { stride: 1.35, low: 1, crouch: 0.25 });
  else if (anim === 'attack') [p.crouch, p.reach, p.jaw] = ATTACK[n] ?? [0, 0, 0];
  else if (anim === 'hurt')
    Object.assign(p, { crouch: -0.5 * HURT[n]!, reach: -0.6 * HURT[n]!, jaw: 0.5 * HURT[n]! });
  else if (anim === 'death') Object.assign(p, { roll: FALL[n] ?? 0, crouch: Math.min(1, n / 2), jaw: 0.4 });
  return p;
}

export type V3 = readonly [f: number, s: number, h: number];
export type Part =
  | { kind: 'ball'; at: V3; r: number; fill: string; lit?: string | undefined }
  | { kind: 'cap'; a: V3; b: V3; r: number; fill: string; lit?: string | undefined }
  | { kind: 'wing'; pts: readonly V3[]; fill: string }
  | { kind: 'shadow'; rx: number; ry: number };

export const ball = (at: V3, r: number, fill: string, lit?: string): Part => ({
  kind: 'ball',
  at,
  r,
  fill,
  lit,
});
export const cap = (a: V3, b: V3, r: number, fill: string, lit?: string): Part => ({
  kind: 'cap',
  a,
  b,
  r,
  fill,
  lit,
});
export const mirror = (side: 1 | -1, p: V3): V3 => [p[0], p[1] * side, p[2]];
export const SIDES = [-1, 1] as const;

/** The screen angle of each direction, y down: `e` is 0, `s` a quarter turn. */
const ANGLE: Readonly<Record<Dir, number>> = Object.fromEntries(
  DIRECTIONS.map((d) => [
    d,
    ({ e: 0, se: 1, s: 2, sw: 3, w: 4, nw: 5, n: 6, ne: 7 } as const)[d] * (Math.PI / 4),
  ]),
) as Record<Dir, number>;

/**
 * A four-legged gait: legs swing in diagonal pairs and lift on the forward stroke. `reach` is the body's lunge: the
 * front feet stretch further and the hind feet stay planted behind it.
 */
function leg(
  side: 1 | -1,
  front: boolean,
  f: number,
  hip: number,
  t: number,
  stride: number,
  reach = 0,
): [V3, V3] {
  const phase = 2 * Math.PI * t + ((side === 1) === front ? 0 : Math.PI);
  const swing = Math.sin(phase) * stride + (front ? reach * 0.4 : -reach * 0.7);
  const lift = Math.max(0, Math.cos(phase)) * stride * 0.45;
  return [
    [f, side * 6, hip],
    [f + swing, side * 6, 2 + lift],
  ];
}

const mix = (a: number, b: number, k: number): number => a + (b - a) * k;
/** The gait's bob: a breath at rest, a bounce on the move, still while striking or falling. */
function bobOf(anim: MobAnim, p: number, walk: number, idle: number): number {
  if (anim === 'walk' || anim === 'flee') return Math.abs(Math.sin(p)) * walk;
  return anim === 'idle' ? Math.sin(p) * idle : 0;
}

function wolf(anim: MobAnim, q: Pose): Part[] {
  const p = 2 * Math.PI * q.t;
  const fur = c('fog', 0);
  const dark = c('slate', 3);
  const bob = bobOf(anim, p, 2, 1);
  const drop = q.crouch * 9;
  const fw = q.reach * 20 - q.crouch * 6;
  const head: V3 = [
    28 + fw * 1.15 + q.reach * 2,
    0,
    44 + bob - drop * 1.3 - q.reach * 6 - q.low * 7 - Math.min(0, q.reach) * 4,
  ];
  const parts: Part[] = [
    cap(
      [-16 + fw, 0, 30 + bob - drop * 0.6],
      [14 + fw, 0, 32 + bob - drop - q.reach * 3],
      11,
      fur,
      c('fog', 1),
    ),
    ball([15 + fw, 0, 30 + bob - drop - q.reach * 3], 12, fur, c('fog', 2)),
    cap([18 + fw, 0, 34 + bob - drop - q.reach * 3], head, 7, fur),
    ball(head, 9, fur, c('fog', 1)),
    cap([head[0] + 2, 0, head[2] - 2], [head[0] + 12, 0, head[2] - 6], 4.5, c('fog', 1)),
    ball([head[0] + 13, 0, head[2] - 6], 2.5, INK),
    cap([head[0] + 3, 0, head[2] - 6], [head[0] + 11, 0, head[2] - 9 - q.jaw * 9], 3.5, dark),
    cap(
      [-26 + fw, 0, 32 + bob - drop * 0.6],
      [-36 + fw + q.low * 6, Math.sin(p) * (anim === 'idle' ? 4 : 2), mix(22 + bob, 10, q.low)],
      4,
      dark,
      c('bone', 1),
    ),
  ];
  for (const side of SIDES) {
    parts.push(
      cap(
        mirror(side, [head[0] - 2, 5, head[2] + 7]),
        mirror(side, [mix(head[0] - 3, head[0] - 9, q.low), mix(5, 6.5, q.low), head[2] + mix(14, 9, q.low)]),
        2.8,
        dark,
      ),
    );
    parts.push(ball(mirror(side, [head[0] + 5, 4.5, head[2] + 2]), 1.6, c('lantern', 2)));
    for (const front of [true, false]) {
      const [a, b] = leg(side, front, (front ? 13 : -14) + fw, 26 + bob - drop, q.t, 8 * q.stride, fw);
      parts.push(cap(a, b, 4, side === 1 ? fur : dark), ball(b, 3.5, dark));
    }
  }
  return parts;
}

function boar(anim: MobAnim, q: Pose): Part[] {
  const p = 2 * Math.PI * q.t;
  const hide = c('wood', 3);
  const bristle = c('wood', 1);
  const bob = bobOf(anim, p, 1.5, 0.8);
  const drop = q.crouch * 4;
  const fw = q.reach * 12 - q.crouch * 4;
  const head: V3 = [20 + fw, 0, 22 + bob - drop - q.reach * 6 - q.low * 3];
  const parts: Part[] = [
    cap([-12 + fw, 0, 24 + bob - drop * 0.5], [10 + fw, 0, 26 + bob - drop], 14, hide, c('wood', 4)),
    cap(
      [-10 + fw, 0, 37 + bob - drop * 0.5],
      [12 + fw, 0, 38 + bob - drop - q.reach * 3 + q.low * 2],
      4,
      bristle,
    ),
    ball(head, 10, hide, c('wood', 4)),
    cap(
      [head[0] + 3, 0, head[2] - 2],
      [head[0] + 13, 0, head[2] - 6 + (anim === 'idle' ? Math.sin(p) * 1.5 : 0) - q.jaw * 2],
      6,
      hide,
    ),
    ball([head[0] + 14, 0, head[2] - 6 - q.jaw * 2], 4, c('skin', 3)),
    cap([-24 + fw, 0, 26 + bob], [-27 + fw, Math.sin(p * 2) * 2, mix(20 + bob, 15, q.low)], 1.8, bristle),
  ];
  for (const side of SIDES) {
    parts.push(
      cap(
        mirror(side, [head[0] - 4, 6, head[2] + 9]),
        mirror(side, [head[0] - 6 - q.low * 4, 7, head[2] + 14 - q.low * 4]),
        3,
        bristle,
      ),
    );
    parts.push(
      cap(
        mirror(side, [head[0] + 9, 4, head[2] - 8]),
        mirror(side, [head[0] + 12, 5.5, head[2] - 1]),
        1.6,
        c('bone', 3),
      ),
    );
    parts.push(ball(mirror(side, [head[0] + 4, 5, head[2] + 3]), 1.4, INK));
    for (const front of [true, false]) {
      const [a, b] = leg(side, front, (front ? 9 : -10) + fw, 14 + bob - drop * 0.5, q.t, 6 * q.stride, fw);
      parts.push(cap(a, b, 4.5, side === 1 ? hide : bristle), ball(b, 3.5, INK));
    }
  }
  return parts;
}

function bat(anim: MobAnim, q: Pose): Part[] {
  const p = 2 * Math.PI * q.t;
  const fur = c('stone', 1);
  const k = Math.max(0, q.reach);
  const dying = anim === 'death';
  // A strike folds the wings and dives; a hit throws them up; the death folds them and drops it to the floor.
  const flap =
    anim === 'attack'
      ? 0.8 - k * 1.4 + q.crouch * 0.4
      : anim === 'hurt'
        ? 1 + q.reach * 0.5
        : dying
          ? mix(0.3, -0.35, Math.min(1, q.roll / 1.2))
          : Math.sin(p * (anim === 'idle' ? 2 : anim === 'flee' ? 3 : 1));
  const h =
    (dying ? mix(42, 8, Math.min(1, q.roll / 1.2)) : 42 + (anim === 'idle' ? Math.sin(p) * 2 : 0)) -
    k * 18 +
    q.crouch * 4 +
    q.low * 6;
  const fw = q.reach * 10 + (anim === 'walk' || anim === 'flee' ? 2 : 0);
  const parts: Part[] = [
    { kind: 'shadow', rx: 10, ry: 4 },
    ball([fw, 0, h], 6, fur, c('stone', 2)),
    ball([fw + 5, 0, h + 4 - k * 2], 4.5, fur, c('stone', 2)),
  ];
  for (const side of SIDES) {
    const at = (f: number, s: number, dh: number): V3 => mirror(side, [fw + f, s, h + dh]);
    parts.push({
      kind: 'wing',
      pts: [
        at(2, 3, 2),
        at(-2, 26, 4 + flap * 14),
        at(-6, 18, -2 + flap * 8),
        at(-7, 12, -4 + flap * 5),
        at(-6, 4, -4),
      ],
      fill: c('stone', 0),
    });
    parts.push(cap(at(5, 2.5, 8), at(5 - q.low * 3, 3.5, 13 - q.low * 3), 1.8, fur));
    parts.push(ball(at(8, 2, 5), 1.2, c('lantern', 2)));
  }
  return parts;
}

function rat(anim: MobAnim, q: Pose): Part[] {
  const p = 2 * Math.PI * q.t;
  const fur = c('stone', 2);
  const pink = c('skin', 3);
  const k = q.reach;
  const bob = bobOf(anim, p, 1, 0);
  const rear = Math.max(0, k) * 5 - q.crouch * 2;
  const fw = k * 4 - q.crouch * 2;
  const head: V3 = [10 + fw, 0, 9 + bob + rear * 1.4 - q.low * 2];
  const wag = Math.sin(p) * (anim === 'idle' ? 3 : 1.5);
  const parts: Part[] = [
    cap([-6 + fw, 0, 8 + bob], [5 + fw, 0, 9 + bob + rear], 6, fur, c('stone', 3)),
    ball(head, 5, fur, c('stone', 3)),
    cap([head[0] + 2, 0, head[2] - 1], [head[0] + 7, 0, head[2] - 2 - q.jaw * 2], 2.5, fur),
    ball([head[0] + 7.5, 0, head[2] - 2 - q.jaw * 2], 1.3, pink),
    cap([-10 + fw, 0, 6 + bob], [-17 + fw, wag, 3], 1.3, pink),
    cap([-17 + fw, wag, 3], [-25 + fw, wag * 2, 2], 1.1, pink),
  ];
  for (const side of SIDES) {
    parts.push(ball(mirror(side, [head[0] - 2 - q.low * 2, 3, head[2] + 4 - q.low * 2]), 2.4, pink));
    parts.push(ball(mirror(side, [head[0] + 2, 2.5, head[2] + 1]), 0.9, INK));
    for (const front of [true, false]) {
      const [a, b] = leg(side, front, (front ? 4 : -5) + fw, 5 + bob, q.t, 3 * q.stride);
      parts.push(cap([a[0], side * 3, a[2]], [b[0], side * 3, b[2]], 1.6, fur));
    }
  }
  return parts;
}

const RIGS: Readonly<Record<MobId, (anim: MobAnim, q: Pose) => Part[]>> = { wolf, boar, bat, rat };

/**
 * Turns a posed rig onto its right side by `r` about the ground line under its spine (the death's fall); the far
 * side is pressed half flat so the legs fold against the body instead of standing up.
 */
export function rollParts(parts: readonly Part[], r: number): Part[] {
  if (r === 0) return [...parts];
  const [cos, sin] = [Math.cos(r), Math.sin(r)];
  const v = ([f, s, h]: V3): V3 => [f, s * cos + h * sin, Math.max(1, h * cos - s * sin * 0.5 + 7 * sin)];
  return parts.map((pt) =>
    pt.kind === 'ball'
      ? { ...pt, at: v(pt.at) }
      : pt.kind === 'cap'
        ? { ...pt, a: v(pt.a), b: v(pt.b) }
        : pt.kind === 'wing'
          ? { ...pt, pts: pt.pts.map(v) }
          : pt,
  );
}

/** One mob frame at display scale: the rig posed at `n` of the animation's frames, feet at `feet`. */
export function drawMob(
  g: SKRSContext2D,
  mob: MobId,
  anim: MobAnim,
  dir: Dir,
  n: number,
  feet: readonly [number, number],
): void {
  const q = pose(anim, n / MOB_ANIM[anim].frames);
  // The bat drops to the floor with its wings spread instead of tipping over.
  drawRig(g, rollParts(RIGS[mob](anim, q), mob === 'bat' ? 0 : q.roll), dir, feet);
}

/** A rig's parts projected for `dir` and drawn back to front with a single ink silhouette under the fills. */
export function drawRig(
  g: SKRSContext2D,
  parts: readonly Part[],
  dir: Dir,
  feet: readonly [number, number],
): void {
  const th = ANGLE[dir];
  const [cos, sin] = [Math.cos(th), Math.sin(th)];
  const ground = ([f, s]: V3): [number, number] => [f * cos - s * sin, f * sin + s * cos];
  const at = (v: V3): [number, number] => {
    const [gx, gy] = ground(v);
    return [feet[0] + gx, feet[1] + gy * 0.5 - v[2]];
  };
  const depth = (pt: Part): number => {
    if (pt.kind === 'shadow') return -Infinity;
    const vs = pt.kind === 'ball' ? [pt.at] : pt.kind === 'cap' ? [pt.a, pt.b] : pt.pts;
    return vs.reduce((d, v) => d + ground(v)[1] + v[2] * 0.01, 0) / vs.length;
  };
  const order = [...parts].sort((a, b) => depth(a) - depth(b));

  const outline = (pt: Part) => {
    if (pt.kind === 'ball') disc(g, INK, at(pt.at), pt.r + 2);
    else if (pt.kind === 'cap') stroke(g, INK, at(pt.a), at(pt.b), pt.r * 2 + 4);
    else if (pt.kind === 'wing') shape(g, INK, pt.pts.map(at), 4);
  };
  const fill = (pt: Part) => {
    if (pt.kind === 'shadow') {
      g.beginPath();
      g.ellipse(feet[0], feet[1], pt.rx, pt.ry, 0, 0, Math.PI * 2);
      g.fillStyle = c('slate', 0);
      g.fill();
    } else if (pt.kind === 'ball') {
      disc(g, pt.fill, at(pt.at), pt.r);
      if (pt.lit && pt.r > 3)
        disc(g, pt.lit, [at(pt.at)[0] - pt.r * 0.25, at(pt.at)[1] - pt.r * 0.35], pt.r * 0.5);
    } else if (pt.kind === 'cap') {
      stroke(g, pt.fill, at(pt.a), at(pt.b), pt.r * 2);
      if (pt.lit) {
        const up = (v: V3): V3 => [v[0], v[1], v[2] + pt.r * 0.45];
        stroke(g, pt.lit, at(up(pt.a)), at(up(pt.b)), pt.r * 0.8);
      }
    } else shape(g, pt.fill, pt.pts.map(at), 0);
  };
  // The shadow sits under the outline; every other part's outline goes down first so the body reads as one.
  for (const pt of order) if (pt.kind === 'shadow') fill(pt);
  for (const pt of order) outline(pt);
  for (const pt of order) if (pt.kind !== 'shadow') fill(pt);
}

function disc(g: SKRSContext2D, fill: string, [x, y]: readonly [number, number], r: number): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
}

function stroke(
  g: SKRSContext2D,
  colour: string,
  a: readonly [number, number],
  b: readonly [number, number],
  w: number,
): void {
  g.beginPath();
  g.moveTo(...a);
  g.lineTo(b[0] + 0.01, b[1]);
  g.lineCap = 'round';
  g.lineWidth = w;
  g.strokeStyle = colour;
  g.stroke();
}

function shape(
  g: SKRSContext2D,
  fill: string,
  pts: ReadonlyArray<readonly [number, number]>,
  line: number,
): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (line) {
    g.lineWidth = line;
    g.lineJoin = 'round';
    g.strokeStyle = fill;
    g.stroke();
  }
}
