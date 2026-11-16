// Writes test/fixtures/walk-fixture.gltf: a tiny world in the GLB contract (DECISIONS A610), built in code.
// It is a .gltf with its buffer embedded, not a .glb, because *.glb files go to Git LFS (.gitattributes) and CI
// checks out without LFS. Layout, Y up, metres:
//   - Floor: 40 x 40, top at y = 0.
//   - Building: x -4..4, z -10..-16, 3 m walls 0.3 m thick, a roof, a 1.2 m door gap at x 2..3.2 in the front wall.
//   - Stairs: 8 steps of 0.2 m rise and 0.35 m run climbing along +X from x = 6, z 3..6, onto a 1.6 m platform.
//   - HM_Collision: all of the above as one mesh.
//   - Spawn_stairs at (4.5, 0, 4.5) facing +X, then Spawn_square at (0, 0, -4) facing -Z (towards the wall).
// It also writes test/fixtures/walk-rooms.gltf, the rooms contract on two areas and a portal pair:
//   - Area_village at the origin: a 20 x 20 floor; Spawn_square at (0, 0, 0) facing -Z; Portal_widow_door at
//     (0, 0, -5) to widow_bedroom/door; Spawn_overworld_widow_door at (0, 0, -3) facing +Z, away from the door.
//   - Area_room_widow_bedroom at (3000, 0, 0), wdi_indoor, wdi_exposure 1.5, fog extras: a 6 x 6 room with 3 m walls
//     (HM_Collision_room_widow_bedroom); Spawn_widow_bedroom_door at (3000, 0, 1.5) facing -Z, into the room;
//     Portal_widow_bedroom_out at (3000, 0, 2.8) to overworld/widow_door; a lamp mesh with wdi_cast_shadow false.
//     Baked like the v1.2 rooms (wdi_baked): the room is KHR_materials_unlit with a COLOR_0 of 0.5 grey, and the
//     room still holds a live KHR_lights_punctual lamp. Portal_wb.door at (3000, 0, -1.2), ahead of the spawn, leads to widow_parlour,
//     which is not in the file (a door with no target).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BoxGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures');

/** A box from its min and max corners. */
function box(x0, y0, z0, x1, y1, z1) {
  const g = new BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

const floor = box(-20, -0.2, -20, 20, 0, 20);
const building = mergeGeometries([
  box(-4, 0, -10.3, 2, 3, -10), // front wall, left of the door
  box(3.2, 0, -10.3, 4, 3, -10), // front wall, right of the door
  box(2, 2.2, -10.3, 3.2, 3, -10), // lintel
  box(-4, 0, -16, 4, 3, -15.7), // back wall
  box(-4, 0, -16, -3.7, 3, -10), // left wall
  box(3.7, 0, -16, 4, 3, -10), // right wall
  box(-4, 3, -16, 4, 3.2, -10), // roof
]);
const steps = [];
for (let i = 0; i < 8; i++) steps.push(box(6 + i * 0.35, 0, 3, 6 + (i + 1) * 0.35, (i + 1) * 0.2, 6));
steps.push(box(8.8, 0, 3, 12, 1.6, 6));
const stairs = mergeGeometries(steps);
const collision = mergeGeometries([floor, building, stairs].map((g) => g.clone().deleteAttribute('uv')));

let chunks, byteLength, bufferViews, accessors;

function addAccessor(array, type, componentType, target, minMax) {
  const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  const pad = (4 - (byteLength % 4)) % 4;
  if (pad) chunks.push(Buffer.alloc(pad));
  byteLength += pad;
  bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, target });
  chunks.push(bytes);
  byteLength += bytes.length;
  const count = array.length / (type === 'VEC3' ? 3 : 1);
  accessors.push({ bufferView: bufferViews.length - 1, componentType, count, type, ...minMax });
  return accessors.length - 1;
}

function addMesh(name, geometry, material, withNormals, color) {
  const pos = geometry.getAttribute('position');
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const attributes = {
    POSITION: addAccessor(new Float32Array(pos.array), 'VEC3', 5126, 34962, {
      min: [min.x, min.y, min.z],
      max: [max.x, max.y, max.z],
    }),
  };
  if (withNormals) {
    attributes.NORMAL = addAccessor(
      new Float32Array(geometry.getAttribute('normal').array),
      'VEC3',
      5126,
      34962,
    );
  }
  if (color) {
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) colors.set(color, i * 3);
    attributes.COLOR_0 = addAccessor(colors, 'VEC3', 5126, 34962);
  }
  const indices = addAccessor(new Uint16Array(geometry.getIndex().array), 'SCALAR', 5123, 34963);
  return { name, primitives: [{ attributes, indices, ...(material === null ? {} : { material }) }] };
}

const material = (name, rgb) => ({
  name,
  pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: 0, roughnessFactor: 0.9 },
});
const MATERIALS = [
  material('Grass', [0.25, 0.4, 0.2]),
  material('Stone', [0.55, 0.52, 0.5]),
  material('Wood', [0.45, 0.3, 0.18]),
];

