import { BoxGeometry, BufferGeometry, Object3D, Quaternion, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { describe, expect, it } from 'vitest';
import { CLIMB, CRAWL, SIDLE, TRAVERSE, WALK } from '../src/config';
import { BvhCollider } from '../src/physics/collider';
import { Controller, wishFromInput, type Wish } from '../src/physics/controller';
import { findZones, spawnModes, TraverseZone, ViewTurn, wrapAngle, type TraverseKind } from '../src/traverse';

// The traversal modes (src/traverse.ts) on small worlds of boxes; every passage runs along +X.

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

/** A zone centred on `at`, turned `turn` radians about +Y. */
function zone(
  kind: TraverseKind,
  at: [number, number, number],
  size: [number, number, number],
  turn = 0,
): TraverseZone {
  const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), turn);
  return new TraverseZone(kind, kind, size, new Vector3(...at), rotation);
}

const EAST_YAW = -Math.PI / 2;
const EAST: Wish = { x: 1, z: 0, run: false, yaw: EAST_YAW };
const WEST: Wish = { x: -1, z: 0, run: false, yaw: Math.PI / 2 };
const NORTH: Wish = { x: 0, z: -1, run: false, yaw: 0 };
const STILL: Wish = { x: 0, z: 0, run: false };
/** S (back) looking east at a climb face, and looking west away from it. */
const BACK: Wish = { x: -1, z: 0, run: false, yaw: EAST_YAW };
const BACK_AWAY: Wish = { x: 1, z: 0, run: false, yaw: Math.PI / 2 };

/** Runs whole frames for `seconds`, or until `stop` holds after one; returns the time run. */
function run(c: Controller, seconds: number, wish: Wish, frame = 1 / 60, stop?: () => boolean): number {
  const frames = Math.round(seconds / frame);
  for (let i = 0; i < frames; i++) {
    c.update(frame, wish);
    if (stop?.()) return (i + 1) * frame;
  }
  return frames * frame;
}

function expectAt(p: Vector3, at: [number, number, number], digits = 6): void {
  p.toArray().forEach((v, i) => expect(v).toBeCloseTo(at[i]!, digits));
}

// A crawl tunnel x 0..6, 1.2 m wide and 1.0 m high under rock 2 m high; its zone 0.2 m longer at each mouth.
const tunnel = () => [box(0, 0, -3, 6, 2, -0.6), box(0, 0, 0.6, 6, 2, 3), box(0, 1, -0.6, 6, 2, 0.6)];
const tunnelZone = () => zone('crawl', [3, 0.4, 0], [6.4, 1.2, 1.2]);

// A sidle fissure x 0..5, 0.45 m wide between rocks 3 m high; its zone 0.2 m longer at each mouth.
const fissure = () => [box(0, 0, -3, 5, 3, -0.225), box(0, 0, 0.225, 5, 3, 3)];
const fissureZone = () => zone('sidle', [2.5, 0.9, 0], [5.4, 2.2, 0.45]);

// A climb face: the x = 5 side of a block x 5..10, 4 m high. Its zone stands on the face with +Z out of it (world
// -X), 3 m wide (z -1.5..1.5), from the floor to the ledge.
const ledge = () => [box(5, 0, -3, 10, 4, 3)];
const faceZone = () => zone('climb', [5, 2, 0], [3, 4, 1.2], -Math.PI / 2);
const HOLD_X = 5 - CLIMB.hold;

describe('traversal zones', () => {
  it('map points between the world and the box frame; the box counts longer at its X ends on request', () => {
    const z = faceZone();
    expect(z.axisZ.toArray().map((n) => Math.round(n) + 0)).toEqual([-1, 0, 0]);
    expect(z.axisX.toArray().map((n) => Math.round(n) + 0)).toEqual([0, 0, 1]);
    const l = z.toLocal(new Vector3(4.65, 1, 0.5));
    expectAt(l, [0.5, -1, 0.35], 9);
    expect(z.toWorld(l.x, l.y, l.z).distanceTo(new Vector3(4.65, 1, 0.5))).toBeLessThan(1e-9);
    const t = tunnelZone();
    expect(t.contains(new Vector3(-0.4, 0, 0))).toBe(false);
    expect(t.contains(new Vector3(-0.4, 0, 0), TRAVERSE.endMargin)).toBe(true);
    expect(t.contains(new Vector3(3, 0, 0.7), TRAVERSE.endMargin)).toBe(false);
    expect(t.contains(new Vector3(3, -0.2 - TRAVERSE.edge / 2, 0))).toBe(true);
  });

  it('are read from Trav_ nodes: rotation and parents count, scale does not, bad extras are skipped', () => {
    const root = new Object3D();
    const area = new Object3D();
    area.name = 'Area_cave';
    area.position.set(100, 0, 0);
    root.add(area);
    const node = (name: string, extras: Record<string, unknown>) => {
      const o = new Object3D();
      o.name = name;
      o.userData = extras;
      area.add(o);
      return o;
    };
    const face = node('Trav_face', { wdi_traverse: 'climb', size: [3, 4, 1.2] });
    face.position.set(5, 2, 0);
    face.rotation.y = -Math.PI / 2;
    face.scale.set(2, 2, 2);
    node('Trav_tunnel', { wdi_traverse: 'crawl', size: [6.4, 1.2, 1.2] });
    node('Trav_swim', { wdi_traverse: 'swim', size: [1, 1, 1] });
    node('Trav_flat', { wdi_traverse: 'sidle', size: [1, 0, 1] });
    node('Trav_short', { wdi_traverse: 'sidle', size: [1, 1] });
    node('Trav_', { wdi_traverse: 'crawl', size: [1, 1, 1] });
    node('Spawn_trav', { wdi_traverse: 'crawl', size: [1, 1, 1] });
    const zones = findZones(root);
    expect(zones.map((z) => [z.id, z.kind])).toEqual([
      ['face', 'climb'],
      ['tunnel', 'crawl'],
    ]);
    expectAt(zones[0]!.origin, [105, 2, 0], 9);
    expect(zones[0]!.half.toArray()).toEqual([1.5, 2, 0.6]);
    expect(zones[0]!.axisZ.x).toBeCloseTo(-1, 9);
  });

  it('give each spawn the mode its wdi_mode asks for, the ids read as findSpawns reads them', () => {
    const root = new Object3D();
    for (const [name, mode] of [
      ['Spawn_tunnel', 'crawl'],
      ['Spawn_tunnel', 'climb'],
      ['Spawn_hall', undefined],
      ['Spawn_pool', 'swim'],
      ['Spawn_face', 'climb'],
    ] as const) {
      const o = new Object3D();
      o.name = name;
      o.userData = mode ? { wdi_mode: mode } : {};
      root.add(o);
    }
    expect([...spawnModes(root)]).toEqual([
      ['tunnel', 'crawl'],
      ['face', 'climb'],
    ]);
  });
});

