import { describe, expect, it } from 'vitest';
import { Object3D, Scene } from 'three';
import { isLit } from '../view/dayPart';
import { type Heading, billboardYaw } from './frame';
import { LAMP, SUN_ELEVATION, lightingOf, sunDirection } from './light';
import { LightRig } from './lightRig';

/** Round 11, R4: the sun, the ambient and the lamps of the day part. */

/** The screen angle (degrees, clockwise from screen right) of a ground direction `(x, z)` at a heading. */
function screenAngle(x: number, z: number, heading: Heading): number {
  const yaw = billboardYaw(heading);
  // The camera's right on the ground, and its up on the ground (away from the camera), for a camera at `yaw`.
  const right = x * Math.cos(yaw) - z * Math.sin(yaw);
  const away = -(x * Math.sin(yaw) + z * Math.cos(yaw));
  return (((Math.atan2(-away, right) * 180) / Math.PI + 360) % 360) % 360;
}

describe('the sun (R4, Q4)', () => {
  it('stands 25 degrees up in world south-west, so shadows fall north-east', () => {
    const d = sunDirection();
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1);
    expect(Math.asin(d.y)).toBeCloseTo(SUN_ELEVATION);
    expect((SUN_ELEVATION * 180) / Math.PI).toBeCloseTo(25);
    expect(d.x).toBeLessThan(0); // west
    expect(d.z).toBeGreaterThan(0); // south (world +y)
    expect(d.x).toBeCloseTo(-d.z);
  });

  it('casts to the right of a building at heading 0, and turns with the world', () => {
    const d = sunDirection();
    const angles = ([0, 1, 2, 3] as const).map((h) => screenAngle(-d.x, -d.z, h));
    expect(angles[0]).toBeCloseTo(0); // along the ground to the right (round11-plan 3)
    for (let h = 1; h < 4; h++) expect((angles[h]! - angles[h - 1]! + 360) % 360).toBeCloseTo(90);
  });
});

describe('the light of the day part (R4)', () => {
  it('burns the lamps when the Phaser path shows their lit frame, never by day', () => {
    for (const part of ['day', 'dusk', 'night'] as const) expect(lightingOf(part).lamps).toBe(isLit(part));
    expect(lightingOf('day').lamps).toBe(false);
    expect(lightingOf('night').lamps).toBe(true);
  });

  it('dims the sun from day to dusk to night', () => {
    const [day, dusk, night] = (['day', 'dusk', 'night'] as const).map((p) => lightingOf(p).sun.intensity);
    expect(day).toBeGreaterThan(dusk!);
    expect(dusk).toBeGreaterThan(night!);
  });
});

describe('the light rig (R4)', () => {
  it('a lamp lights at night only, and its post swaps to the lit frame', () => {
    const rig = new LightRig(new Scene());
    const lit = new Object3D();
    const unlit = new Object3D();
    const post = new Object3D();
    const lamp = rig.addLantern(lit, unlit);
    post.add(lamp.light);
    expect(lamp.light.position.y).toBe(LAMP.height);
    rig.setPart('day');
    expect([lamp.light.visible, lit.visible, unlit.visible]).toEqual([false, false, true]);
    rig.setPart('night');
    expect([lamp.light.visible, lit.visible, unlit.visible]).toEqual([true, true, false]);
    rig.setPart('dusk');
    expect(lamp.light.visible).toBe(isLit('dusk'));
  });

  it('keeps a post with one frame on that frame, and lights the scene as the day part says', () => {
    const rig = new LightRig(new Scene());
    const only = new Object3D();
    const lamp = rig.addLantern(only, null);
    rig.setPart('day');
    expect([lamp.light.visible, only.visible]).toEqual([false, true]);
    for (const part of ['day', 'dusk', 'night'] as const) {
      rig.setPart(part);
      const l = lightingOf(part);
      expect(rig.sun.intensity).toBe(l.sun.intensity);
      expect(rig.sun.color.getHex()).toBe(l.sun.colour);
      expect(rig.ambient.intensity).toBe(l.ambient.intensity);
    }
  });

  it('stands the sun over the view, its shadow camera holding the whole view', () => {
    const rig = new LightRig(new Scene());
    rig.follow(640, 320, 400, 250);
    const t = rig.sun.target.position;
    expect([t.x, t.y, t.z]).toEqual([640, 0, 320]);
    const p = rig.sun.position.clone().sub(t).normalize();
    const d = sunDirection();
    expect([p.x, p.y, p.z].map((n) => +n.toFixed(6))).toEqual([d.x, d.y, d.z].map((n) => +n.toFixed(6)));
    const cam = rig.sun.shadow.camera;
    expect(cam.right).toBeGreaterThanOrEqual(Math.hypot(400, 2 * 250));
    expect(cam.left).toBe(-cam.right);
    expect(rig.sun.castShadow).toBe(true);
  });

  it('makes blob shadows of the radius asked, flat on the ground', () => {
    const rig = new LightRig(new Scene());
    const b = rig.blob(14);
    expect([b.scale.x, b.scale.z]).toEqual([14, 14]);
    expect(b.position.y).toBeGreaterThan(0);
    b.geometry.computeBoundingBox();
    expect(b.geometry.boundingBox!.max.y - b.geometry.boundingBox!.min.y).toBeCloseTo(0);
  });
});
