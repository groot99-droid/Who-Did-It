import { describe, expect, it } from 'vitest';
import { toScreen } from '@wdi/shared/iso';
import { PX_PER_UNIT, RISE_PX_PER_UNIT, cameraDirection, matchView, unitsOfRise } from './frame';

type V = { x: number; y: number; z: number };
const cross = (a: V, b: V): V => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: V): V => {
  const l = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/** Screen px of scene point `p` for an orthographic camera at heading 0 looking at `t`, at `zoom`. */
function project(p: V, t: V, zoom: number) {
  const d = cameraDirection(0);
  const forward = { x: -d.x, y: -d.y, z: -d.z };
  const right = norm(cross(forward, { x: 0, y: 1, z: 0 }));
  const up = cross(right, forward);
  const rel = { x: p.x - t.x, y: p.y - t.y, z: p.z - t.z };
  return { x: dot(rel, right) * PX_PER_UNIT * zoom, y: -dot(rel, up) * PX_PER_UNIT * zoom };
}

describe('the sprite world frame (round 11, R1)', () => {
  it('reproduces the isometric projection at heading 0', () => {
    const t = { x: 640, y: 0, z: 320 };
    for (const [wx, wy] of [
      [0, 0],
      [64, 0],
      [0, 64],
      [1000, 300],
      [-200, 750],
    ] as const) {
      const got = project({ x: wx, y: 0, z: wy }, t, 1.5);
      const a = toScreen(wx, wy);
      const b = toScreen(t.x, t.z);
      expect(got.x).toBeCloseTo((a.x - b.x) * 1.5, 6);
      expect(got.y).toBeCloseTo((a.y - b.y) * 1.5, 6);
    }
  });

  it('raises a height by its rise in screen px', () => {
    const got = project({ x: 0, y: unitsOfRise(118), z: 0 }, { x: 0, y: 0, z: 0 }, 1);
    expect(got.x).toBeCloseTo(0, 6);
    expect(got.y).toBeCloseTo(-118, 6);
    expect(RISE_PX_PER_UNIT).toBeCloseTo(Math.SQRT2 * Math.cos(Math.PI / 6), 9);
  });

  it('turns a quarter turn per heading', () => {
    const a = cameraDirection(0);
    const b = cameraDirection(1);
    expect(a.x * b.x + a.z * b.z).toBeCloseTo(0, 9);
    expect(a.y).toBeCloseTo(b.y, 9);
  });

  it('matches the Phaser camera: the ground point under its centre and its extent', () => {
    const view = { x: 100, y: 50, width: 640, height: 360 };
    const m = matchView(view, 2, 1280, 720);
    const c = toScreen(m.target.x, m.target.y);
    expect(c.x).toBeCloseTo(420, 9);
    expect(c.y).toBeCloseTo(230, 9);
    // The frustum spans the canvas: its width in screen px at the camera's zoom.
    expect(m.halfW * 2 * PX_PER_UNIT * 2).toBeCloseTo(1280, 9);
    expect(m.halfH * 2 * PX_PER_UNIT * 2).toBeCloseTo(720, 9);
  });
});