describe('without zones', () => {
  it('the walker only walks: no mode, the walking body and eye, no hold on the view', () => {
    for (const [rock, stop] of [
      [tunnel(), 0],
      [fissure(), 0.1],
      [ledge(), 5],
    ] as const) {
      const c = new Controller(world(...rock));
      expect(c.place(new Vector3(-3, 0, 0), { mode: 'crawl' })).toBe('walk');
      const seen = new Set<string>();
      run(c, 6, { ...EAST, run: true }, 1 / 60, () => (seen.add(c.mode), false));
      expect([...seen]).toEqual(['walk']);
      expect(c.zone).toBeNull();
      expect(c.eyeHeight).toBe(WALK.eyeHeight);
      expect(c.viewHold).toBeNull();
      expect(c.bodyRadius).toBe(WALK.radius);
      expect(c.position.x).toBeLessThan(stop - 0.15);
    }
  });

  it('wishFromInput carries the camera yaw', () => {
    expect(wishFromInput(1, 0, 0.3, false).yaw).toBe(0.3);
  });
});

describe('crawling', () => {
  it('a 1.0 m tunnel stops a walker; with its zone the walker crawls through at crawling speed, never running', () => {
    const walker = new Controller(world(...tunnel()));
    walker.place(new Vector3(-3, 0, 0));
    run(walker, 5, EAST);
    expect(walker.position.x).toBeCloseTo(-WALK.radius, 2);
    expect(walker.mode).toBe('walk');

    const c = new Controller(world(...tunnel()), {}, [tunnelZone()]);
    c.place(new Vector3(-3, 0, 0));
    run(c, 5, EAST, 1 / 60, () => c.mode === 'crawl');
    // The walking body would touch the mouth 0.3 m out; the crawl starts before, where the feet reach the zone.
    expect(c.mode).toBe('crawl');
    expect(c.position.x).toBeLessThan(-0.45);
    run(c, 2, EAST);
    const x = c.position.x;
    run(c, 2, { ...EAST, run: true });
    expect(c.position.x - x).toBeCloseTo(2 * CRAWL.speed, 1);
    run(c, 20, EAST, 1 / 60, () => c.mode === 'walk');
    expect(c.mode).toBe('walk');
    expect(c.position.x).toBeGreaterThan(6.2 + TRAVERSE.endMargin);
    run(c, 1, EAST);
    expect(c.eyeHeight).toBe(WALK.eyeHeight);
    expect(c.bodyTop).toBe(WALK.bodyHeight);
  });

  it('has a body solid from the step height to 0.9 m and the eye at 0.55 m', () => {
    const c = new Controller(world(...tunnel()), {}, [tunnelZone()]);
    expect(c.place(new Vector3(3, 0, 0), { mode: 'crawl' })).toBe('crawl');
    expect(c.bodyTop).toBe(CRAWL.bodyHeight);
    expect(c.params.stepHeight + 2 * c.bodyRadius).toBeCloseTo(CRAWL.bodyHeight, 9);
    expect(c.eyeHeight).toBe(CRAWL.eyeHeight);
    expect(c.position.y).toBeCloseTo(0, 6);
  });

  it('never stands up under the low roof, past the end of its zone or standing still there', () => {
    // The roof runs x 0..8; the zone covers only x -0.2..3.
    const roof = [box(0, 0, -3, 8, 2, -0.6), box(0, 0, 0.6, 8, 2, 3), box(0, 1, -0.6, 8, 2, 0.6)];
    const c = new Controller(world(...roof), {}, [zone('crawl', [1.4, 0.4, 0], [3.2, 1.2, 1.2])]);
    c.place(new Vector3(-2, 0, 0));
    let stood = false;
    let highest = 0;
    const watch = () => {
      if (c.position.x > 0 && c.position.x < 8) {
        if (c.mode !== 'crawl') stood = true;
        highest = Math.max(highest, c.position.y + c.bodyTop, c.position.y + c.eyeHeight);
      }
    };
    run(c, 20, EAST, 1 / 60, () => (watch(), c.position.x > 5));
    run(c, 3, STILL, 1 / 60, () => (watch(), false));
    expect(c.mode).toBe('crawl');
    run(c, 2, WEST, 1 / 60, () => (watch(), false));
    run(c, 20, EAST, 1 / 60, () => (watch(), c.mode === 'walk'));
    expect(stood).toBe(false);
    expect(highest).toBeLessThanOrEqual(1);
    // It stands once its whole footprint is past the roof.
    expect(c.mode).toBe('walk');
    expect(c.position.x).toBeGreaterThan(8 + WALK.radius * 0.7);
  });

  it('needs 1.8 m of room above the feet to stand up', () => {
    // Past the tunnel's far end a ceiling at `ceiling` m runs on for 3 m.
    const under = (ceiling: number) => {
      const rock = world(...tunnel(), box(6, ceiling, -3, 9, ceiling + 0.3, 3));
      const c = new Controller(rock, {}, [tunnelZone()]);
      c.place(new Vector3(3, 0, 0), { mode: 'crawl' });
      run(c, 10, EAST, 1 / 60, () => c.position.x > 7.5);
      return c.mode;
    };
    expect(under(1.7)).toBe('crawl');
    expect(under(1.85)).toBe('walk');
  });

  it('moves the eye down to 0.55 m and back up over about 0.3 s, never jumping', () => {
    const c = new Controller(world(...tunnel()), {}, [tunnelZone()]);
    c.place(new Vector3(-3, 0, 0));
    const frame = 1 / 60;
    const most = ((WALK.eyeHeight - CRAWL.eyeHeight) / TRAVERSE.eyeSeconds) * frame + 1e-9;
    let jump = 0;
    let last = c.eyeHeight;
    let crawled = -1;
    let down = -1;
    let stood = -1;
    let up = -1;
    for (let i = 0; i < 60 * 25 && up < 0; i++) {
      c.update(frame, EAST);
      jump = Math.max(jump, Math.abs(c.eyeHeight - last));
      last = c.eyeHeight;
      if (crawled < 0 && c.mode === 'crawl') crawled = i;
      if (down < 0 && c.eyeHeight === CRAWL.eyeHeight) down = i;
      if (crawled >= 0 && stood < 0 && c.mode === 'walk') stood = i;
      if (stood >= 0 && c.eyeHeight === WALK.eyeHeight) up = i;
    }
    expect(jump).toBeLessThanOrEqual(most);
    expect((down - crawled + 1) * frame).toBeCloseTo(TRAVERSE.eyeSeconds, 1);
    expect((up - stood + 1) * frame).toBeCloseTo(TRAVERSE.eyeSeconds, 1);
  });

  it('finds the floor of a spawn in a crawl zone from just above it, and starts crawling with the eye low', () => {
    // No wdi_mode (a plain spawn, a respawn, a portal arrival): the camera still never starts above the low roof.
    const c = new Controller(world(...tunnel()), {}, [tunnelZone()]);
    expect(c.place(new Vector3(3, 0.05, 0))).toBe('crawl');
    expect(c.position.y).toBeCloseTo(0, 6);
    expect(c.eyeHeight).toBe(CRAWL.eyeHeight);
    let highest = c.eyeHeight;
    run(c, 0.5, STILL, 1 / 60, () => ((highest = Math.max(highest, c.eyeHeight)), false));
    expect(highest).toBe(CRAWL.eyeHeight);
    expect(c.mode).toBe('crawl');
    expect(c.position.y).toBeCloseTo(0, 6);
  });
});

