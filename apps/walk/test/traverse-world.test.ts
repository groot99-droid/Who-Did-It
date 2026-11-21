import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Group, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { CLIMB, CRAWL, SIDLE, TRAVERSE, WALK } from '../src/config';
import { Controller, wishFromInput, type Wish } from '../src/physics/controller';
import { ViewTurn, wrapAngle } from '../src/traverse';
import { buildWorld, type World } from '../src/world';

// The traversal zones on test/fixtures/walk-traverse.gltf (scripts/make-fixture.mjs): rooms A, B and C in a row along
// +X, joined by a crawl tunnel 1.0 m high (x -2..4), a sidle fissure 0.45 m wide (x 10..15) and a climb face 4 m high
// (x = 21) onto a ledge.

if (!('ProgressEvent' in globalThis)) {
  (globalThis as Record<string, unknown>).ProgressEvent = class extends Event {
    constructor(type: string, init: { loaded?: number; total?: number } = {}) {
      super(type);
      Object.assign(this, { loaded: init.loaded ?? 0, total: init.total ?? 0 });
    }
  };
}

async function load(name: string): Promise<World> {
  const file = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  const { scene } = (await new GLTFLoader().parseAsync(readFileSync(file, 'utf8'), '')) as { scene: Group };
  return buildWorld(scene, scene.userData);
}

let w: World;
beforeAll(async () => {
  w = await load('walk-traverse.gltf');
});

const EAST: Wish = { x: 1, z: 0, run: false, yaw: -Math.PI / 2 };
const WEST: Wish = { x: -1, z: 0, run: false, yaw: Math.PI / 2 };
/** S (back) looking west, away from the climb face: on the face it goes down. */
const BACK_AWAY: Wish = { x: 1, z: 0, run: false, yaw: Math.PI / 2 };

/** A walker at a spawn as main.ts's goTo puts it there; without zones when `zones` is false. */
function at(id: string, zones = true): Controller {
  const spawn = w.spawns.find((s) => s.id === id);
  if (!spawn) throw new Error(`no Spawn_${id}`);
  const c = new Controller(w.collider, {}, zones ? w.zones : []);
  c.place(spawn.position, { mode: w.spawnModes.get(id), yaw: spawn.yaw });
  return c;
}

/** Runs whole frames for `seconds`, or until `stop` holds after one. */
function run(c: Controller, seconds: number, wish: Wish, stop?: () => boolean, frame = 1 / 60): void {
  for (let i = 0; i < Math.round(seconds / frame); i++) {
    c.update(frame, wish);
    if (stop?.()) return;
  }
}

describe('the traverse fixture', () => {
  it('has the three zones, the spawns and the modes they arrive in', () => {
    expect(w.collisionSource).toBe('HM_Collision');
    expect(w.zones.map((z) => [z.id, z.kind])).toEqual([
      ['tunnel', 'crawl'],
      ['fissure', 'sidle'],
      ['face', 'climb'],
    ]);
    const [tunnel, , face] = w.zones;
    expect(tunnel!.origin.toArray()).toEqual([1, 0.4, 0]);
    expect(tunnel!.half.toArray().map((n) => +n.toFixed(6))).toEqual([3.2, 0.6, 0.6]);
    expect(face!.axisZ.x).toBeCloseTo(-1, 9);
    expect(w.spawns.map((s) => s.id)).toEqual([
      'start',
      'tunnel',
      'hall',
      'fissure',
      'wall',
      'face',
      'ledge',
    ]);
    expect(new Set(w.spawns.map((s) => s.group))).toEqual(new Set(['Cave']));
    expect([...w.spawnModes]).toEqual([
      ['tunnel', 'crawl'],
      ['fissure', 'sidle'],
      ['face', 'climb'],
    ]);
  });

  it('the files without Trav_ nodes have no zones and no arrival modes', async () => {
    for (const name of ['walk-fixture.gltf', 'walk-rooms.gltf']) {
      const other = await load(name);
      expect(other.zones).toEqual([]);
      expect(other.spawnModes.size).toBe(0);
    }
  });
});