function write(file, build, sceneName, sceneExtras) {
  chunks = [];
  byteLength = 0;
  bufferViews = [];
  accessors = [];
  const { meshes, nodes, roots, materials, ...rest } = build();
  const buffer = Buffer.concat(chunks);
  const gltf = {
    asset: { version: '2.0', generator: 'apps/walk/scripts/make-fixture.mjs' },
    scene: 0,
    scenes: [
      {
        name: sceneName,
        nodes: roots ?? nodes.map((_, i) => i),
        ...(sceneExtras ? { extras: sceneExtras } : {}),
      },
    ],
    nodes,
    meshes,
    materials: materials ?? MATERIALS,
    ...rest,
    accessors,
    bufferViews,
    buffers: [
      { byteLength: buffer.length, uri: `data:application/octet-stream;base64,${buffer.toString('base64')}` },
    ],
  };
  const out = join(fixtures, file);
  writeFileSync(out, `${JSON.stringify(gltf)}\n`);
  console.log(`wrote ${out} (${(buffer.length / 1024).toFixed(1)} KiB of buffer)`);
}

const r = Math.SQRT1_2;

write(
  'walk-fixture.gltf',
  () => ({
    meshes: [
      addMesh('Floor', floor, 0, true),
      addMesh('Building', building, 1, true),
      addMesh('Stairs', stairs, 2, true),
      addMesh('HM_Collision', collision, null, false),
    ],
    nodes: [
      { name: 'Floor', mesh: 0 },
      { name: 'Building', mesh: 1 },
      { name: 'Stairs', mesh: 2 },
      { name: 'HM_Collision', mesh: 3 },
      { name: 'Spawn_stairs', translation: [4.5, 0, 4.5], rotation: [0, -r, 0, r] },
      { name: 'Spawn_square', translation: [0, 0, -4] },
    ],
  }),
  'Fixture',
  { fog_color: '#8a96a8', fog_near: 20, fog_far: 80 },
);

const RX = 3000;
const villageFloor = box(-10, -0.2, -10, 10, 0, 10);
const room = mergeGeometries([
  box(RX - 3, -0.2, -3, RX + 3, 0, 3), // floor
  box(RX - 3, 0, -3.3, RX + 3, 3, -3), // north wall
  box(RX - 3, 0, 3, RX + 3, 3, 3.3), // south wall, behind the door
  box(RX - 3.3, 0, -3, RX - 3, 3, 3), // west wall
  box(RX + 3, 0, -3, RX + 3.3, 3, 3), // east wall
  box(RX - 3, 3, -3.3, RX + 3, 3.2, 3.3), // ceiling
]);
const lamp = box(RX - 0.1, 2.4, -0.1, RX + 0.1, 2.6, 0.1);
const plain = (g) => g.clone().deleteAttribute('uv');

write(
  'walk-rooms.gltf',
  () => ({
    meshes: [
      addMesh('Village floor', villageFloor, 0, true),
      addMesh('Room', room, 3, true, [0.5, 0.5, 0.5]),
      addMesh('Lamp', lamp, 2, true),
      addMesh('HM_Collision', plain(villageFloor), null, false),
      addMesh('HM_Collision_room_widow_bedroom', plain(room), null, false),
    ],
    nodes: [
      { name: 'Area_village', children: [1, 2, 3, 4], extras: { wdi_exposure: 2.38 } },
      { name: 'Village floor', mesh: 0 },
      {
        name: 'Spawn_square',
        translation: [0, 0, 0],
        extras: { wdi_spawn: 'square', wdi_district: 'village' },
      },
      {
        name: 'Spawn_overworld_widow_door',
        translation: [0, 0, -3],
        rotation: [0, 1, 0, 0],
        extras: { wdi_spawn: 'widow_door', wdi_district: 'village' },
      },
      {
        name: 'Portal_widow_door',
        translation: [0, 0, -5],
        extras: { to: 'widow_bedroom', toSpawn: 'door', kind: 'door' },
      },
      {
        name: 'Area_room_widow_bedroom',
        translation: [RX, 0, 0],
        children: [6, 7, 8, 9, 12, 13],
        extras: {
          wdi_indoor: true,
          wdi_baked: true,
          wdi_exposure: 1.5,
          fog_color: '#101010',
          fog_density: 0.01,
        },
      },
      { name: 'Room', mesh: 1, translation: [-RX, 0, 0] },
      { name: 'Lamp', mesh: 2, translation: [-RX, 0, 0], extras: { wdi_cast_shadow: false } },
      {
        name: 'Spawn_widow_bedroom_door',
        translation: [0, 0, 1.5],
        extras: { wdi_spawn: 'door', wdi_district: 'widow_bedroom' },
      },
      {
        name: 'Portal_widow_bedroom_out',
        translation: [0, 0, 2.8],
        extras: { to: 'overworld', toSpawn: 'widow_door', kind: 'door' },
      },
      { name: 'HM_Collision', mesh: 3 },
      { name: 'HM_Collision_room_widow_bedroom', mesh: 4 },
      { name: 'Lamp_light', translation: [0, 2.3, 0], extensions: { KHR_lights_punctual: { light: 0 } } },
      {
        name: 'Portal_wb.door',
        translation: [0, 0, -1.2],
        extras: { to: 'widow_parlour', toSpawn: 'bedroom', kind: 'door' },
      },
    ],
    roots: [0, 5, 10, 11],
    materials: [
      ...MATERIALS,
      {
        name: 'Baked',
        pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] },
        extensions: { KHR_materials_unlit: {} },
      },
    ],
    extensionsUsed: ['KHR_materials_unlit', 'KHR_lights_punctual'],
    extensions: {
      KHR_lights_punctual: {
        lights: [{ name: 'Lamp', type: 'point', color: [1, 0.6, 0.3], intensity: 20, range: 6 }],
      },
    },
  }),
  'Rooms fixture',
);
