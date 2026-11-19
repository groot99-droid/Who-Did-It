import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Fog, Group, Mesh, Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { Controller } from '../src/physics/controller';
import { findSpawns, pickSpawn, yawFromDirection } from '../src/spawn';
import { buildWorld, collisionRoots, fogFromExtras } from '../src/world';

// three's FileLoader reports progress with ProgressEvent, which Node lacks; the fixture's buffer is a data URI.
if (!('ProgressEvent' in globalThis)) {
  (globalThis as Record<string, unknown>).ProgressEvent = class extends Event {
    constructor(type: string, init: { loaded?: number; total?: number } = {}) {
      super(type);
      Object.assign(this, { loaded: init.loaded ?? 0, total: init.total ?? 0 });
    }
  };
}

const FIXTURE = fileURLToPath(new URL('./fixtures/walk-fixture.gltf', import.meta.url));

async function loadFixture(): Promise<{ scene: Group }> {
  const json = readFileSync(FIXTURE, 'utf8');
  return new GLTFLoader().parseAsync(json, '');
}

describe('pickSpawn', () => {
  const s = (id: string) => ({ id });
  it('takes the requested spawn, else square, else the first, else none', () => {
    expect(pickSpawn([s('a'), s('square'), s('b')], 'b')?.id).toBe('b');
    expect(pickSpawn([s('a'), s('square')], 'missing')?.id).toBe('square');
    expect(pickSpawn([s('a'), s('square')])?.id).toBe('square');
    expect(pickSpawn([s('a'), s('b')])?.id).toBe('a');
    expect(pickSpawn([])).toBeNull();
  });
});

describe('yawFromDirection', () => {
  it('is 0 along -Z and -pi/2 along +X', () => {
    expect(yawFromDirection(0, -1)).toBeCloseTo(0);
    expect(yawFromDirection(1, 0)).toBeCloseTo(-Math.PI / 2);
    expect(Math.abs(yawFromDirection(0, 1))).toBeCloseTo(Math.PI);
  });
});

describe('the fixture world', () => {
  it('has HM_Collision, hidden, and both spawns with their facing', async () => {
    const { scene } = await loadFixture();
    const world = buildWorld(scene, scene.userData);
    expect(world.collisionSource).toBe('HM_Collision');
    expect(scene.getObjectByName('HM_Collision')?.visible).toBe(false);
    expect(world.spawns.map((sp) => sp.id)).toEqual(['stairs', 'square']);
    const stairs = world.spawns[0]!;
    expect(stairs.position.toArray()).toEqual([4.5, 0, 4.5]);
    expect(stairs.yaw).toBeCloseTo(-Math.PI / 2);
    expect(pickSpawn(world.spawns)?.id).toBe('square');
    expect(world.hasLights).toBe(false);
    expect(world.fog).toBeInstanceOf(Fog);
  });

  it('stops the walker at the building wall in front of Spawn_square', async () => {
    const { scene } = await loadFixture();
    const world = buildWorld(scene, scene.userData);
    const c = new Controller(world.collider);
    c.place(new Vector3(0, 0, -4));
    for (let t = 0; t < 8; t += 1 / 60) c.update(1 / 60, { x: 0, z: -1, run: true });
    expect(c.position.z).toBeCloseTo(-10 + 0.3, 1);
    expect(c.position.y).toBeCloseTo(0, 5);
  });

  it('walks in through the door gap', async () => {
    const { scene } = await loadFixture();
    const world = buildWorld(scene, scene.userData);
    const c = new Controller(world.collider);
    c.place(new Vector3(2.6, 0, -8));
    for (let t = 0; t < 4; t += 1 / 60) c.update(1 / 60, { x: 0, z: -1, run: false });
    expect(c.position.z).toBeLessThan(-12);
  });
});

describe('collisionRoots', () => {
  it('falls back to every mesh when there is no HM_Collision', () => {
    const root = new Object3D();
    root.add(new Mesh(), new Mesh());
    const { roots, source } = collisionRoots(root);
    expect(source).toBe('all meshes');
    expect(roots).toHaveLength(2);
  });
});

describe('fogFromExtras', () => {
  it('reads linear and exponential fog, and nothing without a colour', () => {
    expect(fogFromExtras({ fog_color: '#ff0000', fog_near: 1, fog_far: 9 })).toMatchObject({
      near: 1,
      far: 9,
    });
    expect(fogFromExtras({ fog_color: [0, 0, 1], fog_density: 0.02 })).toMatchObject({ density: 0.02 });
    expect(fogFromExtras({ fog_near: 1 })).toBeNull();
    expect(fogFromExtras(undefined)).toBeNull();
  });
});

it('finds no spawns in an empty scene', () => {
  expect(findSpawns(new Object3D())).toEqual([]);
});
