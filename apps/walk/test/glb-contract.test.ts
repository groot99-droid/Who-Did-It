import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
} from 'three';
import { describe, expect, it } from 'vitest';
import final from '../../../tools/blender/meshy_looks/final.json';
import { BvhCollider, mergeWorldGeometry } from '../src/physics/collider';
import { DEFAULT_EXPOSURE, defaultFog, defaultLights, exposureFromScene, lookDirection } from '../src/look';
import { findSpawns, spawnLabel } from '../src/spawn';
import { findAreas, nearestArea, showNearestArea } from '../src/world';

// What the real hollowmere_walk.glb carries (apps/walk/README.md, "The GLB contract"), on small stand-ins.

describe('spawn labels', () => {
  it('uses plain words from wdi_spawn and wdi_district, else the id', () => {
    expect(spawnLabel('station_street')).toBe('Station street');
    expect(spawnLabel('mill', { wdi_spawn: 'mill', wdi_district: 'Village' })).toBe('Mill (Village)');
    expect(spawnLabel('square', { wdi_district: 'square' })).toBe('Square');
    expect(spawnLabel('x', { wdi_spawn: 'Mass chapel' })).toBe('Mass chapel');
  });

  it('reads them off the Spawn_ empties', () => {
    const root = new Object3D();
    const e = new Object3D();
    e.name = 'Spawn_east_hills';
    e.userData = { wdi_spawn: 'east_hills', wdi_district: 'outskirts', wdi_facing_deg: 0 };
    root.add(e);
    expect(findSpawns(root)[0]?.label).toBe('East hills (Outskirts)');
  });
});

describe('areas', () => {
  const root = new Group();
  const place = (name: string, x: number, z: number) => {
    const a = new Group();
    a.name = name;
    a.position.set(x, 0, z);
    a.add(new Object3D());
    root.add(a);
    return a;
  };
  const village = place('Area_village', 0, 0);
  const gallows = place('Area_gallows_wood', 0, -900);
  const seaDoor = place('Area_sea_door', 900, -1800);

  it('finds every Area_ and shows only the one the player is in', () => {
    expect(findAreas(root)).toEqual([village, gallows, seaDoor]);
    expect(nearestArea(findAreas(root), 52, -104)).toBe(village); // up_the_line
    showNearestArea(findAreas(root), 10, -880);
    expect([village.visible, gallows.visible, seaDoor.visible]).toEqual([false, true, false]);
    showNearestArea(findAreas(root), 163.4, -0.45); // trestle
    expect([village.visible, gallows.visible, seaDoor.visible]).toEqual([true, false, false]);
  });
});

describe('the look from final.json', () => {
  it('turns Blender stops into three exposure, 1.25 stops being 2.38', () => {
    expect(DEFAULT_EXPOSURE).toBeCloseTo(2.38, 2);
  });

  it('reads the exposure from Area_village extras before the default', () => {
    const root = new Object3D();
    const village = new Object3D();
    village.name = 'Area_village';
    root.add(village);
    expect(exposureFromScene(root)).toBeNull();
    village.userData = { wdi_exposure: 2.1 };
    expect(exposureFromScene(root)).toBe(2.1);
  });

  it('maps Blender azimuths (0 east, 90 north) into three (east +X, north -Z)', () => {
    const east = lookDirection(0, 0);
    const north = lookDirection(90, 0);
    expect([east.x, east.y, east.z].map((n) => Math.round(n) + 0)).toEqual([1, 0, 0]);
    expect([north.x, north.y, north.z].map((n) => Math.round(n) + 0)).toEqual([0, 0, -1]);
    expect(lookDirection(0, 90).y).toBeCloseTo(1);
  });

  it('gives fog at the look density and a moon at the look energy', () => {
    expect(defaultFog().density).toBe(final.fog.density);
    const [moon] = defaultLights();
    expect((moon as unknown as { intensity: number }).intensity).toBe(final.moon.energy);
    expect(moon!.position.y).toBeGreaterThan(0);
  });
});

describe('collision geometry', () => {
  it('includes every instance of an instanced mesh', () => {
    const box = new BoxGeometry(1, 1, 1);
    const inst = new InstancedMesh(box, undefined, 3);
    for (let i = 0; i < 3; i++) inst.setMatrixAt(i, new Matrix4().makeTranslation(i * 10, 0, 0));
    const g = mergeWorldGeometry([inst]);
    expect(g.index!.count / 3).toBe(36);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.x).toBeCloseTo(20.5);
  });

  it('builds the BVH over a collision mesh the size of HM_Collision (about 148k triangles) quickly', () => {
    // A 272 x 272 grid of quads: 147,968 triangles over 272 m.
    const n = 272;
    const pos = new Float32Array((n + 1) * (n + 1) * 3);
    for (let z = 0; z <= n; z++)
      for (let x = 0; x <= n; x++) pos.set([x, Math.sin(x * 0.3) * 0.2, -z], (z * (n + 1) + x) * 3);
    const idx = new Uint32Array(n * n * 6);
    let k = 0;
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const a = z * (n + 1) + x;
        idx.set([a, a + 1, a + n + 1, a + 1, a + n + 2, a + n + 1], k);
        k += 6;
      }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(pos, 3));
    geometry.setIndex(new BufferAttribute(idx, 1));
    const mesh = new Mesh(geometry);
    mesh.name = 'HM_Collision';
    const t0 = performance.now();
    const collider = BvhCollider.fromObjects([mesh]);
    const ms = performance.now() - t0;
    expect(collider.geometry.index!.count / 3).toBe(147968);
    expect(ms).toBeLessThan(3000);
    expect(collider.groundBelow(100.5, 5, -100.5, 10)).not.toBeNull();
  });
});
