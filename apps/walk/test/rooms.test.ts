import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FogExp2, Group, Light, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { Controller } from '../src/physics/controller';
import { PortalTrigger, resolvePortal, type Portal } from '../src/portals';
import { areaLook, buildWorld, nearestArea } from '../src/world';

// The rooms contract on test/fixtures/walk-rooms.gltf (scripts/make-fixture.mjs): Area_village and
// Area_room_widow_bedroom 3,000 m apart, a portal pair between them.

if (!('ProgressEvent' in globalThis)) {
  (globalThis as Record<string, unknown>).ProgressEvent = class extends Event {
    constructor(type: string, init: { loaded?: number; total?: number } = {}) {
      super(type);
      Object.assign(this, { loaded: init.loaded ?? 0, total: init.total ?? 0 });
    }
  };
}

const ROOMS = fileURLToPath(new URL('./fixtures/walk-rooms.gltf', import.meta.url));

async function rooms() {
  const { scene } = (await new GLTFLoader().parseAsync(readFileSync(ROOMS, 'utf8'), '')) as { scene: Group };
  return buildWorld(scene, scene.userData);
}

describe('the rooms fixture', () => {
  it('has both areas, both collision meshes hidden, the portals and the grouped spawns', async () => {
    const w = await rooms();
    expect(w.areas.map((a) => a.name)).toEqual(['Area_village', 'Area_room_widow_bedroom']);
    expect(w.collisionSource).toBe('HM_Collision');
    expect(w.root.getObjectByName('HM_Collision')?.visible).toBe(false);
    expect(w.root.getObjectByName('HM_Collision_room_widow_bedroom')?.visible).toBe(false);
    expect(w.portals.map((p) => [p.id, p.to, p.toSpawn])).toEqual([
      ['widow_door', 'widow_bedroom', 'door'],
      ['widow_bedroom_out', 'overworld', 'widow_door'],
      ['wbdoor', 'widow_parlour', 'bedroom'],
    ]);
    expect(w.spawns.map((s) => [s.id, s.group, s.name])).toEqual([
      ['square', 'Village', 'Square'],
      ['overworld_widow_door', 'Village', 'Widow door'],
      ['widow_bedroom_door', 'Widow bedroom', 'Door'],
    ]);
  });

  it('loads the baked room unlit with its vertex colours, and switches off its live light', async () => {
    const w = await rooms();
    const material = (w.root.getObjectByName('Room') as Mesh).material as MeshBasicMaterial;
    expect(material).toBeInstanceOf(MeshBasicMaterial);
    expect(material.vertexColors).toBe(true);
    expect(material.toneMapped).toBe(true);
    const lights: Light[] = [];
    w.root.traverse((o) => {
      if ((o as Light).isLight) lights.push(o as Light);
    });
    expect(lights).toHaveLength(1);
    expect(lights[0]!.visible).toBe(false);
    expect(areaLook(nearestArea(w.areas, 3000, 0)).baked).toBe(true);
    expect(areaLook(nearestArea(w.areas, 0, 0)).baked).toBe(false);
  });

  it('has a door with no target, which resolves to nothing', async () => {
    const w = await rooms();
    const parlour = w.portals.find((p) => p.id === 'wbdoor')!;
    expect(resolvePortal(parlour, w.spawns)).toBeNull();
  });

  it('keeps wdi_cast_shadow: false meshes from casting', async () => {
    const w = await rooms();
    expect((w.root.getObjectByName('Lamp') as Mesh).castShadow).toBe(false);
  });

  it('reads the room as indoors with its own exposure and fog, and the village as outdoors', async () => {
    const w = await rooms();
    const room = areaLook(nearestArea(w.areas, 3000, 0));
    expect(room.indoor).toBe(true);
    expect(room.exposure).toBe(1.5);
    expect(room.fog).toBeInstanceOf(FogExp2);
    const village = areaLook(nearestArea(w.areas, 0, -4));
    expect(village).toMatchObject({ indoor: false, exposure: 2.38, fog: null });
    expect(areaLook(null).indoor).toBe(false);
  });

  it('collides with the room walls', async () => {
    const w = await rooms();
    const c = new Controller(w.collider);
    c.place(new Vector3(3000, 0, 1.5));
    for (let t = 0; t < 4; t += 1 / 60) c.update(1 / 60, { x: 0, z: -1, run: true });
    expect(c.position.z).toBeCloseTo(-3 + 0.3, 1);
  });
});

describe('portals', () => {
  const portal = (to: string, toSpawn: string): Portal => ({
    id: 'p',
    position: new Vector3(),
    to,
    toSpawn,
    kind: 'door',
  });
  const spawns = [{ id: 'square' }, { id: 'overworld_widow_door' }, { id: 'widow_bedroom_door' }];

  it('resolve to Spawn_<to>_<toSpawn>, else Spawn_<toSpawn> as a fallback, else nothing', () => {
    expect(resolvePortal(portal('widow_bedroom', 'door'), spawns)).toEqual({
      spawn: { id: 'widow_bedroom_door' },
      fallback: false,
    });
    expect(resolvePortal(portal('overworld', 'square'), spawns)).toEqual({
      spawn: { id: 'square' },
      fallback: true,
    });
    expect(resolvePortal(portal('cellar', 'stairs'), spawns)).toBeNull();
  });

  it('fire on walking in, only once the player has been outside since the last trip, and on use nearby', () => {
    const p = { ...portal('x', 'y'), position: new Vector3(0, 0, -5) };
    const t = new PortalTrigger([p]);
    t.disarm();
    expect(t.update(new Vector3(0, 0, -4.5), false)).toBeNull(); // arrived inside: not armed yet
    expect(t.update(new Vector3(0, 0, -3), false)).toBeNull(); // walked out: armed
    expect(t.update(new Vector3(0, 0, -4.2), false)).toBe(p); // walked in
    expect(t.update(new Vector3(0, 0, -4.2), false)).toBeNull(); // once
    expect(t.update(new Vector3(0, 0, -3.5), true)).toBe(p); // use within 2 m
    expect(t.update(new Vector3(0, 0, -2), true)).toBeNull(); // too far to use
    expect(t.update(new Vector3(0, 5, -5), false)).toBeNull(); // another floor
  });

  it('take the walker from the square through the widow door', async () => {
    const w = await rooms();
    const c = new Controller(w.collider);
    const t = new PortalTrigger(w.portals);
    c.place(w.spawns[0]!.position);
    t.disarm();
    let taken: Portal | null = null;
    for (let s = 0; s < 6 && !taken; s += 1 / 60) {
      c.update(1 / 60, { x: 0, z: -1, run: false });
      taken = t.update(c.position, false);
    }
    expect(taken?.id).toBe('widow_door');
    expect(c.position.z).toBeLessThanOrEqual(-4);
    expect(resolvePortal(taken!, w.spawns)?.spawn.id).toBe('widow_bedroom_door');
  });
});