describe('sidling', () => {
  it('a 0.45 m fissure stops a walker; with its zone the walker sidles through, thin and slow, never running', () => {
    const walker = new Controller(world(...fissure()));
    walker.place(new Vector3(-3, 0, 0));
    run(walker, 5, EAST);
    expect(walker.position.x).toBeLessThan(-0.15);
    expect(walker.position.x).toBeGreaterThan(-0.3);

    const c = new Controller(world(...fissure()), {}, [fissureZone()]);
    c.place(new Vector3(-3, 0, 0));
    run(c, 5, EAST, 1 / 60, () => c.mode === 'sidle');
    expect(c.mode).toBe('sidle');
    expect(c.bodyRadius).toBe(SIDLE.radius);
    expect(c.bodyTop).toBe(WALK.bodyHeight);
    run(c, 2, EAST);
    const x = c.position.x;
    run(c, 2, { ...EAST, run: true });
    expect(c.position.x - x).toBeCloseTo(2 * SIDLE.speed, 1);
    run(c, 20, EAST, 1 / 60, () => c.mode === 'walk');
    expect(c.mode).toBe('walk');
    expect(c.position.x).toBeGreaterThan(5.2 + TRAVERSE.endMargin);
    expect(c.bodyRadius).toBe(WALK.radius);
  });

  it('moves only along the passage: input across it goes nowhere, and the sign follows the input', () => {
    const c = new Controller(world(...fissure()), {}, [fissureZone()]);
    expect(c.place(new Vector3(2.5, 0, 0), { mode: 'sidle', yaw: 0 })).toBe('sidle');
    run(c, 2, NORTH);
    expect(c.position.x).toBeCloseTo(2.5, 6);
    expect(c.position.z).toBeCloseTo(0, 6);
    const slant: Wish = { x: 0.6, z: -0.8, run: false, yaw: 0 };
    run(c, 1, slant);
    const x1 = c.position.x;
    run(c, 2, slant);
    expect(c.position.x - x1).toBeCloseTo(2 * 0.6 * SIDLE.speed, 1);
    run(c, 1, WEST);
    const x2 = c.position.x;
    run(c, 1, WEST);
    expect(c.position.x - x2).toBeCloseTo(-SIDLE.speed, 1);
    expect(c.position.z).toBeCloseTo(0, 6);
    expect(c.mode).toBe('sidle');
  });

  it('turns the view to the wall nearer the heading and holds it within 60 degrees until the walker is out', () => {
    for (const [lean, wallYaw] of [
      [0.2, 0],
      [-0.2, Math.PI],
    ] as const) {
      const c = new Controller(world(...fissure()), {}, [fissureZone()]);
      c.place(new Vector3(-3, 0, 0));
      const turn = new ViewTurn();
      const frame = 1 / 60;
      let yaw = EAST_YAW + lean;
      let turnedAt = -1;
      // As main.ts runs it: hold the yaw, then move. Straight east until the sidle, then sideways as the view sees it.
      for (let i = 0; i < 600; i++) {
        yaw = turn.apply(yaw, c.viewHold, frame);
        const hold = c.viewHold;
        if (hold && turnedAt < 0 && Math.abs(wrapAngle(hold.yaw - yaw)) < 1e-9) turnedAt = i;
        c.update(frame, hold ? wishFromInput(0, Math.sign(Math.cos(yaw)), yaw, false) : { ...EAST, yaw });
        if (turnedAt >= 0 && i > turnedAt + 30) break;
      }
      expect(c.mode).toBe('sidle');
      expect(wrapAngle(c.viewHold!.yaw - wallYaw)).toBeCloseTo(0, 9);
      expect(Math.abs(wrapAngle(yaw - wallYaw))).toBeLessThan(1e-9);
      // Looking away is held at 60 degrees from the wall, both ways; within them the view is free.
      expect(wrapAngle(turn.apply(yaw + 1.5, c.viewHold, frame) - wallYaw)).toBeCloseTo(SIDLE.viewHold, 9);
      expect(wrapAngle(turn.apply(yaw - 1.5, c.viewHold, frame) - wallYaw)).toBeCloseTo(-SIDLE.viewHold, 9);
      expect(turn.apply(yaw + 0.5, c.viewHold, frame)).toBe(yaw + 0.5);
      // Out at the far end the hold ends and the view is free again.
      const strafe = Math.sign(Math.cos(yaw));
      for (let i = 0; i < 60 * 30 && c.mode === 'sidle'; i++) {
        yaw = turn.apply(yaw, c.viewHold, frame);
        c.update(frame, wishFromInput(0, strafe, yaw, false));
      }
      expect(c.mode).toBe('walk');
      expect(c.position.x).toBeGreaterThan(5.2);
      expect(c.viewHold).toBeNull();
      expect(turn.apply(yaw + 2, c.viewHold, frame)).toBe(yaw + 2);
    }
  });

  it('the view turns at SIDLE.turnRate and an arrival faces the wall at once', () => {
    const turn = new ViewTurn();
    const hold = { yaw: 0, max: SIDLE.viewHold };
    expect(turn.apply(-1, hold, 0.1)).toBeCloseTo(-1 + SIDLE.turnRate * 0.1, 9);
    let yaw = -1;
    for (let i = 0; i < 10; i++) yaw = turn.apply(yaw, hold, 0.1);
    expect(yaw).toBe(0);
    expect(new ViewTurn().snap(2 * Math.PI + 0.3, hold)).toBeCloseTo(2 * Math.PI, 9);
    expect(new ViewTurn().snap(0.3, null)).toBe(0.3);
    expect(wrapAngle((3 * Math.PI) / 2)).toBeCloseTo(-Math.PI / 2, 9);
    expect(wrapAngle((-3 * Math.PI) / 2)).toBeCloseTo(Math.PI / 2, 9);
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI, 9);
  });
});

