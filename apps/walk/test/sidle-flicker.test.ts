import { BoxGeometry, BufferGeometry, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { describe, expect, it } from 'vitest';
import { SIDLE } from '../src/config';
import { BvhCollider } from '../src/physics/collider';
import { Controller, wishFromInput } from '../src/physics/controller';
import { TraverseZone, type Mode } from '../src/traverse';

// The sidle/walk flicker of route 1 of the Undermere: at the north end of the Ice Curtain (the cave `under_ice`) the
// journey harness switched between sidling and walking 26 times in 0.6 m. There the sidle box ends where the fissure
// opens sideways into walking space: the way on leaves the fissure at an angle, beside the box. A walker steered as
// the harness steers (towards the next waypoint while walking; along the passage, towards the waypoint 1.5 m ahead,
// while sidling) stepped out of the box's end, walked back into its end margin on the way to that waypoint, sidled out
// again, and so on. The world below is that corner, rebuilt from boxes with the curtain's numbers: a box 4.48 m long
// (half 2.24), 0.84 m wide, the fissure 0.45 m wide, and its -Z wall ending 0.6 m short of the box's end so that the
// fissure opens on that side.

function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): BufferGeometry {
  const g = new BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}

const HALF = 2.24;
/** The curtain runs along X from x = -2.24 (its north end, the end the walker leaves by) to x = 2.24. */
function curtain(): { collider: BvhCollider; zone: TraverseZone } {
  const parts = [
    box(-20, -0.2, -20, 20, 0, 20),
    // The +Z wall runs the whole box and 3 m on; the -Z wall stops 0.6 m short of the north end.
    box(-HALF - 3, 0, 0.225, HALF + 1, 3, 3),
    box(-HALF + 0.6, 0, -3, HALF + 1, 3, -0.225),
    // Rock beyond the south end, so that the only way out is north.
    box(HALF + 1, 0, -3, HALF + 2, 3, 3),
  ];
  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('merge failed');
  const zone = new TraverseZone(
    'curtain',
    'sidle',
    [2 * HALF, 2.5, 0.84],
    new Vector3(0, 1.25, 0),
    new Quaternion(),
  );
  return { collider: new BvhCollider(merged), zone };
}

type Point = [number, number];

/**
 * The journey harness's steering (route 1): while sidling, along the passage towards the first waypoint at least
 * 1.5 m away and 0.5 m along it; otherwise straight at the next waypoint, which counts as reached within 0.35 m.
 * Returns every mode the walker was in, in order, and where it ended.
 */
function drive(c: Controller, wps: Point[], seconds: number): { modes: Mode[]; reached: number } {
  const dt = 1 / 60;
  const modes: Mode[] = [c.mode];
  let i = 0;
  let yaw: number;
  let sign = -1;
  for (let f = 0; f < seconds / dt && i < wps.length; f++) {
    const [bx, bz] = wps[i]!;
    const dx = bx - c.position.x;
    const dz = bz - c.position.z;
    if (Math.hypot(dx, dz) < 0.35) {
      i++;
      continue;
    }
    if (c.mode === 'sidle' && c.zone) {
      const ax = c.zone.flatX;
      const along = (k: number) => (wps[k]![0] - c.position.x) * ax.x + (wps[k]![1] - c.position.z) * ax.z;
      let j = i;
      while (
        j < wps.length - 1 &&
        (Math.hypot(wps[j]![0] - c.position.x, wps[j]![1] - c.position.z) < 1.5 || Math.abs(along(j)) < 0.5)
      )
        j++;
      const a = along(j);
      sign = Math.abs(a) > 0.05 ? Math.sign(a) : sign;
      yaw = Math.atan2(-ax.x * sign, -ax.z * sign);
    } else yaw = Math.atan2(-dx, -dz);
    c.update(dt, wishFromInput(1, 0, yaw, false));
    if (modes[modes.length - 1] !== c.mode) modes.push(c.mode);
  }
  return { modes, reached: i };
}

