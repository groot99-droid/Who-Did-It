// Writes test/fixtures/walk-fixture.gltf: a tiny world in the GLB contract (DECISIONS A610), built in code.
// It is a .gltf with its buffer embedded, not a .glb, because *.glb files go to Git LFS (.gitattributes) and CI
// checks out without LFS. Layout, Y up, metres:
//   - Floor: 40 x 40, top at y = 0.
//   - Building: x -4..4, z -10..-16, 3 m walls 0.3 m thick, a roof, a 1.2 m door gap at x 2..3.2 in the front wall.
//   - Stairs: 8 steps of 0.2 m rise and 0.35 m run climbing along +X from x = 6, z 3..6, onto a 1.6 m platform.
//   - HM_Collision: all of the above as one mesh.
//   - Spawn_stairs at (4.5, 0, 4.5) facing +X, then Spawn_square at (0, 0, -4) facing -Z (towards the wall).
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BoxGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'walk-fixture.gltf');

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

const chunks = [];
let byteLength = 0;
const bufferViews = [];
const accessors = [];

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

function addMesh(name, geometry, material, withNormals) {
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
  const indices = addAccessor(new Uint16Array(geometry.getIndex().array), 'SCALAR', 5123, 34963);
  return { name, primitives: [{ attributes, indices, ...(material === null ? {} : { material }) }] };
}

const meshes = [
  addMesh('Floor', floor, 0, true),
  addMesh('Building', building, 1, true),
  addMesh('Stairs', stairs, 2, true),
  addMesh('HM_Collision', collision, null, false),
];
const r = Math.SQRT1_2;
const nodes = [
  { name: 'Floor', mesh: 0 },
  { name: 'Building', mesh: 1 },
  { name: 'Stairs', mesh: 2 },
  { name: 'HM_Collision', mesh: 3 },
  { name: 'Spawn_stairs', translation: [4.5, 0, 4.5], rotation: [0, -r, 0, r] },
  { name: 'Spawn_square', translation: [0, 0, -4] },
];
const material = (name, rgb) => ({
  name,
  pbrMetallicRoughness: { baseColorFactor: [...rgb, 1], metallicFactor: 0, roughnessFactor: 0.9 },
});
const buffer = Buffer.concat(chunks);
const gltf = {
  asset: { version: '2.0', generator: 'apps/walk/scripts/make-fixture.mjs' },
  scene: 0,
  scenes: [
    {
      name: 'Fixture',
      nodes: nodes.map((_, i) => i),
      extras: { fog_color: '#8a96a8', fog_near: 20, fog_far: 80 },
    },
  ],
  nodes,
  meshes,
  materials: [
    material('Grass', [0.25, 0.4, 0.2]),
    material('Stone', [0.55, 0.52, 0.5]),
    material('Wood', [0.45, 0.3, 0.18]),
  ],
  accessors,
  bufferViews,
  buffers: [
    { byteLength: buffer.length, uri: `data:application/octet-stream;base64,${buffer.toString('base64')}` },
  ],
};
writeFileSync(out, `${JSON.stringify(gltf)}\n`);
console.log(`wrote ${out} (${(buffer.length / 1024).toFixed(1)} KiB of buffer)`);