describe('climbing', () => {
  it('a 4 m face stops a walker; with its zone the walker pushing at it climbs and mantles onto the ledge', () => {
    const walker = new Controller(world(...ledge()));
    walker.place(new Vector3(2, 0, 0));
    run(walker, 5, EAST);
    expect(walker.position.x).toBeCloseTo(5 - WALK.radius, 2);

    const c = new Controller(world(...ledge()), {}, [faceZone()]);
    c.place(new Vector3(2, 0, 0));
    run(c, 5, EAST, 1 / 60, () => c.mode === 'climb');
    expect(c.mode).toBe('climb');
    expect(c.position.x).toBeGreaterThanOrEqual(5 - CLIMB.reach - 1e-6);
    run(c, 1, EAST);
    const y = c.position.y;
    run(c, 2, EAST);
    expect(c.position.y - y).toBeCloseTo(2 * CLIMB.speed, 6);
    expect(c.position.x).toBeCloseTo(HOLD_X, 6);
    expect(c.onGround).toBe(false);
    run(c, 10, EAST, 1 / 60, () => c.mantling);
    expect(c.position.y).toBeCloseTo(4, 6);
    const mantle = run(c, 2, EAST, 1 / 60, () => !c.mantling);
    expect(mantle).toBeCloseTo(CLIMB.mantleSeconds, 1);
    expect(c.mode).toBe('walk');
    expect(c.onGround).toBe(true);
    // Set down 0.8 m beyond the face; the rest of that frame may already walk on.
    expectAt(c.position, [5 + CLIMB.mantleReach, 4, 0], 2);
    run(c, 1, EAST);
    expect(c.position.y).toBeCloseTo(4, 6);
    expect(c.position.x).toBeGreaterThan(6);
  });

  it('attaches only at the foot of the face, within reach of it, pushing within 60 degrees of it', () => {
    const at = (x: number, z: number, wish: Wish, seconds = 1) => {
      const c = new Controller(world(...ledge()), {}, [faceZone()]);
      c.place(new Vector3(x, 0, z));
      run(c, seconds, wish, 1 / 60, () => c.mode === 'climb');
      return c;
    };
    const angled = (deg: number): Wish => {
      const a = (deg * Math.PI) / 180;
      return { x: Math.cos(a), z: Math.sin(a), run: false };
    };
    expect(at(4.7, 0, angled(70)).mode).toBe('walk');
    expect(at(4.7, 0, angled(-70)).mode).toBe('walk');
    expect(at(4.7, 0, angled(50)).mode).toBe('climb');
    expect(at(4.7, 0, angled(-50)).mode).toBe('climb');
    expect(at(4.7, 0, WEST).mode).toBe('walk');
    expect(at(4.7, 0, STILL).mode).toBe('walk');
    // From further out the walker first walks up to it.
    const far = at(3, 0, EAST, 3);
    expect(far.mode).toBe('climb');
    expect(5 - far.position.x).toBeLessThanOrEqual(CLIMB.reach + 1e-6);
    // Beside the face's width there is nothing to climb.
    expect(at(4.7, 2, EAST, 2).mode).toBe('walk');
  });

  it('hangs without falling, climbs up and down at 0.6 m/s and moves sideways within the face', () => {
    const c = new Controller(world(...ledge()), {}, [faceZone()]);
    expect(c.place(new Vector3(HOLD_X, 1, 0), { mode: 'climb' })).toBe('climb');
    run(c, 3, STILL);
    expect(c.mode).toBe('climb');
    expectAt(c.position, [HOLD_X, 1, 0]);
    run(c, 1, EAST);
    expect(c.position.y).toBeCloseTo(1 + CLIMB.speed, 6);
    run(c, 1, BACK);
    expect(c.position.y).toBeCloseTo(1, 6);
    run(c, 1, { x: 0, z: 1, run: true });
    expect(c.position.z).toBeCloseTo(CLIMB.speed, 6);
    run(c, 5, { x: 0, z: 1, run: false });
    expectAt(c.position, [HOLD_X, 1, 1.5]);
    expect(c.mode).toBe('climb');
  });

  it('lets go onto the floor when climbing down past the foot', () => {
    const c = new Controller(world(...ledge()), {}, [faceZone()]);
    c.place(new Vector3(HOLD_X, 1, 0), { mode: 'climb' });
    const t = run(c, 5, BACK, 1 / 60, () => c.mode === 'walk');
    expect(t).toBeCloseTo(1 / CLIMB.speed, 1);
    expect(c.onGround).toBe(true);
    // Set down at the foot; the rest of that frame already walks on.
    expectAt(c.position, [HOLD_X, 0, 0], 2);
    run(c, 1, WEST);
    expect(c.mode).toBe('walk');
    expect(c.position.x).toBeLessThan(4);
  });

  it('catches a walker stepping off the ledge, who climbs down; beside the face the walker falls', () => {
    const c = new Controller(world(...ledge()), {}, [faceZone()]);
    c.place(new Vector3(7, 4, 0));
    let lowest = 4;
    run(c, 5, WEST, 1 / 60, () => {
      lowest = Math.min(lowest, c.position.y);
      return c.mode === 'climb';
    });
    expect(c.mode).toBe('climb');
    expect(lowest).toBeGreaterThan(4 - CLIMB.catchBand);
    run(c, 1, STILL);
    expect(c.mode).toBe('climb');
    expect(c.position.y).toBeGreaterThan(4 - CLIMB.catchBand);
    run(c, 10, BACK_AWAY, 1 / 60, () => c.mode === 'walk');
    expect(c.mode).toBe('walk');
    expect(c.position.y).toBeCloseTo(0, 6);

    const beside = new Controller(world(...ledge()), {}, [faceZone()]);
    beside.place(new Vector3(7, 4, 2.5));
    const modes = new Set<string>();
    run(beside, 4, WEST, 1 / 60, () => (modes.add(beside.mode), false));
    expect([...modes]).toEqual(['walk']);
    expect(beside.position.y).toBeCloseTo(0, 5);
  });
});