describe('through the fixture', () => {
  it('the 1.0 m tunnel stops a walker, and its zone takes the walker through crawling', () => {
    const walker = at('start', false);
    run(walker, 6, EAST);
    expect(walker.position.x).toBeCloseTo(-2 - WALK.radius, 2);
    expect(walker.mode).toBe('walk');

    const c = at('start');
    let underRoof = 0;
    let highest = 0;
    run(c, 30, EAST, () => {
      if (c.position.x > -2 && c.position.x < 4) {
        underRoof++;
        expect(c.mode).toBe('crawl');
        highest = Math.max(highest, c.position.y + Math.max(c.bodyTop, c.eyeHeight));
      }
      return c.position.x > 5;
    });
    expect(underRoof).toBeGreaterThan(0);
    expect(highest).toBeLessThanOrEqual(1);
    expect(c.mode).toBe('walk');
    expect(c.position.x).toBeGreaterThan(5);
    expect(c.position.y).toBeCloseTo(0, 6);
  });

  it('the 0.45 m fissure stops a walker, and its zone takes the walker through sideways, only along it', () => {
    const walker = at('hall', false);
    run(walker, 6, EAST);
    expect(walker.position.x).toBeGreaterThan(9.7);
    expect(walker.position.x).toBeLessThan(9.85);

    const c = at('hall');
    run(c, 30, EAST, () => {
      if (c.position.x > 10 && c.position.x < 15) {
        expect(c.mode).toBe('sidle');
        expect(Math.abs(c.position.z)).toBeLessThanOrEqual(0.225 - SIDLE.radius + 1e-6);
      }
      return c.position.x > 16;
    });
    expect(c.mode).toBe('walk');

    const inside = at('fissure');
    expect(inside.mode).toBe('sidle');
    run(inside, 2, { x: 0, z: 1, run: true, yaw: Math.PI });
    expect(inside.position.x).toBeCloseTo(12.5, 6);
    expect(inside.position.z).toBeCloseTo(0, 6);
  });

  it('the 4 m face stops a walker; its zone climbs the walker onto the ledge by the mantle and back down', () => {
    const walker = at('wall', false);
    run(walker, 6, EAST);
    expect(walker.position.x).toBeCloseTo(21 - WALK.radius, 2);

    const c = at('wall');
    run(c, 6, EAST, () => c.mode === 'climb');
    expect(c.mode).toBe('climb');
    let mantled = false;
    run(c, 15, EAST, () => {
      mantled ||= c.mantling;
      return c.mode === 'walk';
    });
    expect(mantled).toBe(true);
    expect(c.onGround).toBe(true);
    // Set down 0.8 m beyond the face; the rest of that frame already walks on.
    expect(c.position.x).toBeCloseTo(21 + CLIMB.mantleReach, 2);
    expect(c.position.y).toBeCloseTo(4, 6);

    run(c, 5, WEST, () => c.mode === 'climb');
    expect(c.mode).toBe('climb');
    expect(c.position.y).toBeGreaterThan(4 - CLIMB.catchBand);
    run(c, 15, BACK_AWAY, () => c.mode === 'walk');
    expect(c.mode).toBe('walk');
    expect(c.onGround).toBe(true);
    expect(c.position.y).toBeCloseTo(0, 6);
    expect(c.position.x).toBeCloseTo(21 - CLIMB.hold, 2);
  });

  it('a walker stepping off the ledge is caught by the climb zone and never falls', () => {
    const c = at('ledge');
    expect(c.position.y).toBeCloseTo(4, 6);
    let lowest = 4;
    run(c, 6, WEST, () => {
      lowest = Math.min(lowest, c.position.y);
      return c.mode === 'climb';
    });
    expect(c.mode).toBe('climb');
    run(c, 3, { x: 0, z: 0, run: false }, () => ((lowest = Math.min(lowest, c.position.y)), false));
    expect(lowest).toBeGreaterThan(4 - CLIMB.catchBand);
  });

  it('a spawn with wdi_mode starts in that mode; the others walk', () => {
    const crawl = at('tunnel');
    expect(crawl.mode).toBe('crawl');
    expect(crawl.eyeHeight).toBe(CRAWL.eyeHeight);
    expect(crawl.position.toArray().map((n) => +n.toFixed(6))).toEqual([1, 0, 0]);
    const sidle = at('fissure');
    expect(sidle.mode).toBe('sidle');
    expect(sidle.viewHold).not.toBeNull();
    const climb = at('face');
    expect(climb.mode).toBe('climb');
    expect(climb.position.distanceTo(new Vector3(21 - CLIMB.hold, 1, 0))).toBeLessThan(1e-6);
    for (const id of ['start', 'hall', 'wall', 'ledge']) expect(at(id).mode).toBe('walk');
  });

  it('takes a walker steered as the viewer steers it from room A through all three onto the ledge', () => {
    // main.ts's loop: the view hold turns the yaw, the input is seen from the yaw. The player holds W; once the
    // fissure has turned the view to its wall, the strafe key that goes east, which walks on to the climb face and
    // hangs on it; there W again climbs, whichever way the view faces.
    const c = at('start');
    const turn = new ViewTurn();
    let yaw = turn.snap(w.spawns[0]!.yaw, c.viewHold);
    let forward = 1;
    let strafe = 0;
    const modes: string[] = [c.mode];
    const frame = 1 / 30;
    for (let i = 0; i < 30 * 120; i++) {
      yaw = turn.apply(yaw, c.viewHold, frame);
      const hold = c.viewHold;
      if (hold) forward = 0;
      if (c.mode === 'climb') [forward, strafe] = [1, 0];
      if (hold && strafe === 0 && Math.abs(wrapAngle(hold.yaw - yaw)) < 1e-6)
        strafe = Math.sign(Math.cos(yaw));
      c.update(frame, wishFromInput(forward, strafe, yaw, false));
      if (modes[modes.length - 1] !== c.mode) modes.push(c.mode);
      if (c.mode === 'walk' && c.position.y > 3.9) break;
    }
    expect(modes).toEqual(['walk', 'crawl', 'walk', 'sidle', 'walk', 'climb', 'walk']);
    expect(c.onGround).toBe(true);
    expect(c.position.y).toBeCloseTo(4, 6);
    expect(c.position.x).toBeGreaterThan(21 + CLIMB.mantleReach - TRAVERSE.edge);
  });
});