// Out along the fissure to its north end, then beside the box (0.55 m off its middle plane, on the open side, 0.35 m
// inside the box's end as the curtain's waypoint lies), and on north-west into the open cave.
const WAYPOINTS: Point[] = [
  [0.5, 0],
  [-1, 0],
  [-2.1, 0],
  [-1.89, -0.55],
  [-3, -1.6],
  [-4.5, -2.5],
];

describe('the sidle/walk flicker where a fissure opens at an angle (the Ice Curtain, route 1)', () => {
  it('leaves the fissure once and walks on, with no switching back and forth', () => {
    const { collider, zone } = curtain();
    const c = new Controller(collider, {}, [zone]);
    expect(c.place(new Vector3(1, 0, 0), { mode: 'sidle', yaw: Math.PI / 2 })).toBe('sidle');
    const { modes, reached } = drive(c, WAYPOINTS, 60);
    // Before the fix (measured on this world): 21 changes, sidle, walk, sidle, walk ... walk; on the curtain itself
    // route 1's harness measured 26 before its climb. Now one, sidle to walk.
    expect(modes).toEqual(['sidle', 'walk']);
    expect(reached).toBe(WAYPOINTS.length);
  });

  it('a walker who stepped out of the end walks back in when it heads into the passage', () => {
    const { collider, zone } = curtain();
    const c = new Controller(collider, {}, [zone]);
    c.place(new Vector3(-1, 0, 0), { mode: 'sidle', yaw: 0 });
    const west = wishFromInput(1, 0, Math.PI / 2, false);
    const east = wishFromInput(1, 0, -Math.PI / 2, false);
    for (let f = 0; f < 240 && c.mode === 'sidle'; f++) c.update(1 / 60, west);
    expect(c.mode).toBe('walk');
    for (let f = 0; f < 30; f++) c.update(1 / 60, west);
    // Straight back east, along the passage: the walker sidles in again.
    for (let f = 0; f < 240 && c.mode === 'walk'; f++) c.update(1 / 60, east);
    expect(c.mode).toBe('sidle');
    for (let f = 0; f < 120; f++) c.update(1 / 60, east);
    expect(c.position.x).toBeGreaterThan(-HALF + 0.3);
  });

  it(`a walker who stepped out of the end and comes back more than ${Math.round((SIDLE.reentryAngle * 180) / Math.PI)} degrees off the passage walks on`, () => {
    const { collider, zone } = curtain();
    const c = new Controller(collider, {}, [zone]);
    c.place(new Vector3(-1, 0, 0), { mode: 'sidle', yaw: 0 });
    const west = wishFromInput(1, 0, Math.PI / 2, false);
    for (let f = 0; f < 240 && c.mode === 'sidle'; f++) c.update(1 / 60, west);
    expect(c.mode).toBe('walk');
    // 45 degrees back, sliding along the +Z wall into the open end of the box: walking, not sidling.
    const diagonal = wishFromInput(1, 0, -Math.PI / 2 - Math.PI / 4, false);
    const modes = new Set<Mode>();
    for (let f = 0; f < 90; f++) {
      c.update(1 / 60, diagonal);
      modes.add(c.mode);
    }
    expect([...modes]).toEqual(['walk']);
  });

  it(`once ${SIDLE.reentryClear} m clear of the box and its margins, it is entered as before, at an angle too`, () => {
    const { collider, zone } = curtain();
    const c = new Controller(collider, {}, [zone]);
    c.place(new Vector3(-1, 0, 0), { mode: 'sidle', yaw: 0 });
    const west = wishFromInput(1, 0, Math.PI / 2, false);
    for (let f = 0; f < 600 && c.position.x > -HALF - 1.2; f++) c.update(1 / 60, west);
    expect(c.mode).toBe('walk');
    // Back in at the same 45 degrees as above: now it sidles.
    const diagonal = wishFromInput(1, 0, -Math.PI / 2 - Math.PI / 4, false);
    for (let f = 0; f < 240 && c.mode === 'walk'; f++) c.update(1 / 60, diagonal);
    expect(c.mode).toBe('sidle');
  });
});
