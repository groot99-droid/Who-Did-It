import { BoxGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { WALK } from '../src/config';
import { BvhCollider } from '../src/physics/collider';
import { Controller } from '../src/physics/controller';

// Software WebGL in CI draws the fixture at about 6 fps (0.17 s frames). A frame clamp shorter than that slows the
// walker below real time: CI saw 0.82 m/s, 58% of walking speed, with the old 0.1 s clamp.
describe('slow frames', () => {
  it('keep walking speed at 6 fps', () => {
    const floor = new BoxGeometry(200, 0.2, 200).translate(0, -0.1, 0);
    floor.deleteAttribute('uv');
    floor.deleteAttribute('normal');
    const c = new Controller(new BvhCollider(floor));
    c.place(new Vector3(0, 0, 0));
    const frame = 1 / 6;
    for (let i = 0; i < 12; i++) c.update(frame, { x: 0, z: -1, run: false }); // 2 s to reach speed
    const z = c.position.z;
    for (let i = 0; i < 6; i++) c.update(frame, { x: 0, z: -1, run: false }); // 1 s
    expect(z - c.position.z).toBeCloseTo(WALK.walkSpeed, 1);
  });
});
