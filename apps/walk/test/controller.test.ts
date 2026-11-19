import { BoxGeometry, BufferGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { describe, expect, it } from 'vitest';
import { WALK } from '../src/config';
import { BvhCollider } from '../src/physics/collider';
import { Controller, wishFromInput, type Wish } from '../src/physics/controller';

function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): BufferGeometry {
  const g = new BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}

function world(...extra: BufferGeometry[]): BvhCollider {
  const merged = mergeGeometries([box(-20, -0.2, -20, 20, 0, 20), ...extra]);
  if (!merged) throw new Error('merge failed');
  return new BvhCollider(merged);
}

const FORWARD: Wish = { x: 0, z: -1, run: false };
const STILL: Wish = { x: 0, z: 0, run: false };

function run(c: Controller, seconds: number, wish: Wish, frame = 1 / 60): void {
  for (let t = 0; t < seconds; t += frame) c.update(frame, wish);
}

describe('wishFromInput', () => {
  it('looks along -Z at yaw 0 and strafes to +X', () => {
    const f = wishFromInput(1, 0, 0, false);
    expect(f.x).toBeCloseTo(0);
    expect(f.z).toBeCloseTo(-1);
    const r = wishFromInput(0, 1, 0, false);
    expect(r.x).toBeCloseTo(1);
    expect(r.z).toBeCloseTo(0);
  });

  it('turns with the yaw and never exceeds length 1 on a diagonal', () => {
    const f = wishFromInput(1, 0, -Math.PI / 2, true);
    expect(f.x).toBeCloseTo(1);
    expect(f.z).toBeCloseTo(0);
    expect(f.run).toBe(true);
    const d = wishFromInput(1, 1, 0.3, false);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1);
  });
});

describe('Controller', () => {
  it('falls under gravity and lands on the floor', () => {
    const c = new Controller(world());
    c.position.set(0, 5, 0);
    c.onGround = false;
    run(c, 0.5, STILL);
    // Free fall: 0.5 * g * t^2 is about 1.2 m after half a second.
    expect(c.position.y).toBeLessThan(4);
    expect(c.position.y).toBeGreaterThan(3.5);
    expect(c.onGround).toBe(false);
    run(c, 2, STILL);
    expect(c.onGround).toBe(true);
    expect(c.position.y).toBeCloseTo(0, 5);
  });

  it('walks at walking speed and runs at running speed', () => {
    const c = new Controller(world());
    c.place(new Vector3(0, 0, 0));
    run(c, 3, FORWARD);
    const z = c.position.z;
    run(c, 1, FORWARD);
    expect(z - c.position.z).toBeCloseTo(WALK.walkSpeed, 1);
    run(c, 1, { ...FORWARD, run: true });
    const z2 = c.position.z;
    run(c, 1, { ...FORWARD, run: true });
    expect(z2 - c.position.z).toBeCloseTo(WALK.runSpeed, 1);
    expect(c.position.y).toBeCloseTo(0, 5);
  });

  it('is stopped by a wall one radius from its face, even running', () => {
    const c = new Controller(world(box(-5, 0, -3.3, 5, 3, -3)));
    c.place(new Vector3(0, 0, 0));
    run(c, 4, { ...FORWARD, run: true });
    expect(c.position.z).toBeGreaterThan(-3 + WALK.radius - 0.02);
    expect(c.position.z).toBeLessThan(-3 + WALK.radius + 0.02);
  });

  it('slides along a wall it walks into at an angle', () => {
    const c = new Controller(world(box(-5, 0, -3.3, 5, 3, -3)));
    c.place(new Vector3(0, 0, -2));
    const diagonal = wishFromInput(1, 1, 0, false);
    run(c, 2, diagonal);
    expect(c.position.x).toBeGreaterThan(1);
    expect(c.position.z).toBeGreaterThan(-3 + WALK.radius - 0.02);
  });

  it('steps up onto a ledge lower than the step height', () => {
    const c = new Controller(world(box(-2, 0, -6, 2, 0.3, -2)));
    c.place(new Vector3(0, 0, 0));
    run(c, 3, FORWARD);
    expect(c.position.z).toBeLessThan(-2.5);
    expect(c.position.y).toBeCloseTo(0.3, 5);
    expect(c.onGround).toBe(true);
  });

  it('is blocked by a ledge higher than the step height', () => {
    const c = new Controller(world(box(-2, 0, -6, 2, 0.5, -2)));
    c.place(new Vector3(0, 0, 0));
    run(c, 3, FORWARD);
    expect(c.position.z).toBeGreaterThan(-2);
    expect(c.position.y).toBeCloseTo(0, 5);
  });

  it('climbs a flight of stairs and walks back down without leaving the ground', () => {
    const steps: BufferGeometry[] = [];
    for (let i = 0; i < 8; i++)
      steps.push(box(-1.5, 0, -(i + 1) * 0.35 - 1, 1.5, (i + 1) * 0.2, -i * 0.35 - 1));
    steps.push(box(-1.5, 0, -8, 1.5, 1.6, -1 - 8 * 0.35));
    const c = new Controller(world(...steps));
    c.place(new Vector3(0, 0, 0));
    run(c, 5, FORWARD);
    expect(c.position.y).toBeCloseTo(1.6, 5);
    expect(c.position.z).toBeLessThan(-4);
    let airborne = 0;
    for (let t = 0; t < 5; t += 1 / 60) {
      c.update(1 / 60, { x: 0, z: 1, run: false });
      if (!c.onGround) airborne++;
    }
    expect(c.position.y).toBeCloseTo(0, 5);
    expect(airborne).toBe(0);
  });

  it('stands still on the ground with no input', () => {
    const c = new Controller(world());
    c.place(new Vector3(1, 0.5, 1));
    expect(c.position.y).toBeCloseTo(0, 5);
    run(c, 2, STILL);
    expect(c.position.x).toBeCloseTo(1, 5);
    expect(c.position.y).toBeCloseTo(0, 5);
    expect(c.position.z).toBeCloseTo(1, 5);
  });

  it('reports a fall out of the world', () => {
    const c = new Controller(world());
    c.place(new Vector3(0, 0, 18));
    let fell = false;
    for (let t = 0; t < 10 && !fell; t += 1 / 60) fell = c.update(1 / 60, { x: 0, z: 1, run: true });
    expect(fell).toBe(true);
  });

  it('stops rising at a ceiling instead of passing through it', () => {
    const c = new Controller(world(box(-5, 2.2, -5, 5, 2.5, 5)));
    c.place(new Vector3(0, 0, 0));
    // A jump that would rise about 1.3 m in the open.
    c.velocity.y = 5;
    c.onGround = false;
    let highest = 0;
    for (let t = 0; t < 2; t += 1 / 60) {
      c.update(1 / 60, STILL);
      highest = Math.max(highest, c.position.y + WALK.bodyHeight);
    }
    expect(highest).toBeLessThanOrEqual(2.2 + 0.01);
    expect(c.onGround).toBe(true);
    expect(c.position.y).toBeCloseTo(0, 5);
  });
});