describe('arriving in a mode', () => {
  it('starts in the mode a spawn asks for when it stands in a zone of that kind, and walks otherwise', () => {
    const crawl = new Controller(world(...tunnel()), {}, [tunnelZone()]);
    expect(crawl.place(new Vector3(3, 0, 0), { mode: 'crawl' })).toBe('crawl');
    expect(crawl.eyeHeight).toBe(CRAWL.eyeHeight);
    expect(crawl.position.y).toBeCloseTo(0, 6);
    // In a crawl zone it crawls whatever it asks for; main.ts warns that it does not sidle.
    expect(crawl.place(new Vector3(3, 0, 0), { mode: 'sidle' })).toBe('crawl');
    expect(crawl.eyeHeight).toBe(CRAWL.eyeHeight);
    // Not in a zone of its kind: it walks (main.ts says so in the console).
    expect(crawl.place(new Vector3(-5, 0, 0), { mode: 'crawl' })).toBe('walk');
    expect(crawl.eyeHeight).toBe(WALK.eyeHeight);

    const sidle = new Controller(world(...fissure()), {}, [fissureZone()]);
    expect(sidle.place(new Vector3(2.5, 0, 0), { mode: 'sidle', yaw: EAST_YAW })).toBe('sidle');
    expect(sidle.viewHold?.yaw).toBeCloseTo(0, 9);

    const climb = new Controller(world(...ledge()), {}, [faceZone()]);
    expect(climb.place(new Vector3(HOLD_X, 1, 0), { mode: 'climb' })).toBe('climb');
    expectAt(climb.position, [HOLD_X, 1, 0]);
    expect(climb.place(new Vector3(2, 0, 0), { mode: 'climb' })).toBe('walk');
    expect(climb.place(new Vector3(HOLD_X, 1, 0), { mode: 'crawl' })).toBe('walk');
    expect(climb.position.y).toBeCloseTo(0, 6);
  });
});

// Software WebGL in CI draws at about 6 fps (as test/frame-rate.test.ts): every mode keeps its real-time speed.
describe('slow frames in each mode', () => {
  const SLOW = 1 / 6;

  it('crawl at crawling speed and move the eye in the same time', () => {
    const c = new Controller(world(...tunnel()), {}, [tunnelZone()]);
    c.place(new Vector3(-3, 0, 0));
    run(c, 3, EAST, SLOW, () => c.mode === 'crawl');
    run(c, 2, EAST, SLOW);
    expect(c.eyeHeight).toBe(CRAWL.eyeHeight);
    const x = c.position.x;
    run(c, 2, EAST, SLOW);
    expect(c.position.x - x).toBeCloseTo(2 * CRAWL.speed, 1);
  });

  it('sidle at sidling speed', () => {
    const c = new Controller(world(...fissure()), {}, [fissureZone()]);
    c.place(new Vector3(0.5, 0, 0), { mode: 'sidle', yaw: EAST_YAW });
    run(c, 1, EAST, SLOW);
    const x = c.position.x;
    run(c, 2, EAST, SLOW);
    expect(c.position.x - x).toBeCloseTo(2 * SIDLE.speed, 1);
  });

  it('climb at climbing speed and mantle in the same time', () => {
    const c = new Controller(world(...ledge()), {}, [faceZone()]);
    c.place(new Vector3(HOLD_X, 0.5, 0), { mode: 'climb' });
    run(c, 2, EAST, SLOW);
    expect(c.position.y).toBeCloseTo(0.5 + 2 * CLIMB.speed, 6);
    run(c, 10, EAST, SLOW, () => c.mantling);
    const mantle = run(c, 2, EAST, SLOW, () => !c.mantling);
    expect(mantle).toBeGreaterThanOrEqual(CLIMB.mantleSeconds - SLOW);
    expect(mantle).toBeLessThanOrEqual(CLIMB.mantleSeconds + SLOW);
    // On the ledge 0.8 m beyond the face, plus what the rest of the last frame walked.
    expect(c.mode).toBe('walk');
    expect(c.onGround).toBe(true);
    expect(c.position.y).toBeCloseTo(4, 6);
    expect(c.position.x).toBeGreaterThanOrEqual(5 + CLIMB.mantleReach - 1e-6);
    expect(c.position.x).toBeLessThan(5 + CLIMB.mantleReach + SLOW * WALK.walkSpeed);
  });
});

// A crawl tunnel x 0..6 (1.0 m high) opening straight into a sidle fissure x 6..11 (`width` wide), the drawn boxes
// touching at the mouth or overlapping by 0.3 m.
const junction = (width: number) => [
  ...tunnel(),
  box(6, 0, -3, 11, 3, -width / 2),
  box(6, 0, width / 2, 11, 3, 3),
];
const junctionZones = (overlap: number, width: number) => [
  zone('crawl', [(-0.2 + 6 + overlap) / 2, 0.4, 0], [6.2 + overlap, 1.2, 1.2]),
  zone('sidle', [(6 - overlap + 11.2) / 2, 0.9, 0], [5.2 + overlap, 2.2, width]),
];

describe('a crawl opening straight into a sidle', () => {
  for (const [overlap, width] of [
    [0, 0.45],
    [0.3, 0.45],
    [0, 0.4],
  ] as const) {
    it(`is crawled into thin and sidled out of (boxes ${overlap ? 'overlapping' : 'touching'}, ${width} m fissure)`, () => {
      const c = new Controller(world(...junction(width)), {}, junctionZones(overlap, width));
      c.place(new Vector3(-2, 0, 0));
      const modes: string[] = [c.mode];
      run(c, 60, EAST, 1 / 60, () => {
        if (modes[modes.length - 1] !== c.mode) modes.push(c.mode);
        // Never higher than the roof while under it, never wider than the fissure while in it.
        if (c.position.x > 0.3 && c.position.x < 6)
          expect(c.position.y + Math.max(c.bodyTop, c.eyeHeight)).toBeLessThanOrEqual(1 + 1e-6);
        if (c.position.x > 6 && c.position.x < 11)
          expect(Math.abs(c.position.z) + c.bodyRadius).toBeLessThanOrEqual(width / 2 + 1e-3);
        return c.position.x > 12;
      });
      expect(modes).toEqual(['walk', 'crawl', 'sidle', 'walk']);
      expect(c.position.x).toBeGreaterThan(12);
    });
  }

  it('is passed the other way too: sidled into, crawled out of', () => {
    const c = new Controller(world(...junction(0.45)), {}, junctionZones(0, 0.45));
    c.place(new Vector3(13, 0, 0));
    const modes: string[] = [c.mode];
    run(c, 60, WEST, 1 / 60, () => {
      if (modes[modes.length - 1] !== c.mode) modes.push(c.mode);
      return c.position.x < -1;
    });
    expect(modes).toEqual(['walk', 'sidle', 'crawl', 'walk']);
  });
});

