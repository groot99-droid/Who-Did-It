// Code-drawn M5b mobs (route R5, art plan 1.5): the wolf, boar, bat and rat of 6E's `mobs.json`, each a small
// rig of spheres, capsules and wing polygons in a mob-local frame (f forward, s to the right, h up, display
// px), posed per animation and projected onto the iso ground for each screen-frame direction. One rig gives
// all eight directions, so they agree with one another. m5b.ts finishes and packs the frames for each style.
import type { SKRSContext2D } from '@napi-rs/canvas';
import { DIRECTIONS, type Dir } from './keys.ts';
import { paletteFile } from './palette.ts';

const R = paletteFile.world.ramps as Record<string, string[]>;
const c = (ramp: string, i: number): string => R[ramp]![i]!;
const INK = c('ink', 0);

export const MOB_IDS = ['wolf', 'boar', 'bat', 'rat'] as const;
export type MobId = (typeof MOB_IDS)[number];
export const MOB_ANIMS = ['idle', 'walk', 'attack'] as const;
export type MobAnim = (typeof MOB_ANIMS)[number];
/** Frames per animation, their rate and whether they loop (the attack plays once, like a character's swing). */
export const MOB_ANIM: Readonly<Record<MobAnim, { frames: number; fps: number; repeat: number }>> = {
  idle: { frames: 4, fps: 6, repeat: -1 },
  walk: { frames: 6, fps: 10, repeat: -1 },
  attack: { frames: 4, fps: 10, repeat: 0 },
};

type V3 = readonly [f: number, s: number, h: number];
type Part =
  | { kind: 'ball'; at: V3; r: number; fill: string; lit?: string | undefined }
  | { kind: 'cap'; a: V3; b: V3; r: number; fill: string; lit?: string | undefined }
  | { kind: 'wing'; pts: readonly V3[]; fill: string }
  | { kind: 'shadow'; rx: number; ry: number };

const ball = (at: V3, r: number, fill: string, lit?: string): Part => ({ kind: 'ball', at, r, fill, lit });
const cap = (a: V3, b: V3, r: number, fill: string, lit?: string): Part => ({
  kind: 'cap',
  a,
  b,
  r,
  fill,
  lit,
});
const mirror = (side: 1 | -1, p: V3): V3 => [p[0], p[1] * side, p[2]];
const SIDES = [-1, 1] as const;

/** The screen angle of each direction, y down: `e` is 0, `s` a quarter turn. */
const ANGLE: Readonly<Record<Dir, number>> = Object.fromEntries(
  DIRECTIONS.map((d) => [
    d,
    ({ e: 0, se: 1, s: 2, sw: 3, w: 4, nw: 5, n: 6, ne: 7 } as const)[d] * (Math.PI / 4),
  ]),
) as Record<Dir, number>;

/** A four-legged gait: legs swing in diagonal pairs and lift on the forward stroke. */
function leg(side: 1 | -1, front: boolean, f: number, hip: number, t: number, stride: number): [V3, V3] {
  const phase = 2 * Math.PI * t + ((side === 1) === front ? 0 : Math.PI);
  const swing = Math.sin(phase) * stride;
  const lift = Math.max(0, Math.cos(phase)) * stride * 0.45;
  return [
    [f, side * 6, hip],
    [f + swing, side * 6, 2 + lift],
  ];
}

/** 0 to 1 and back over t in [0, 1): the shape of a lunge. */
const lunge = (t: number): number => Math.sin(Math.PI * Math.min(1, t * 1.25));

function wolf(anim: MobAnim, t: number): Part[] {
  const p = 2 * Math.PI * t;
  const fur = c('fog', 0);
  const dark = c('slate', 3);
  const bob = anim === 'walk' ? Math.abs(Math.sin(p)) * 2 : anim === 'idle' ? Math.sin(p) : 0;
  const k = anim === 'attack' ? lunge(t) : 0;
  const fw = k * 10 - (anim === 'attack' && t < 0.15 ? 3 : 0);
  const head: V3 = [28 + fw * 1.2, 0, 44 + bob - k * 8];
  const stride = anim === 'walk' ? 8 : 0;
  const parts: Part[] = [
    cap([-16 + fw, 0, 30 + bob], [14 + fw, 0, 32 + bob - k * 3], 11, fur, c('fog', 1)),
    ball([15 + fw, 0, 30 + bob - k * 3], 12, fur, c('fog', 2)),
    cap([18 + fw, 0, 34 + bob - k * 3], head, 7, fur),
    ball(head, 9, fur, c('fog', 1)),
    cap([head[0] + 2, 0, head[2] - 2], [head[0] + 12, 0, head[2] - 6], 4.5, c('fog', 1)),
    ball([head[0] + 13, 0, head[2] - 6], 2.5, INK),
    cap([head[0] + 3, 0, head[2] - 6], [head[0] + 11, 0, head[2] - 9 - k * 6], 3.5, dark),
    cap(
      [-26 + fw, 0, 32 + bob],
      [-36 + fw, Math.sin(p) * (anim === 'idle' ? 4 : 2), 22 + bob],
      4,
      dark,
      c('bone', 1),
    ),
  ];
  for (const side of SIDES) {
    parts.push(
      cap(
        mirror(side, [head[0] - 2, 5, head[2] + 7]),
        mirror(side, [head[0] - 3, 5, head[2] + 14]),
        2.8,
        dark,
      ),
    );
    parts.push(ball(mirror(side, [head[0] + 5, 4.5, head[2] + 2]), 1.6, c('lantern', 2)));
    for (const front of [true, false]) {
      const [a, b] = leg(side, front, (front ? 13 : -14) + fw, 26 + bob, t, stride);
      parts.push(cap(a, b, 4, side === 1 ? fur : dark), ball(b, 3.5, dark));
    }
  }
  return parts;
}

