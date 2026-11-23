import { afterEach, describe, expect, it, vi } from 'vitest';
import { keysToWorld, stickToWorld } from '@wdi/shared/iso';
import type { MoveCmd } from '../net/world';
import { InputController } from '../input/InputController';
import { turnByHeading, worldMove } from '../input/vectors';
import {
  type Heading,
  TURN_SECONDS,
  billboardYaw,
  cameraDirection,
  northAngle,
  stepYaw,
  turnHeading,
} from './frame';

/** Round 11, R2: the camera heading and the input it turns. */

const HEADINGS: Heading[] = [0, 1, 2, 3];
type V = { x: number; y: number; z: number };
const cross = (a: V, b: V): V => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;

/** The screen direction (x right, y down) of a world ground vector seen by the camera at `heading`. */
function onScreen(w: { x: number; y: number }, heading: Heading): { x: number; y: number } {
  const d = cameraDirection(heading);
  const forward = { x: -d.x, y: -d.y, z: -d.z };
  const right = cross(forward, { x: 0, y: 1, z: 0 });
  const up = cross(right, forward);
  const p = { x: w.x, y: 0, z: w.y };
  return { x: dot(p, right), y: -dot(p, up) };
}
const angle = (v: { x: number; y: number }) => Math.atan2(v.y, v.x);
const sameAngle = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-9;

const SINGLE = [
  { key: 'W', dx: 0, dy: -1 },
  { key: 'S', dx: 0, dy: 1 },
  { key: 'A', dx: -1, dy: 0 },
  { key: 'D', dx: 1, dy: 0 },
];
const ZERO = { dx: 0, dy: 0 };

describe('each heading maps each key to the right world vector (R2)', () => {
  it('a single key walks straight along its screen axis at every heading', () => {
    for (const h of HEADINGS)
      for (const k of SINGLE) {
        const m = worldMove(k, ZERO, h);
        expect(Math.hypot(m.dx, m.dy), `${k.key} at ${h}`).toBeCloseTo(1, 12);
        expect(
          sameAngle(angle(onScreen({ x: m.dx, y: m.dy }, h)), angle({ x: k.dx, y: k.dy })),
          `${k.key} at ${h}`,
        ).toBe(true);
      }
  });

  it('two keys walk along a grid axis, on the keys’ side of the screen, at every heading', () => {
    for (const h of HEADINGS)
      for (const dx of [-1, 1])
        for (const dy of [-1, 1]) {
          const m = worldMove({ dx, dy }, ZERO, h);
          expect(Math.min(Math.abs(m.dx), Math.abs(m.dy)), `${dx},${dy} at ${h}`).toBe(0);
          const s = onScreen({ x: m.dx, y: m.dy }, h);
          expect([Math.sign(s.x), Math.sign(s.y)], `${dx},${dy} at ${h}`).toEqual([dx, dy]);
        }
  });

  it('the stick walks exactly where the thumb points, at every heading', () => {
    for (const h of HEADINGS)
      for (let a = 0; a < 360; a += 15) {
        const t = (a * Math.PI) / 180;
        const m = worldMove(ZERO, { dx: Math.cos(t) * 0.8, dy: Math.sin(t) * 0.8 }, h);
        expect(sameAngle(angle(onScreen({ x: m.dx, y: m.dy }, h)), t), `${a} deg at ${h}`).toBe(true);
      }
  });

  it('heading 0 is today’s mapping, and four turns come back to it', () => {
    for (const key of [...SINGLE, { dx: 1, dy: 1 }, { dx: -1, dy: 1 }]) {
      const stick = { dx: 0.3, dy: -0.6 };
      const k = keysToWorld(key.dx, key.dy);
      const s = stickToWorld(stick.dx, stick.dy);
      expect(worldMove(key, stick)).toEqual({ dx: k.x + s.x, dy: k.y + s.y });
      expect(worldMove(key, stick, 0)).toEqual(worldMove(key, stick));
      expect(worldMove(key, stick, 4)).toEqual(worldMove(key, stick));
      expect(worldMove(key, stick, -1)).toEqual(worldMove(key, stick, 3));
    }
  });

  it('the input turns as the camera turns: one heading step is one turnByHeading step', () => {
    for (const h of HEADINGS) {
      const a = cameraDirection(h);
      const b = cameraDirection(turnHeading(h, 1));
      const t = turnByHeading({ x: a.x, y: a.z }, 1);
      expect(t.x).toBeCloseTo(b.x, 12);
      expect(t.y).toBeCloseTo(b.z, 12);
    }
    expect(turnHeading(0, -1)).toBe(3);
    expect(turnHeading(3, 1)).toBe(0);
  });
});

describe('the turn and the compass (R2, Q5)', () => {
  it('the drawn yaw reaches the next heading in about TURN_SECONDS, eased, and lands exactly', () => {
    const from = billboardYaw(0);
    const to = billboardYaw(1);
    let yaw = from;
    let t = 0;
    while (yaw !== to && t < 2) {
      yaw = stepYaw(yaw, to, 1 / 60);
      t += 1 / 60;
    }
    expect(yaw).toBe(to);
    expect(t).toBeGreaterThan(TURN_SECONDS * 0.9);
    expect(t).toBeLessThan(TURN_SECONDS * 2);
    expect(stepYaw(from, to, 1 / 60, true)).toBe(to); // reduced motion snaps
  });

  it('the needle points where world north lies on the ground', () => {
    for (const h of HEADINGS) {
      const north = onScreen({ x: 0, y: -1 }, h);
      const want = (Math.atan2(north.x, -north.y) * 180) / Math.PI;
      expect(sameAngle((northAngle(billboardYaw(h)) * Math.PI) / 180, (want * Math.PI) / 180), `${h}`).toBe(
        true,
      );
    }
    expect(northAngle(billboardYaw(0))).toBeGreaterThan(0); // up and to the right at heading 0
    expect(northAngle(billboardYaw(0))).toBeLessThan(90);
  });
});

describe('the wire is unchanged (R2)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a turned controller sends the same MoveCmd fields, in the world frame', () => {
    const on = new Map<string, (e: unknown) => void>();
    let tick: () => void = () => {};
    vi.stubGlobal('window', {
      addEventListener: (t: string, f: (e: unknown) => void) => on.set(t, f),
      removeEventListener: () => {},
      setInterval: (f: () => void) => ((tick = f), 1),
      clearInterval: () => {},
    });
    vi.stubGlobal('document', { addEventListener: () => {}, removeEventListener: () => {}, hidden: false });
    vi.stubGlobal('HTMLInputElement', class {});
    vi.stubGlobal('HTMLTextAreaElement', class {});
    const sent: MoveCmd[] = [];
    const input = new InputController({ sendMove: (c) => sent.push(c) });
    input.start();
    on.get('keydown')!({ code: 'KeyW', target: null, repeat: false, preventDefault: () => {} });
    for (const h of HEADINGS) {
      input.setHeading(h);
      tick();
      const cmd = sent.at(-1)!;
      expect(Object.keys(cmd).sort()).toEqual(['dx', 'dy', 'seq', 'sneak', 'sprint']);
      const w = worldMove({ dx: 0, dy: -1 }, ZERO, h);
      expect(cmd).toMatchObject({ dx: w.dx, dy: w.dy, sprint: false, sneak: false });
    }
    expect(sent.map((c) => c.seq)).toEqual([1, 2, 3, 4]);
    input.stop();
  });
});