describe('climbing controls (ruling 4: forward climbs, back goes down)', () => {
  const hanging = () => {
    const c = new Controller(world(...ledge()), {}, [faceZone()]);
    c.place(new Vector3(HOLD_X, 1, 0), { mode: 'climb' });
    return c;
  };

  it('W climbs and S goes down wherever the camera looks', () => {
    for (const yaw of [EAST_YAW, Math.PI / 2, 0, Math.PI, -Math.PI / 4]) {
      const c = hanging();
      run(c, 1, wishFromInput(1, 0, yaw, false));
      expect(c.position.y).toBeCloseTo(1 + CLIMB.speed, 6);
      run(c, 1, wishFromInput(-1, 0, yaw, false));
      expect(c.position.y).toBeCloseTo(1, 6);
      expect(c.position.z).toBeCloseTo(0, 6);
      expect(c.mode).toBe('climb');
    }
  });

  it('strafing moves along the face, to the right as the camera sees it', () => {
    const facing = hanging();
    run(facing, 1, wishFromInput(0, 1, EAST_YAW, false));
    expectAt(facing.position, [HOLD_X, 1, CLIMB.speed]);
    const away = hanging();
    run(away, 1, wishFromInput(0, 1, Math.PI / 2, false));
    expectAt(away.position, [HOLD_X, 1, -CLIMB.speed]);
  });

  it('backing into the face (S, looking away) does not attach, nor flicker between climbing and walking', () => {
    const c = new Controller(world(...ledge()), {}, [faceZone()]);
    c.place(new Vector3(4, 0, 0));
    const modes = new Set<string>();
    run(c, 3, BACK_AWAY, 1 / 60, () => (modes.add(c.mode), false));
    expect([...modes]).toEqual(['walk']);
    expect(c.position.x).toBeCloseTo(5 - WALK.radius, 2);
    // Strafing at it (no forward or back share) attaches and hangs.
    c.place(new Vector3(4, 0, 0));
    run(c, 3, wishFromInput(0, 1, 0, false), 1 / 60, () => c.mode === 'climb');
    expect(c.mode).toBe('climb');
  });

  it('a walker caught stepping off the ledge holding W hangs until W is let go; then W climbs back, S goes down', () => {
    const c = new Controller(world(...ledge()), {}, [faceZone()]);
    c.place(new Vector3(7, 4, 0));
    run(c, 5, WEST, 1 / 60, () => c.mode === 'climb');
    expect(c.mode).toBe('climb');
    const caught = c.position.y;
    run(c, 2, WEST);
    expect(c.mode).toBe('climb');
    expect(c.mantling).toBe(false);
    expect(c.position.y).toBeCloseTo(caught, 6);
    run(c, 0.1, STILL);
    run(c, 3, WEST, 1 / 60, () => c.mode === 'walk');
    expect(c.mode).toBe('walk');
    expect(c.position.y).toBeCloseTo(4, 6);
    run(c, 5, WEST, 1 / 60, () => c.mode === 'climb');
    expect(c.mode).toBe('climb');
    run(c, 10, BACK_AWAY, 1 / 60, () => c.mode === 'walk');
    expect(c.position.y).toBeCloseTo(0, 6);
  });
});

describe('climb and mantle edge cases', () => {
  it('attaching to a face whose box starts 0.45 m above the floor does not lift the camera', () => {
    // The box runs from 0.45 m up to the ledge at 4 m.
    const high = zone('climb', [5, (0.45 + 4) / 2, 0], [3, 4 - 0.45, 1.2], -Math.PI / 2);
    const c = new Controller(world(...ledge()), {}, [high]);
    c.place(new Vector3(3.5, 0, 0));
    let y = c.position.y;
    let jump = 0;
    const watch = () => {
      jump = Math.max(jump, Math.abs(c.position.y - y));
      y = c.position.y;
    };
    run(c, 5, EAST, 1 / 60, () => (watch(), c.mode === 'climb'));
    expect(c.mode).toBe('climb');
    run(c, 0.5, EAST, 1 / 60, () => (watch(), false));
    expect(jump).toBeLessThanOrEqual(CLIMB.speed / 60 + 1e-9);
    // Going down again lets go onto the floor, without a drop either.
    run(c, 5, BACK, 1 / 60, () => (watch(), c.mode === 'walk'));
    expect(c.mode).toBe('walk');
    expect(c.position.y).toBeCloseTo(0, 6);
    expect(jump).toBeLessThanOrEqual(CLIMB.speed / 60 + 1e-9);
  });

  it('a mantle onto a ledge under a low roof lands crawling even without a crawl zone, and stands up past it', () => {
    // Rock 1.0 m over the ledge from the face to x = 8.
    const c = new Controller(world(...ledge(), box(5, 5, -3, 8, 6, 3)), {}, [faceZone()]);
    c.place(new Vector3(HOLD_X, 3, 0), { mode: 'climb' });
    run(c, 5, EAST, 1 / 60, () => c.mode !== 'climb');
    expect(c.mode).toBe('crawl');
    expect(c.zone).toBeNull();
    expect(c.position.y).toBeCloseTo(4, 6);
    run(c, 1, STILL);
    expect(c.eyeHeight).toBe(CRAWL.eyeHeight);
    expect(c.position.y + c.bodyTop).toBeLessThanOrEqual(5 + 1e-6);
    run(c, 15, EAST, 1 / 60, () => {
      if (c.position.x < 8) expect(c.mode).toBe('crawl');
      return c.mode === 'walk';
    });
    expect(c.mode).toBe('walk');
    expect(c.position.x).toBeGreaterThan(8);
  });
});