function boar(anim: MobAnim, t: number): Part[] {
  const p = 2 * Math.PI * t;
  const hide = c('wood', 3);
  const bristle = c('wood', 1);
  const bob = anim === 'walk' ? Math.abs(Math.sin(p)) * 1.5 : anim === 'idle' ? Math.sin(p) * 0.8 : 0;
  const k = anim === 'attack' ? lunge(t) : 0;
  const fw = k * 12;
  const head: V3 = [20 + fw, 0, 22 + bob - k * 6];
  const stride = anim === 'walk' ? 6 : 0;
  const parts: Part[] = [
    cap([-12 + fw, 0, 24 + bob], [10 + fw, 0, 26 + bob], 14, hide, c('wood', 4)),
    cap([-10 + fw, 0, 37 + bob], [12 + fw, 0, 38 + bob - k * 3], 4, bristle),
    ball(head, 10, hide, c('wood', 4)),
    cap(
      [head[0] + 3, 0, head[2] - 2],
      [head[0] + 13, 0, head[2] - 6 + (anim === 'idle' ? Math.sin(p) * 1.5 : 0)],
      6,
      hide,
    ),
    ball([head[0] + 14, 0, head[2] - 6], 4, c('skin', 3)),
    cap([-24 + fw, 0, 26 + bob], [-27 + fw, Math.sin(p * 2) * 2, 20 + bob], 1.8, bristle),
  ];
  for (const side of SIDES) {
    parts.push(
      cap(
        mirror(side, [head[0] - 4, 6, head[2] + 9]),
        mirror(side, [head[0] - 6, 7, head[2] + 14]),
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
      const [a, b] = leg(side, front, (front ? 9 : -10) + fw, 14 + bob, t, stride);
      parts.push(cap(a, b, 4.5, side === 1 ? hide : bristle), ball(b, 3.5, INK));
    }
  }
  return parts;
}

function bat(anim: MobAnim, t: number): Part[] {
  const p = 2 * Math.PI * t;
  const fur = c('stone', 1);
  const k = anim === 'attack' ? lunge(t) : 0;
  const flap = anim === 'attack' ? 0.8 - k * 1.4 : Math.sin(p * (anim === 'walk' ? 1 : 2));
  const h = 42 + (anim === 'idle' ? Math.sin(p) * 2 : 0) - k * 18;
  const fw = k * 10 + (anim === 'walk' ? 2 : 0);
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
    parts.push(cap(at(5, 2.5, 8), at(5, 3.5, 13), 1.8, fur));
    parts.push(ball(at(8, 2, 5), 1.2, c('lantern', 2)));
  }
  return parts;
}

function rat(anim: MobAnim, t: number): Part[] {
  const p = 2 * Math.PI * t;
  const fur = c('stone', 2);
  const pink = c('skin', 3);
  const k = anim === 'attack' ? lunge(t) : 0;
  const bob = anim === 'walk' ? Math.abs(Math.sin(p)) : 0;
  const rear = k * 5;
  const fw = k * 4;
  const head: V3 = [10 + fw, 0, 9 + bob + rear * 1.4];
  const stride = anim === 'walk' ? 3 : 0;
  const wag = Math.sin(p) * (anim === 'idle' ? 3 : 1.5);
  const parts: Part[] = [
    cap([-6 + fw, 0, 8 + bob], [5 + fw, 0, 9 + bob + rear], 6, fur, c('stone', 3)),
    ball(head, 5, fur, c('stone', 3)),
    cap([head[0] + 2, 0, head[2] - 1], [head[0] + 7, 0, head[2] - 2 - k * 2], 2.5, fur),
    ball([head[0] + 7.5, 0, head[2] - 2 - k * 2], 1.3, pink),
    cap([-10 + fw, 0, 6 + bob], [-17 + fw, wag, 3], 1.3, pink),
    cap([-17 + fw, wag, 3], [-25 + fw, wag * 2, 2], 1.1, pink),
  ];
  for (const side of SIDES) {
    parts.push(ball(mirror(side, [head[0] - 2, 3, head[2] + 4]), 2.4, pink));
    parts.push(ball(mirror(side, [head[0] + 2, 2.5, head[2] + 1]), 0.9, INK));
    for (const front of [true, false]) {
      const [a, b] = leg(side, front, (front ? 4 : -5) + fw, 5 + bob, t, stride);
      parts.push(cap([a[0], side * 3, a[2]], [b[0], side * 3, b[2]], 1.6, fur));
    }
  }
  return parts;
}

const RIGS: Readonly<Record<MobId, (anim: MobAnim, t: number) => Part[]>> = { wolf, boar, bat, rat };

/**
 * One mob frame at display scale: the rig posed at `n` of the animation's frames, projected for `dir` and drawn
 * back to front with a single ink silhouette under the fills, feet at `feet`.
 */
export function drawMob(
  g: SKRSContext2D,
  mob: MobId,
  anim: MobAnim,
  dir: Dir,
  n: number,
  feet: readonly [number, number],
): void {
  const parts = RIGS[mob](anim, n / MOB_ANIM[anim].frames);
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