describe('a climb at the end of a crawl or a fissure, and rock on the face', () => {
  /** Runs `wish` until the walker walks on the ledge (4 m up) or `seconds` pass; returns the modes in order. */
  const journey = (c: Controller, wish: Wish, seconds: number): string[] => {
    const modes: string[] = [c.mode];
    run(c, seconds, wish, 1 / 60, () => {
      if (modes.at(-1) !== c.mode) modes.push(c.mode);
      return c.mode === 'walk' && c.onGround && c.position.y > 3.9;
    });
    return modes;
  };

  it('a crawl whose box reaches the foot of a chimney attaches from crawling and climbs out', () => {
    // The 1.0 m roof ends at x 6; the face is the x 6.6 side of a block 4 m high; the crawl box is drawn to the face.
    const walls = [box(0, 0, -3, 6.6, 2, -0.6), box(0, 0, 0.6, 6.6, 2, 3), box(0, 1, -0.6, 6, 2, 0.6)];
    const block = box(6.6, 0, -3, 12, 4, 3);
    const crawl = zone('crawl', [3.3, 0.4, 0], [6.6, 1.2, 1.2]);
    const face = zone('climb', [6.6, 2, 0], [1.2, 4, 1.2], -Math.PI / 2);
    const c = new Controller(world(...walls, block), {}, [crawl, face]);
    c.place(new Vector3(-2, 0, 0));
    expect(journey(c, EAST, 40)).toEqual(['walk', 'crawl', 'climb', 'walk']);
    expect(c.position.y).toBeCloseTo(4, 6);
    expect(c.position.x).toBeGreaterThan(6.6);
    expect(c.eyeHeight).toBe(WALK.eyeHeight);
  });

  it('a fissure whose box reaches the foot of a face attaches from sidling and climbs out', () => {
    const c = new Controller(world(...fissure(), ...ledge()), {}, [fissureZone(), faceZone()]);
    c.place(new Vector3(-2, 0, 0));
    expect(journey(c, EAST, 40)).toEqual(['walk', 'sidle', 'climb', 'walk']);
    expect(c.position.y).toBeCloseTo(4, 6);
    expect(c.position.x).toBeGreaterThan(5);
  });

  it('climbing down, rock sticking out of the face higher up does not let go; the floor at the foot does', () => {
    // A bump 0.5 m out of the face with its top 2 m up, right under the climber.
    const bump = box(4.5, 1.8, -3, 5, 2, 3);
    const c = new Controller(world(...ledge(), bump), {}, [faceZone()]);
    expect(c.place(new Vector3(HOLD_X, 3, 0), { mode: 'climb' })).toBe('climb');
    let lowestClimbing = 3;
    run(c, 10, BACK, 1 / 60, () => {
      if (c.mode === 'climb') lowestClimbing = Math.min(lowestClimbing, c.position.y);
      return c.mode !== 'climb';
    });
    expect(lowestClimbing).toBeLessThan(CLIMB.footBand);
    expect(c.mode).toBe('walk');
    expect(c.onGround).toBe(true);
    expect(c.position.y).toBeCloseTo(0, 6);
  });
});

describe('a sidle entered from its side, and a mantle onto a shallow ledge', () => {
  // A fissure x 0..6, 0.6 m wide (z -0.3..0.3), closed at both ends, its box covering it; a walking passage meets it
  // from the -Z side at x 2.5..3.7.
  const pocket = () => [
    box(-1, 0, -3, 2.5, 3, -0.3),
    box(3.7, 0, -3, 7, 3, -0.3),
    box(-1, 0, 0.3, 7, 3, 3),
    box(-1, 0, -0.3, 0, 3, 0.3),
    box(6, 0, -0.3, 7, 3, 0.3),
  ];
  const pocketZone = () => zone('sidle', [3, 1, 0], [6, 2, 0.6]);
  const IN: Wish = { x: 0, z: 1, run: false, yaw: Math.PI };
  const OUT: Wish = { x: 0, z: -1, run: false, yaw: Math.PI };

  it('a walker who came in through a side opening backs out the way it came and walks again', () => {
    const c = new Controller(world(...pocket()), {}, [pocketZone()]);
    c.place(new Vector3(3.1, 0, -2));
    run(c, 4, IN, 1 / 60, () => c.mode === 'sidle');
    expect(c.mode).toBe('sidle');
    run(c, 1, IN);
    const z = c.position.z;
    // Further in across the passage goes nowhere: only outwards is let through.
    run(c, 2, IN);
    expect(c.position.z).toBeCloseTo(z, 4);
    run(c, 6, OUT, 1 / 60, () => c.mode === 'walk');
    expect(c.mode).toBe('walk');
    expect(c.viewHold).toBeNull();
    run(c, 1, OUT);
    expect(c.position.z).toBeLessThan(-0.6);
    expect(c.bodyRadius).toBe(WALK.radius);
  });

  it('arriving in a fissure, input across it does not move the walker; a box narrower than it keeps the sidle', () => {
    const c = new Controller(world(...fissure()), {}, [fissureZone()]);
    expect(c.place(new Vector3(2.5, 0, -0.02), { mode: 'sidle', yaw: 0 })).toBe('sidle');
    run(c, 2, NORTH);
    expectAt(c.position, [2.5, 0, -0.02]);
    expect(c.mode).toBe('sidle');

    // A box 0.02 m wide at z 0.03; the +Z wall steps 0.05 m in at x 2.5 and pushes the walker off the box, to where
    // the walking body does not fit, so it sidles on to the far end.
    const jog = [box(0, 0, -3, 5, 3, -0.225), box(0, 0, 0.225, 2.5, 3, 3), box(2.5, 0, 0.175, 5, 3, 3)];
    const narrow = new Controller(world(...jog), {}, [zone('sidle', [2.5, 0.9, 0.03], [5.4, 2.2, 0.02])]);
    narrow.place(new Vector3(-1, 0, 0.03));
    let off = 0;
    let walked = false;
    run(narrow, 20, EAST, 1 / 60, () => {
      const { x, z } = narrow.position;
      if (x > 0 && x < 5) {
        off = Math.min(off, z);
        walked ||= narrow.mode !== 'sidle';
      }
      return x > 6;
    });
    expect(off).toBeLessThan(0.03 - 0.01 - TRAVERSE.edge);
    expect(walked).toBe(false);
    expect(narrow.mode).toBe('walk');
  });

  it('walking into a fissure mouth holding W, the turned view does not slide the walker along the rock face', () => {
    // As main.ts does it: keys relative to the camera, which turns to face a wall once the sidle starts.
    for (const z0 of [0.1, -0.1, 0.03, -0.03]) {
      const c = new Controller(world(...fissure()), {}, [fissureZone()]);
      c.place(new Vector3(-2, 0, z0));
      const turn = new ViewTurn();
      let yaw = EAST_YAW;
      let widest = 0;
      for (let i = 0; i < 60 * 8; i++) {
        yaw = turn.apply(yaw, c.viewHold, 1 / 60);
        c.update(1 / 60, wishFromInput(1, 0, yaw, false));
        widest = Math.max(widest, Math.abs(c.position.z));
      }
      expect(c.mode).toBe('sidle');
      expect(widest).toBeLessThan(0.225);
      // Strafing the way that goes east takes it through.
      const s = wishFromInput(0, 1, yaw, false).x > 0 ? 1 : -1;
      for (let i = 0; i < 60 * 15; i++) {
        yaw = turn.apply(yaw, c.viewHold, 1 / 60);
        c.update(1 / 60, wishFromInput(0, s, yaw, false));
      }
      expect(c.position.x).toBeGreaterThan(5.2);
      expect(c.mode).toBe('walk');
    }
  });

  it('a fissure at 45 degrees is taken with a diagonal stick, at 60 and at 6 fps', () => {
    const t = Math.PI / 4;
    const ax = new Vector3(1, 0, 0).applyAxisAngle(new Vector3(0, 1, 0), t);
    // A fissure x 0..6 with a box exactly as long and wide, turned 45 degrees.
    const walls = [box(0, 0, -3, 6, 3, -0.225), box(0, 0, 0.225, 6, 3, 3)];
    walls.forEach((g) => g.rotateY(t));
    for (const fps of [60, 6]) {
      const c = new Controller(world(...walls), {}, [
        zone('sidle', [3 * ax.x, 1, 3 * ax.z], [6, 2, 0.45], t),
      ]);
      c.place(new Vector3(-ax.x, 0, -ax.z));
      const turn = new ViewTurn();
      let yaw = Math.atan2(-ax.x, -ax.z);
      const keys = (forward: number, strafe: number, seconds: number) => {
        for (let i = 0; i < seconds * fps; i++) {
          yaw = turn.apply(yaw, c.viewHold, 1 / fps);
          c.update(1 / fps, wishFromInput(forward, strafe, yaw, false));
        }
      };
      keys(1, 0.3, 4);
      keys(0.7, 0.7, 20);
      expect(c.position.dot(ax)).toBeGreaterThan(6.3);
      expect(c.mode).toBe('walk');
    }
  });

  it('a sidle along a ledge over a drop: input away from the rock does not step off it', () => {
    // A ledge 0.5 m wide (z -0.25..0.25) along rock on -Z, a 10 m drop on +Z.
    const geo = [box(-2, -0.2, -3, 9, 0, 0.25), box(-2, 0, -3, 9, 3, -0.25), box(-2, -10.2, -3, 9, -10, 6)];
    const merged = mergeGeometries(geo);
    if (!merged) throw new Error('merge failed');
    const c = new Controller(new BvhCollider(merged), {}, [zone('sidle', [3.5, 1, 0], [5, 2, 0.5])]);
    c.place(new Vector3(-0.5, 0, 0.02));
    run(c, 3, EAST);
    run(c, 1, STILL);
    expect(c.mode).toBe('sidle');
    const at = c.position.clone();
    run(c, 4, { x: 0, z: 1, run: false, yaw: 0 });
    expectAt(c.position, at.toArray());
    expect(c.mode).toBe('sidle');
  });

  it('a mantle onto a 0.5 m shelf with rock behind it sets the feet down where the body fits, never in the rock', () => {
    // The ledge is 0.5 m deep: rock rises from x 5.5.
    const shelf = box(5.5, 4, -3, 10, 8, 3);
    for (const frame of [1 / 60, 1 / 6]) {
      const c = new Controller(world(...ledge(), shelf), {}, [faceZone()]);
      c.place(new Vector3(HOLD_X, 3, 0), { mode: 'climb' });
      run(c, 5, EAST, frame, () => c.mode !== 'climb');
      expect(c.mode).toBe('walk');
      expect(c.onGround).toBe(true);
      expect(c.position.y).toBeCloseTo(4, 6);
      expect(c.position.x).toBeCloseTo(5 + CLIMB.mantleMinReach, 6);
      run(c, 3, EAST, frame);
      expect(c.position.x + WALK.radius).toBeLessThanOrEqual(5.5 + 1e-6);
      expect(c.position.y).toBeCloseTo(4, 6);
    }
  });

  it('a mantle onto a ridge 0.5 m thick with a drop behind it lands on the ridge, not in the air', () => {
    const ridge = box(5, 0, -3, 5.5, 4, 3);
    for (const frame of [1 / 60, 1 / 6]) {
      const c = new Controller(world(ridge), {}, [faceZone()]);
      c.place(new Vector3(HOLD_X, 3, 0), { mode: 'climb' });
      run(c, 5, EAST, frame, () => c.mode !== 'climb');
      expect(c.mode).toBe('walk');
      expect(c.onGround).toBe(true);
      expect(c.position.x).toBeGreaterThanOrEqual(5 + CLIMB.mantleMinReach - 1e-6);
      // At 6 fps the rest of the frame after the mantle walks on a little.
      if (frame < 0.1) expect(c.position.x).toBeLessThanOrEqual(5.5 + TRAVERSE.edge);
      run(c, 2, STILL, frame);
      expect(c.onGround).toBe(true);
      expect(c.position.y).toBeCloseTo(4, 6);
    }
  });

  it('with no room on the ledge even to crawl, the walker hangs at the top and can still climb down', () => {
    // Rock over the ledge 0.5 m up, from the lip.
    const lid = box(5, 4.5, -3, 10, 8, 3);
    const c = new Controller(world(...ledge(), lid), {}, [faceZone()]);
    c.place(new Vector3(HOLD_X, 3, 0), { mode: 'climb' });
    run(c, 6, EAST);
    expect(c.mode).toBe('climb');
    expect(c.mantling).toBe(false);
    expect(c.position.y).toBeCloseTo(4, 6);
    expect(c.position.x).toBeCloseTo(HOLD_X, 6);
    run(c, 10, BACK, 1 / 60, () => c.mode !== 'climb');
    expect(c.mode).toBe('walk');
    expect(c.onGround).toBe(true);
    expect(c.position.y).toBeCloseTo(0, 6);
  });
});
