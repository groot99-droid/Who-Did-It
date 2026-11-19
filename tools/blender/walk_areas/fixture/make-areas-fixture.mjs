// Writes the small multi-file test world of docs/walk-areas.md (contract version 1.1; index format 1):
//   areas/walk-index.json           the index
//   areas/walk-village_west.gltf    Area_village_west   a village section (outdoors)
//   areas/walk-village_east.gltf    Area_village_east   the section east of it; the two share the seam "west_east"
//   areas/walk-room_shop.gltf       Area_room_shop      a room (indoors, baked), at its own origin
//   areas/walk-under_a.gltf         Area_under_a        a cave of the walk-only scene "undermere" (indoors, baked)
//   areas/walk-under_b.gltf         Area_under_b        the cave east of it; the two share the cave seam "a_b"
//
//   node make-areas-fixture.mjs [out folder]        default: the folder "areas" beside this script
//   MUTATE=<name> node make-areas-fixture.mjs <out>  one variant of the world (mutants.py runs every name):
//                                                    a MUTANTS name breaks one rule on purpose; a NOTED name is
//                                                    allowed and must draw a note; a VALID name must pass
//
// Plain Node, no packages. The files are .gltf with the buffer inside (text), not .glb: *.glb is stored in Git LFS in
// this repository and CI checks out without LFS. Real area files are .glb.
//
// Layout in Blender metres (x east, y north, z up). glTF is Y up and writes (x, y, z) as (x, z, -y).
//   village_west   walk region x -60..0, y -20..20. Spawn_square (-30, 0) looks east.
//                  A shop (a collision box) at x -45..-35, y 8..14 with its door on the south face:
//                  Portal_ov.shop (-40, 7.55) leads to scene "shop", spawn "door";
//                  Spawn_overworld_shop_door (-40, 6.0) looks south (the way out of the shop arrives here).
//   village_east   walk region x 0..60, y -20..20. Spawn_mill (30, 10) looks west.
//                  Portal_ov.mine (55, 0) leads to scene "mine", which is not built: the index lists it under pending.
//   seam west_east the line x = 0 between the two sections. Side a is village_west, side b is village_east.
//                  The opening is 5 m wide (y -2.5..2.5). Each file closes it with a 3 m high collision wall whose
//                  face is on the line. Three portal points a side, 1.8 m apart, 0.45 m in front of the wall:
//                  Portal_seam_west_east_a_1..3 at (-0.45, -1.8 | 0 | 1.8), Portal_seam_west_east_b_1..3 at (0.45, ...).
//                  Arrival spawns 1.65 m inside the wall: Spawn_overworld_seam_west_east_a_1..3 at (-1.65, ...) looking
//                  west, Spawn_overworld_seam_west_east_b_1..3 at (1.65, ...) looking east.
//   room_shop      a 6 x 6 m room around its own origin. Spawn_shop_door (0, -2.3) looks north, 0.5 m from
//                  Portal_shop.door (0, -2.8), which leads to scene "overworld", spawn "shop_door".
// The room's own spawn id is "shop_door" and its way out asks for "overworld" + "shop_door" = "overworld_shop_door":
// the two share the bare id on purpose. A loader that falls back to the bare id goes to the wrong spawn here.
//   the caves      under the east section, in the village frame (a cave keeps the village's coordinates): one passage
//                  2.4 m wide (y -11.2..-8.8) with its floor at z = -10 and its roof 2.6 m above the floor, cut at
//                  x = 32 into under_a (x 20..32) and under_b (x 32..44). Box collision, not compressed.
//   seam a_b       the line x = 32, a "passage". The opening is the passage, 2.4 m wide; each file closes it with a
//                  wall from the floor to the roof. Two portal points a side, 1.2 m apart, 0.45 m in front of the wall:
//                  Portal_seam_a_b_a_1..2 at (31.55, -10.6 | -9.4), Portal_seam_a_b_b_1..2 at (32.45, ...); arrivals
//                  Spawn_undermere_seam_a_b_a_1..2 at (30.35, ...) looking west, ..._b_1..2 at (33.65, ...) looking east.
//   cave mouth     "east": Portal_um.east_in (20, -12) in village_east leads to undermere + mouth_east, the spawn
//                  Spawn_undermere_mouth_east (22, -10) in under_a, which looks east, 1.5 m from Portal_um.east_out
//                  (20.5, -10), whose way back arrives at Spawn_overworld_mouth_east (20, -10.5), looking north.
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2] ?? join(here, 'areas');
const MUTATE = process.env.MUTATE ?? '';
mkdirSync(OUT, { recursive: true });

const MUTANTS = [
  'arrival_close',
  'arrival_turned',
  'lateral_shift',
  'wide_spacing',
  'single_portal',
  'room_at_slot',
  'section_offset',
  'dup_spawn',
  'typo_target',
  'no_exposure',
  'look_pop',
  'no_barrier',
  'look_drift',
  'dup_target_spawn',
  'bare_target',
  'seam_gap',
  'no_collision',
  'two_areas',
  'dup_in_file',
  // each of these is a file set that an earlier version of the checkers passed, and that goes wrong in the viewer
  'arrival_near_door',
  'spawn_near_portal',
  'door_near_seam',
  'seam_step',
  'scene_fog',
  'sun_one_side',
  'room_far_from_origin',
  'raw_name_dot',
  'light_named_like_spawn',
  'light_ghost_spawn',
  'index_target_area',
  'extension_not_listed',
  'south_wall_gone',
  'edge_gap',
  'baked_one_side',
  'polygon_odd',
  'chamfer_open',
  // the caves (contract version 1.1)
  'cave_not_indoor',
  'cave_not_baked',
  'cave_seam_open_roof',
  'cave_seam_to_overworld',
  'cave_look_differs',
  'walk_scene_is_game_scene',
  'cave_id_prefix',
  'cave_door_between_caves',
  'cave_spawn_near_portal',
  'cave_gate_to_missing_spawn',
];
// allowed worlds that must draw a note, and worlds that must pass as they are
const NOTED = ['way_back_far', 'no_way_in', 'gate_pending'];
const VALID = [
  'slope_along_seam',
  'pending_bare_id',
  'spawn_matrix',
  'polygon_flat',
  'polygon_string',
  'polygon_chamfer',
  'cave_stacked_levels',
  'cave_seam_ramp',
];
if (MUTATE && ![...MUTANTS, ...NOTED, ...VALID].includes(MUTATE)) {
  console.error(`unknown MUTATE "${MUTATE}"; known: ${[...MUTANTS, ...NOTED, ...VALID].join(', ')}`);
  process.exit(2);
}

// ---------------------------------------------------------------- a 4 x 4 PNG, so a section carries one texture
// (a viewer test can then see whether leaving an area frees its textures)
function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png4x4() {
  const w = 4,
    h = 4,
    raw = [];
  for (let y = 0; y < h; y++) {
    raw.push(0);
    for (let x = 0; x < w; x++) raw.push(...((x + y) % 2 ? [150, 160, 175] : [120, 130, 145]));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.from(raw))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- geometry: boxes, written in glTF axes

/** A box from Blender min and max corners, as a glTF-axes box [x0, y0, z0, x1, y1, z1]. */
const bbox = (x0, y0, z0, x1, y1, z1) => [x0, z0, -y1, x1, z1, -y0];

function boxesToMesh(boxes) {
  const pos = [],
    nrm = [],
    idx = [],
    uv = [];
  for (const [x0, y0, z0, x1, y1, z1] of boxes) {
    const faces = [
      [
        [1, 0, 0],
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x1, y0, z1],
      ],
      [
        [-1, 0, 0],
        [x0, y0, z1],
        [x0, y1, z1],
        [x0, y1, z0],
        [x0, y0, z0],
      ],
      [
        [0, 1, 0],
        [x0, y1, z0],
        [x0, y1, z1],
        [x1, y1, z1],
        [x1, y1, z0],
      ],
      [
        [0, -1, 0],
        [x0, y0, z1],
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
      ],
      [
        [0, 0, 1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
        [x0, y0, z1],
      ],
      [
        [0, 0, -1],
        [x0, y0, z0],
        [x0, y1, z0],
        [x1, y1, z0],
        [x1, y0, z0],
      ],
    ];
    for (const [n, a, b, c, d] of faces) {
      const base = pos.length / 3;
      pos.push(...a, ...b, ...c, ...d);
      for (const q of [a, b, c, d]) uv.push(q[0] / 10, q[2] / 10); // one tile of the texture every 10 m
      for (let i = 0; i < 4; i++) nrm.push(...n);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return {
    pos: new Float32Array(pos),
    nrm: new Float32Array(nrm),
    uv: new Float32Array(uv),
    idx: new Uint16Array(idx),
  };
}

/** Walls that are not parallel to an axis, as a glTF-axes mesh. A slab runs along the plan segment a to b with its
 * face on that line and its thickness `t` toward the unit direction `out`, from height z0 to z1 (Blender metres). */
function slabsToMesh(slabs) {
  const pos = [],
    nrm = [],
    idx = [],
    uv = [];
  for (const { a, b, out, t, z0, z1 } of slabs) {
    const [a1, b1] = [a, b].map((p) => [p[0] + out[0] * t, p[1] + out[1] * t]);
    const P = (p, z) => [p[0], z, -p[1]]; // Blender plan and height to glTF axes
    const quad = (n, ...corners) => {
      const base = pos.length / 3;
      for (const c of corners) {
        pos.push(...c);
        nrm.push(...n);
        uv.push(c[0] / 10, c[2] / 10);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]].map((v, _, d) => v / Math.hypot(...d));
    quad([-out[0], 0, out[1]], P(a, z0), P(b, z0), P(b, z1), P(a, z1)); // the face toward the player
    quad([out[0], 0, -out[1]], P(b1, z0), P(a1, z0), P(a1, z1), P(b1, z1)); // the back
    quad([0, 1, 0], P(a, z1), P(b, z1), P(b1, z1), P(a1, z1)); // the top
    quad([0, -1, 0], P(a, z0), P(a1, z0), P(b1, z0), P(b, z0)); // the bottom
    quad([-dx, 0, dy], P(a1, z0), P(a, z0), P(a, z1), P(a1, z1)); // the end at a
    quad([dx, 0, -dy], P(b, z0), P(b1, z0), P(b1, z1), P(b, z1)); // the end at b
  }
  return {
    pos: new Float32Array(pos),
    nrm: new Float32Array(nrm),
    uv: new Float32Array(uv),
    idx: new Uint16Array(idx),
  };
}

/** Two glTF-axes meshes as one. */
function joined(m1, m2) {
  const offset = m1.pos.length / 3;
  return {
    pos: Float32Array.from([...m1.pos, ...m2.pos]),
    nrm: Float32Array.from([...m1.nrm, ...m2.nrm]),
    uv: Float32Array.from([...m1.uv, ...m2.uv]),
    idx: Uint16Array.from([...m1.idx, ...m2.idx.map((i) => i + offset)]),
  };
}

/** Moves a glTF-axes mesh by (dx, dy, dz). */
function moved(mesh, d) {
  const pos = new Float32Array(mesh.pos);
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) pos[i + k] += d[k];
  return { ...mesh, pos };
}

// ---------------------------------------------------------------- JSON text the way Prettier leaves it
// CI runs `prettier --check .` over the repository, and Prettier reads .gltf and .json as JSON. The index records each
// file's size and hash, so a later re-format must not change a byte. This writer therefore prints JSON exactly as
// Prettier 3 does with the repository's printWidth of 110 (checked with Prettier 3.9.10): every object that holds
// something is opened out, one key a line; an array stays on one line when it fits; an array that holds an object,
// or two or more arrays of two or more things each, is always opened out; a long array of numbers is filled line by
// line. walk_index.py has the same writer in Python.
const WIDTH = 110;
function numberText(v) {
  const s = String(v === 0 ? 0 : v);
  const m = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(s); // 1.5e-7 is written 0.00000015: no exponents in these files
  if (!m) return s;
  const digits = m[2] + (m[3] ?? '');
  const exp = Number(m[4]);
  return (
    m[1] + (exp < 0 ? `0.${'0'.repeat(-exp - 1)}${digits}` : digits + '0'.repeat(exp - (m[3]?.length ?? 0)))
  );
}
/** The one-line form of a value, or null when it cannot stand on one line. */
function flatJson(v) {
  if (Array.isArray(v)) {
    if (v.length > 1 && v.every((e) => Array.isArray(e) && e.length > 1)) return null;
    const parts = v.map(flatJson);
    return parts.includes(null) ? null : `[${parts.join(', ')}]`;
  }
  if (v !== null && typeof v === 'object') return Object.keys(v).length === 0 ? '{}' : null;
  return typeof v === 'number' ? numberText(v) : JSON.stringify(v);
}
/** `used` columns are already on the line before the value; `tail` columns (a comma) follow it. */
function prettyJson(v, indent = '', used = 0, tail = 0) {
  const flat = flatJson(v);
  if (flat !== null && (!Array.isArray(v) || used + flat.length + tail <= WIDTH)) return flat;
  const inner = `${indent}  `;
  if (Array.isArray(v)) {
    if (flat !== null && v.length > 1 && v.every((e) => typeof e === 'number')) {
      const lines = [];
      let line = inner;
      v.forEach((e, k) => {
        const item = numberText(e) + (k < v.length - 1 ? ',' : '');
        if (line === inner) line += item;
        else if (line.length + 1 + item.length <= WIDTH) line += ` ${item}`;
        else {
          lines.push(line);
          line = inner + item;
        }
      });
      lines.push(line);
      return `[\n${lines.join('\n')}\n${indent}]`;
    }
    const items = v.map((e, k) => {
      const comma = k < v.length - 1 ? ',' : '';
      return inner + prettyJson(e, inner, inner.length, comma.length) + comma;
    });
    return `[\n${items.join('\n')}\n${indent}]`;
  }
  const keys = Object.keys(v);
  const items = keys.map((key, k) => {
    const head = `${inner}${JSON.stringify(key)}: `;
    const comma = k < keys.length - 1 ? ',' : '';
    return head + prettyJson(v[key], inner, head.length, comma.length) + comma;
  });
  return `{\n${items.join('\n')}\n${indent}}`;
}

// ---------------------------------------------------------------- a minimal glTF writer

class Gltf {
  constructor() {
    this.chunks = [];
    this.byteLength = 0;
    this.bufferViews = [];
    this.accessors = [];
    this.meshes = [];
    this.nodes = [];
    this.roots = [];
    this.materials = [];
  }
  accessor(array, type, componentType, target, minMax) {
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const pad = (4 - (this.byteLength % 4)) % 4;
    if (pad) {
      this.chunks.push(Buffer.alloc(pad));
      this.byteLength += pad;
    }
    this.bufferViews.push({ buffer: 0, byteOffset: this.byteLength, byteLength: bytes.length, target });
    this.chunks.push(bytes);
    this.byteLength += bytes.length;
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3 }[type];
    this.accessors.push({
      bufferView: this.bufferViews.length - 1,
      componentType,
      count: array.length / comps,
      type,
      ...minMax,
    });
    return this.accessors.length - 1;
  }
  /** The POSITION accessor of a glTF-axes mesh, with the min and max glTF asks for. */
  positions(m) {
    const mn = [Infinity, Infinity, Infinity],
      mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < m.pos.length; i += 3)
      for (let k = 0; k < 3; k++) {
        mn[k] = Math.min(mn[k], m.pos[i + k]);
        mx[k] = Math.max(mx[k], m.pos[i + k]);
      }
    return this.accessor(m.pos, 'VEC3', 5126, 34962, { min: mn, max: mx });
  }
  mesh(name, m, material) {
    const attributes = { POSITION: this.positions(m) };
    if (material !== null) attributes.NORMAL = this.accessor(m.nrm, 'VEC3', 5126, 34962);
    if (m.col) attributes.COLOR_0 = this.accessor(m.col, 'VEC3', 5126, 34962);
    if (m.textured) attributes.TEXCOORD_0 = this.accessor(m.uv, 'VEC2', 5126, 34962);
    return this.meshOf(name, attributes, this.accessor(m.idx, 'SCALAR', 5123, 34963), material);
  }
  /** A mesh of one primitive from accessors already written: a cave draws its collision boxes with the same
   * positions and indices (unlit and baked, it needs no normals), which keeps the file small. */
  meshOf(name, attributes, indices, material) {
    this.meshes.push({
      name,
      primitives: [{ attributes, indices, ...(material === null ? {} : { material }) }],
    });
    return this.meshes.length - 1;
  }
  node(n) {
    this.nodes.push(n);
    return this.nodes.length - 1;
  }
  write(file, sceneName, extra = {}, sceneExtras = null) {
    const buffer = Buffer.concat(this.chunks);
    const json = {
      asset: { version: '2.0', generator: 'tools/blender/walk_areas/fixture/make-areas-fixture.mjs' },
      scene: 0,
      scenes: [{ name: sceneName, nodes: this.roots, ...(sceneExtras ? { extras: sceneExtras } : {}) }],
      nodes: this.nodes,
      meshes: this.meshes,
      materials: this.materials,
      ...extra,
      accessors: this.accessors,
      bufferViews: this.bufferViews,
      buffers: [
        {
          byteLength: buffer.length,
          uri: `data:application/octet-stream;base64,${buffer.toString('base64')}`,
        },
      ],
    };
    writeFileSync(file, `${prettyJson(json)}\n`);
  }
}

const MATERIALS = [
  {
    name: 'Snow',
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, 1],
      baseColorTexture: { index: 0 },
      metallicFactor: 0,
      roughnessFactor: 0.95,
    },
  },
  {
    name: 'Stone',
    pbrMetallicRoughness: { baseColorFactor: [0.4, 0.38, 0.36, 1], metallicFactor: 0, roughnessFactor: 0.9 },
  },
  {
    name: 'Wood',
    pbrMetallicRoughness: { baseColorFactor: [0.4, 0.27, 0.16, 1], metallicFactor: 0, roughnessFactor: 0.9 },
  },
  {
    name: 'Baked',
    pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1] },
    extensions: { KHR_materials_unlit: {} },
  },
];

const r6 = (v) => Math.round(v * 1e6) / 1e6 + 0;
/** The turn about +Y, in degrees (positive turns left), that makes an empty's -Z look along a Blender heading
 * (degrees counter-clockwise from east). The viewer's spawn yaw is this same angle. */
const spinForHeading = (h) =>
  (Math.atan2(-Math.cos((h * Math.PI) / 180), Math.sin((h * Math.PI) / 180)) * 180) / Math.PI;
/** A yaw in degrees brought into (-180, 180]. */
const yawDeg = (d) => {
  let v = ((((d + 180) % 360) + 360) % 360) - 180;
  if (v <= -180 + 1e-9) v = 180;
  return r6(v);
};
const r15 = (v) => Math.round(v * 1e15) / 1e15 + 0; // sin and cos leave 6e-17 where 0 is meant
const quatY = (deg) => [0, r15(Math.sin((deg * Math.PI) / 360)), 0, r15(Math.cos((deg * Math.PI) / 360))];
/** The 4 x 4 matrix, column-major as glTF writes it, of a translation t and a unit quaternion [x, y, z, w]. */
const matrixOf = (t, [x, y, z, w]) => {
  const [x2, y2, z2] = [x + x, y + y, z + z];
  const [xx, xy, xz, yy, yz, zz] = [x * x2, x * y2, x * z2, y * y2, y * z2, z * z2];
  const [wx, wy, wz] = [w * x2, w * y2, w * z2];
  return [
    1 - (yy + zz),
    xy + wz,
    xz - wy,
    0,
    xy - wz,
    1 - (xx + zz),
    yz + wx,
    0,
    xz + wy,
    yz - wx,
    1 - (xx + yy),
    0,
    ...t,
    1,
  ].map(r15);
};

// A copy of the picker words of the viewer (apps/walk/src/spawn.ts, plainWords and spawnLabel). check_areas.mjs
// compares the index with the viewer's own functions, so a drift between this copy and the viewer shows there.
const plainWords = (raw) => {
  const t = raw.replace(/[_-]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const spawnLabel = (id, extras = {}) => {
  const name = plainWords(typeof extras.wdi_spawn === 'string' && extras.wdi_spawn ? extras.wdi_spawn : id);
  const district = typeof extras.wdi_district === 'string' ? plainWords(extras.wdi_district) : '';
  return district && district.toLowerCase() !== name.toLowerCase() ? `${name} (${district})` : name;
};

// ---------------------------------------------------------------- the world both the files and the index come from

// The walk-only scenes, as the checkers read them (tools/blender/walk_areas/walk_scenes.json). The index lists the
// entries of the walk-only scenes the files use under walk_scenes.
const WALK_SCENES = JSON.parse(readFileSync(join(here, '..', 'walk_scenes.json'), 'utf8'));

// A seam: its line is x = `x` (Blender), its points stand at the places `ys` along it, side a west of the line.
const SEAM = {
  id: 'west_east',
  scene: 'overworld',
  kind: 'gate',
  width: 5,
  a: 'village_west',
  b: 'village_east',
  x: 0,
  ys: [-1.8, 0, 1.8],
  words: { a: 'East gate', b: 'West gate' }, // the picker words of the arrivals on each side
};
const OUTDOOR_LOOK = { wdi_exposure: 2.3784, fog_color: [0.026, 0.034, 0.058], fog_density: 0.006 };
// The caves: one passage under village_east, cut at x = 32 into two files. A cave keeps the village's coordinates.
// cave_id_prefix names the west cave cave_a, which a cave may not be called (the game has the scenes cave_entry and
// cave_gallery): the id of a cave starts with the area prefix of its walk-only scene, under_.
const CAVE_A = MUTATE === 'cave_id_prefix' ? 'cave_a' : 'under_a';
const CAVE = { floor: -10, roof: 2.6, ys: [-11.2, -8.8] }; // the floor's height, the roof above it, the passage's sides
const CAVE_SEAM = {
  id: 'a_b',
  scene: 'undermere',
  kind: 'passage',
  width: 2.4,
  a: CAVE_A,
  b: 'under_b',
  x: 32,
  ys: [-10.6, -9.4],
  words: { a: 'East passage', b: 'West passage' },
};
// One look for every cave: the ink as the fog colour, written as the viewer reads a colour string (three's Color).
const CAVE_LOOK = { wdi_exposure: 4, fog_color: '#12141C', fog_density: 0.05 };

function seamPortals(S, side) {
  // the row a section or a cave owns: side a stands 0.45 m west of the line, side b 0.45 m east of it
  const x = r6(S.x + (side === 'a' ? -0.45 : 0.45)),
    other = side === 'a' ? 'b' : 'a';
  return S.ys.map((y, k) => ({
    name: `Portal_seam_${S.id}_${side}_${k + 1}`,
    at: [x, y],
    to: S.scene,
    toSpawn: `seam_${S.id}_${other}_${k + 1}`,
    kind: 'gate',
    pid: `seam_${S.id}_${side}_${k + 1}`,
    seam: S.id,
    seamKind: S.kind,
    width: S.width,
    n: k + 1,
  }));
}
function seamArrivals(S, side, district) {
  // where a walker from the other side arrives: 1.65 m inside this side's wall
  const x = r6(S.x + (side === 'a' ? -1.65 : 1.65)),
    heading = side === 'a' ? 180 : 0;
  return S.ys.map((y, k) => ({
    id: `${S.scene}_seam_${S.id}_${side}_${k + 1}`,
    at: [x, y],
    heading,
    spawn: `${S.words[side]}, arrival ${k + 1}`,
    district,
    picker: false,
    n: k + 1,
  }));
}
/** The index's entry of a seam, as walk_index.py derives it from the files (`count`: a variant that drops points). */
const seamEntry = (S) => ({
  id: S.id,
  kind: S.kind,
  width_m: S.width,
  a: S.a,
  b: S.b,
  portals: S.count ?? S.ys.length,
  opening_xy: [
    [S.x, r6((S.ys[0] + S.ys[S.ys.length - 1]) / 2 - S.width / 2)],
    [S.x, r6((S.ys[0] + S.ys[S.ys.length - 1]) / 2 + S.width / 2)],
  ],
  normal_xy: [1, 0],
});
/** A cave: a stretch of the passage from x0 to x1, its floor at the height `floor`. */
const cave = (name, x0, x1, floor, spawns, portals) => ({
  kind: 'cave',
  scene: 'undermere',
  name,
  indoor: true,
  baked: true,
  at: [0, 0],
  floor,
  look: { ...CAVE_LOOK },
  walk: [x0, CAVE.ys[0], x1, CAVE.ys[1]],
  spawns,
  portals,
});

const WORLD = {
  start: 'square',
  areas: {
    village_west: {
      kind: 'section',
      scene: 'overworld',
      name: 'Village west',
      indoor: false,
      baked: false,
      at: [0, 0],
      look: { ...OUTDOOR_LOOK },
      walk: [-60, -20, 0, 20],
      spawns: [
        { id: 'square', at: [-30, 0], heading: 0, spawn: 'square', district: 'Village west' },
        {
          id: 'overworld_shop_door',
          at: [-40, 6.0],
          heading: -90,
          spawn: 'Outside the shop',
          district: 'Village west',
        },
        ...seamArrivals(SEAM, 'a', 'Village west'),
      ],
      portals: [
        {
          name: 'Portal_ov.shop',
          at: [-40, 7.55],
          to: 'shop',
          toSpawn: 'door',
          kind: 'door',
          pid: 'ov.shop',
        },
        ...seamPortals(SEAM, 'a'),
      ],
    },
    village_east: {
      kind: 'section',
      scene: 'overworld',
      name: 'Village east',
      indoor: false,
      baked: false,
      at: [0, 0],
      look: { ...OUTDOOR_LOOK },
      walk: [0, -20, 60, 20],
      spawns: [
        { id: 'mill', at: [30, 10], heading: 180, spawn: 'mill', district: 'Village east' },
        ...seamArrivals(SEAM, 'b', 'Village east'),
        {
          id: 'overworld_mouth_east',
          at: [20, -10.5],
          heading: 90,
          spawn: 'Outside the east cave mouth',
          district: 'Village east',
        },
      ],
      portals: [
        ...seamPortals(SEAM, 'b'),
        {
          name: 'Portal_ov.mine',
          at: [55, 0],
          to: 'mine',
          toSpawn: 'mouth',
          kind: 'cave_mouth',
          pid: 'ov.mine',
        },
        {
          name: 'Portal_um.east_in',
          at: [20, -12],
          to: 'undermere',
          toSpawn: 'mouth_east',
          kind: 'cave_mouth',
          pid: 'um.east_in',
        },
      ],
    },
    room_shop: {
      kind: 'room',
      scene: 'shop',
      name: 'The shop',
      indoor: true,
      baked: true,
      at: [0, 0],
      look: { wdi_exposure: 6.3 }, // as the real bedroom: an exposure and no fog (indoors the viewer draws none)
      walk: [-3, -3, 3, 3],
      spawns: [{ id: 'shop_door', at: [0, -2.3], heading: 90, spawn: 'By the door', district: 'The shop' }],
      portals: [
        {
          name: 'Portal_shop.door',
          at: [0, -2.8],
          to: 'overworld',
          toSpawn: 'shop_door',
          kind: 'door',
          pid: 'shop.door',
        },
      ],
    },
    [CAVE_A]: cave(
      'The Undermere, mouth passage',
      20,
      32,
      CAVE.floor,
      [
        {
          id: 'undermere_mouth_east',
          at: [22, -10],
          heading: 0,
          spawn: 'East cave mouth',
          district: 'The Undermere',
        },
        ...seamArrivals(CAVE_SEAM, 'a', 'The Undermere'),
      ],
      [
        {
          name: 'Portal_um.east_out',
          at: [20.5, -10],
          to: 'overworld',
          toSpawn: 'mouth_east',
          kind: 'cave_mouth',
          pid: 'um.east_out',
        },
        ...seamPortals(CAVE_SEAM, 'a'),
      ],
    ),
    under_b: cave(
      'The Undermere, far passage',
      32,
      44,
      CAVE.floor,
      [...seamArrivals(CAVE_SEAM, 'b', 'The Undermere')],
      [...seamPortals(CAVE_SEAM, 'b')],
    ),
  },
  seams: [CAVE_SEAM, SEAM], // in the order of their ids, as walk_index.py lists them
  pending: ['mine'],
};

// ---------------------------------------------------------------- MUTATE=<name>: one variant of the world at a time
// `indexLook` is what the index says about an area's look when it must differ from the file (look_drift).
// `slopeNorth` is how much the ground of both sections rises for each metre toward the north (the seam runs north).
// An area may also carry: `up`, metres by which everything the file holds stands higher; `shift`, a plan move of
// everything the file holds with no transform on any node; `sceneExtras`; `sun`; `lightName`; `ghostLight`;
// `requireExt`; `polygon` (the outline of the walk region as [x, y] pairs), with `polygonForm` 'string' to write it as
// a JSON string and `polygonRaw` to write a broken value instead.
// `caveRamp` is how much the floor (and the roof) of every cave rises for each metre toward the east, across the cave
// seam; `openRoof` names the cave whose seam wall stops 0.3 m under the roof; `walkScenes` is the list of walk-only
// scenes a variant writes beside its files (mutants.py hands it to both checkers with --walk-scenes).
const FLAGS = {
  noBarrier: null,
  noCollision: null,
  twoAreas: null,
  slopeNorth: 0,
  noSouthWall: null,
  edgeGap: null,
  chamfer: null,
  caveRamp: 0,
  openRoof: null,
  walkScenes: null,
};
// polygon_chamfer and chamfer_open: the north-west corner of village_west is cut off along the diagonal from (-50, 20)
// to (-60, 10). Its outline is then a pentagon (counter-clockwise), and CHAMFER_WALL stands on the diagonal: a wall that
// is not parallel to an axis, its face on the line, 0.3 m thick toward the north-west.
const CHAMFER_POLYGON = [
  [-60, -20],
  [0, -20],
  [0, 20],
  [-50, 20],
  [-60, 10],
];
const CHAMFER_WALL = { a: [-50, 20], b: [-60, 10], out: [-Math.SQRT1_2, Math.SQRT1_2], t: 0.3, z0: 0, z1: 3 };
{
  const W = WORLD.areas.village_west,
    E = WORLD.areas.village_east,
    R = WORLD.areas.room_shop,
    CA = WORLD.areas[CAVE_A],
    CB = WORLD.areas.under_b;
  const isArrival = (s) => s.id.startsWith('overworld_seam_');
  const isSeam = (p) => p.name.startsWith('Portal_seam_');
  const renumber = (A, side) => {
    const other = side === 'a' ? 'b' : 'a';
    A.portals.filter(isSeam).forEach((p, k) => {
      p.name = `Portal_seam_${SEAM.id}_${side}_${k + 1}`;
      p.pid = `seam_${SEAM.id}_${side}_${k + 1}`;
      p.toSpawn = `seam_${SEAM.id}_${other}_${k + 1}`;
      p.n = k + 1;
    });
    A.spawns.filter(isArrival).forEach((s, k) => {
      s.id = `overworld_seam_${SEAM.id}_${side}_${k + 1}`;
      s.n = k + 1;
    });
  };
  const keepPairs = (keep) => {
    for (const [A, side] of [
      [W, 'a'],
      [E, 'b'],
    ]) {
      A.portals = A.portals.filter((p) => !isSeam(p) || keep.includes(p.n));
      A.spawns = A.spawns.filter((s) => !isArrival(s) || keep.includes(s.n));
      renumber(A, side);
    }
    SEAM.count = keep.length;
  };
  switch (MUTATE) {
    case 'arrival_close':
      E.spawns.filter(isArrival).forEach((s) => {
        s.at[0] = 1.0;
      });
      break; // 0.55 m from the return row
    case 'arrival_turned':
      E.spawns.filter(isArrival).forEach((s) => {
        s.heading = 90;
      });
      break; // looks north, not east
    case 'lateral_shift':
      E.spawns.filter(isArrival).forEach((s) => {
        s.at[1] += 0.5;
      });
      break; // lands 0.5 m along the gate
    case 'wide_spacing':
      for (const A of [W, E]) {
        A.portals.filter(isSeam).forEach((p) => {
          p.at[1] *= 1.45;
        });
        A.spawns.filter(isArrival).forEach((s) => {
          s.at[1] *= 1.45;
        });
      }
      break; // 2.61 m apart
    case 'single_portal':
      keepPairs([2]);
      break; // one point in a 5 m opening
    case 'room_at_slot':
      R.at = [3000, 3000];
      break; // the far-grid slot of the old single file
    case 'section_offset':
      E.at = [10, 0];
      break; // a section moved out of the village frame
    case 'dup_spawn':
      E.spawns.find((s) => s.id === 'mill').id = 'square';
      break; // the id "square" in two files
    case 'typo_target':
      W.portals.find((p) => p.name === 'Portal_ov.shop').to = 'shp';
      break; // no scene "shp"
    case 'no_exposure':
      delete W.look.wdi_exposure;
      break;
    case 'look_pop':
      E.look = { ...E.look, wdi_exposure: 2.0 };
      break; // the two sides of the seam differ, in file and index
    case 'no_barrier':
      FLAGS.noBarrier = 'village_west';
      break; // the wall across the opening is gone
    case 'look_drift':
      for (const A of [W, E]) {
        A.indexLook = { ...A.look };
        A.look = { ...A.look, wdi_exposure: 3.1, fog_density: 0.02 };
      }
      break; // the files changed, the index did not
    case 'dup_target_spawn':
      R.spawns.push({
        id: 'overworld_shop_door',
        at: [1, 0],
        heading: 90,
        spawn: 'Outside the shop',
        district: 'The shop',
      });
      break; // a portal's target id in two files
    case 'bare_target':
      R.portals[0].toSpawn = 'square';
      break; // "overworld_square" does not exist; the bare id "square" does
    case 'seam_gap':
      keepPairs([1, 3]);
      break; // the middle point is gone: 3.6 m between neighbours
    case 'no_collision':
      FLAGS.noCollision = 'village_east';
      break;
    case 'two_areas':
      FLAGS.twoAreas = 'village_east';
      break;
    case 'dup_in_file':
      W.spawns.push({ id: 'square', at: [-20, 5], heading: 0, spawn: 'square', district: 'Village west' });
      break; // the loader would rename the second
    case 'arrival_near_door':
      E.portals.push({
        name: 'Portal_ov.hut',
        at: [1.65, 0.6],
        to: 'mine',
        toSpawn: 'hut',
        kind: 'door',
        pid: 'ov.hut',
      });
      break; // a door 0.6 m from the seam arrival b_2: its radius holds the arrival
    case 'spawn_near_portal':
      E.spawns.find((s) => s.id === 'mill').at = [0.9, 1.0];
      break; // 0.92 m from the seam point b_3
    case 'door_near_seam':
      E.portals.push({
        name: 'Portal_ov.shed',
        at: [0.45, 3.0],
        to: 'mine',
        toSpawn: 'shed',
        kind: 'door',
        pid: 'ov.shed',
      });
      break; // 1.2 m from the seam point b_3, and 1.2 m and more from every arrival
    case 'seam_step':
      E.up = 0.5;
      break; // the east file holds everything 0.5 m higher than the west file does
    case 'scene_fog':
      E.sceneExtras = { fog_color: [0.2, 0.1, 0.1], fog_density: 0.006 };
      break; // fog on the glTF scene of one section
    case 'sun_one_side':
      E.sun = true;
      break; // a directional light in one section
    case 'room_far_from_origin':
      R.shift = [3000, 3000];
      break; // the room's contents at the old far-grid slot, with no transform on any node
    case 'raw_name_dot':
      R.spawns[0].rawName = 'Spawn_shop_.door';
      break; // three.js strips the dot and reads the same id: nothing shows but the written name
    case 'light_named_like_spawn':
      R.lightName = 'Spawn_shop_door';
      break; // the light definition takes the name first; the loader renames the spawn node
    case 'light_ghost_spawn':
      E.ghostLight = 'Spawn_ghost';
      break; // on the node that holds the ground mesh: three.js adds an object Spawn_ghost, a spawn nobody wrote
    case 'index_target_area':
      W.portals.find((p) => p.name === 'Portal_ov.shop').indexTarget = 'village_east';
      break; // the files are right; the index names the wrong area for a door's target
    case 'extension_not_listed':
      E.requireExt = 'KHR_materials_clearcoat';
      break; // the file requires an extension that is not on the contract's list
    case 'south_wall_gone':
      FLAGS.noSouthWall = 'village_east';
      break; // the collision wall along the south edge of village_east is missing: 60 m of open edge
    case 'edge_gap':
      FLAGS.edgeGap = 'village_east';
      break; // a 0.6 m gap in the east wall of village_east at y 6.0 to 6.6, far from the seam opening
    case 'baked_one_side':
      E.baked = true;
      break; // village_east says wdi_baked (the viewer switches off its lights), village_west does not
    case 'polygon_odd':
      W.polygonRaw = [-60, -20, 0, -20, 0];
      break; // five numbers are no list of points
    case 'pending_bare_id':
      E.portals.find((p) => p.name === 'Portal_ov.mine').toSpawn = 'mill';
      break; // VALID: a door into the scene "mine", which is not built, with the bare id of a spawn that exists
    case 'spawn_matrix':
      E.spawns.find((s) => s.id === 'mill').asMatrix = true;
      break; // VALID: Spawn_mill is written with a matrix, not translation and rotation (legal glTF)
    case 'polygon_flat':
      W.polygon = [
        [-60, -20],
        [0, -20],
        [0, 20],
        [-60, 20],
      ];
      break; // VALID: the outline written as a flat list of numbers, the form a Blender custom property can hold
    case 'polygon_string':
      W.polygon = [
        [-60, -20],
        [0, -20],
        [0, 20],
        [-60, 20],
      ];
      W.polygonForm = 'string';
      break; // VALID: the same outline written as a JSON string, as today's exporter writes nested data
    case 'polygon_chamfer':
      W.polygon = CHAMFER_POLYGON;
      FLAGS.chamfer = { id: 'village_west', wall: true };
      break; // VALID: a cut corner, with the outline written and a diagonal wall on it
    case 'chamfer_open':
      W.polygon = CHAMFER_POLYGON;
      FLAGS.chamfer = { id: 'village_west', wall: false };
      break; // the outline has the cut corner and nothing stands on the diagonal: 14.1 m of open edge, not parallel to an axis
    case 'way_back_far': {
      const out = W.spawns.find((s) => s.id === 'overworld_shop_door');
      W.spawns = W.spawns.filter((s) => s !== out);
      E.spawns.push({ ...out, at: [20, 6], district: 'Village east' });
      break; // NOTED: the shop's way out arrives in the other section than its door
    }
    case 'no_way_in':
      W.portals = W.portals.filter((p) => p.name !== 'Portal_ov.shop');
      break; // NOTED: no portal leads into the shop any more
    case 'slope_along_seam':
      FLAGS.slopeNorth = 0.03;
      break; // VALID: the ground of both sections rises 3 % toward the north; walls stay 3 m above it
    // the caves (contract version 1.1)
    case 'cave_not_indoor':
      CA.indoor = false;
      break; // the cave's Area has no wdi_indoor: the viewer would draw the moon, the sky light and the sky dome in it
    case 'cave_not_baked':
      CA.baked = false;
      break; // the cave's Area has no wdi_baked
    case 'cave_seam_open_roof':
      FLAGS.openRoof = CAVE_A;
      break; // the seam wall of the west cave stops 0.3 m under the roof: the passage is not closed up to it
    case 'cave_seam_to_overworld':
      CA.portals.filter(isSeam).forEach((p) => {
        p.to = 'overworld';
      });
      break; // the cave seam's points of side a lead into the village, not into the caves' own scene
    case 'cave_look_differs':
      CB.look = { ...CB.look, fog_density: 0.08 };
      break; // the east cave carries thicker fog than the west one, in its file and in the index
    case 'walk_scene_is_game_scene':
      FLAGS.walkScenes = {
        ...WALK_SCENES,
        shop: { name: 'The shop cellars', kind: 'cave', area_prefix: 'shopcave_', portal_ns: 'sc' },
      };
      break; // walk_scenes.json also lists "shop", the game scene of the room room_shop, as a walk-only scene
    case 'cave_id_prefix':
      break; // the west cave is called cave_a (CAVE_A above), not under_<key>
    case 'cave_door_between_caves': {
      // the cave seam is gone; two plain doors join the caves instead, each with its arrival 1.2 m behind it
      for (const A of [CA, CB]) {
        A.portals = A.portals.filter((p) => !isSeam(p));
        A.spawns = A.spawns.filter((s) => !s.id.startsWith('undermere_seam_'));
      }
      CA.portals.push({
        name: 'Portal_ua.east',
        at: [31.55, -10],
        to: 'undermere',
        toSpawn: 'b_west',
        kind: 'door',
        pid: 'ua.east',
      });
      CA.spawns.push({
        id: 'undermere_a_east',
        at: [30.35, -10],
        heading: 180,
        spawn: 'East door',
        district: 'The Undermere',
      });
      CB.portals.push({
        name: 'Portal_ub.west',
        at: [32.45, -10],
        to: 'undermere',
        toSpawn: 'a_east',
        kind: 'door',
        pid: 'ub.west',
      });
      CB.spawns.push({
        id: 'undermere_b_west',
        at: [33.65, -10],
        heading: 0,
        spawn: 'West door',
        district: 'The Undermere',
      });
      WORLD.seams = WORLD.seams.filter((S) => S !== CAVE_SEAM);
      break; // a crossing between two caves of one scene that is no seam
    }
    case 'cave_spawn_near_portal':
      CA.spawns.find((s) => s.id === 'undermere_mouth_east').at = [21.3, -10];
      break; // the cave mouth's arrival stands 0.8 m from Portal_um.east_out, inside its walk-in radius
    case 'cave_gate_to_missing_spawn':
      CA.spawns = CA.spawns.filter((s) => s.id !== 'undermere_mouth_east');
      break; // Portal_um.east_in leads to undermere + mouth_east, and no cave holds Spawn_undermere_mouth_east
    case 'gate_pending':
      delete WORLD.areas[CAVE_A];
      delete WORLD.areas.under_b;
      WORLD.seams = WORLD.seams.filter((S) => S !== CAVE_SEAM);
      WORLD.pending = ['mine', 'undermere'];
      break; // NOTED: the cave mouth leads into the caves before any cave file exists: undermere is pending
    case 'cave_stacked_levels':
      // VALID: a third cave lies directly under the west cave, 6 m lower, reached by its own mouth from village_west.
      // Its mouth's portal and arrival stand at the same places in plan as those of the west cave, in another file.
      WORLD.areas.under_c = cave(
        'The Undermere, lower passage',
        20,
        32,
        CAVE.floor - 6,
        [
          {
            id: 'undermere_mouth_west',
            at: [22, -10],
            heading: 0,
            spawn: 'West cave mouth',
            district: 'The Undermere',
          },
        ],
        [
          {
            name: 'Portal_um.west_out',
            at: [20.5, -10],
            to: 'overworld',
            toSpawn: 'mouth_west',
            kind: 'cave_mouth',
            pid: 'um.west_out',
          },
        ],
      );
      W.spawns.push({
        id: 'overworld_mouth_west',
        at: [-20, -10.5],
        heading: 90,
        spawn: 'Outside the west cave mouth',
        district: 'Village west',
      });
      W.portals.push({
        name: 'Portal_um.west_in',
        at: [-20, -12],
        to: 'undermere',
        toSpawn: 'mouth_west',
        kind: 'cave_mouth',
        pid: 'um.west_in',
      });
      break;
    case 'cave_seam_ramp':
      FLAGS.caveRamp = 0.06;
      break; // VALID: the floor and roof of both caves rise 6 % toward the east, across the cave seam
    default:
      break;
  }
}

/** How high the ground of an area stands at a plan place, above its floor: flat unless a variant slopes, ramps or lifts
 * it. A section slopes toward the north (slope_along_seam), a cave ramps toward the east about the cave seam's line. */
const heightAt = (A, xEast, yNorth) =>
  (A.up ?? 0) +
  (A.kind === 'section' ? FLAGS.slopeNorth * yNorth : 0) +
  (A.kind === 'cave' ? FLAGS.caveRamp * (xEast - CAVE_SEAM.x) : 0);
/** A glTF-axes mesh of an area as a variant wants it: sheared to the slope or the ramp, lifted, moved in plan. */
function shaped(mesh, A) {
  const [sx, sy] = A.shift ?? [0, 0];
  if (
    !A.up &&
    !sx &&
    !sy &&
    !(A.kind === 'section' && FLAGS.slopeNorth) &&
    !(A.kind === 'cave' && FLAGS.caveRamp)
  )
    return mesh;
  const pos = new Float32Array(mesh.pos);
  for (let i = 0; i < pos.length; i += 3) {
    pos[i + 1] += heightAt(A, pos[i], -pos[i + 2]);
    pos[i] += sx;
    pos[i + 2] -= sy;
  }
  return { ...mesh, pos };
}
/** An area's walk region as the file gives it: the Area node's move and a variant's plan shift are added. */
const walkRegion = (A) => A.walk.map((v, i) => v + A.at[i % 2] + (A.shift ?? [0, 0])[i % 2]);
/** Where a spawn or a portal of an area stands, in glTF axes, in the Area's own coordinates: on its floor (a cave's
 * lies under the village, at `floor`). */
const placed = (A, at) => {
  const [sx, sy] = A.shift ?? [0, 0];
  return [r6(at[0] + sx), r6((A.floor ?? 0) + heightAt(A, at[0], at[1])), r6(-(at[1] + sy))];
};

// ---------------------------------------------------------------- one area file

function sectionBoxes(id) {
  const west = id === 'village_west';
  const [x0, y0, x1, y1] = WORLD.areas[id].walk;
  const collision = [
    bbox(x0, y0, -0.2, x1, y1, 0), // the ground of the walk region
    bbox(x0 - 0.3, y0 - 0.3, 0, x0, y1 + 0.3, 3), // west edge: in the east file this is the seam wall, its face on x = 0
    bbox(x1, y0 - 0.3, 0, x1 + 0.3, y1 + 0.3, 3), // east edge: in the west file this is the seam wall, its face on x = 0
    bbox(x0, y0 - 0.3, 0, x1, y0, 3), // south edge
    bbox(x0, y1, 0, x1, y1 + 0.3, 3), // north edge
  ];
  if (FLAGS.noBarrier === id) collision.splice(west ? 2 : 1, 1);
  if (FLAGS.noSouthWall === id) collision.splice(3, 1);
  if (FLAGS.edgeGap === id)
    collision.splice(2, 1, bbox(x1, y0 - 0.3, 0, x1 + 0.3, 6.0, 3), bbox(x1, 6.6, 0, x1 + 0.3, y1 + 0.3, 3)); // the east wall, with a 0.6 m gap
  if (west) collision.push(bbox(-45, 8, 0, -35, 14, 4)); // the shop
  // What a file draws beyond its own ground is the exporter's business (not a loader rule): here the ground runs 10 m
  // past the seam so that no void shows through the gate.
  const render = [bbox(west ? -70 : -10, -30, -0.2, west ? 10 : 70, 30, 0)];
  render.push(
    bbox(-0.15, -3.2, 0, 0.15, -2.5, 3),
    bbox(-0.15, 2.5, 0, 0.15, 3.2, 3),
    bbox(-0.15, -3.2, 3, 0.15, 3.2, 3.4),
  ); // gate posts and lintel
  render.push(west ? bbox(-45, 8, 0, -35, 14, 4) : bbox(28, -4, 0, 34, 2, 2.2)); // the shop; a pile by the mill
  // a wall that is not parallel to an axis: the diagonal along the cut corner of the outline of polygon_chamfer
  const slabs = FLAGS.chamfer?.id === id && FLAGS.chamfer.wall ? [CHAMFER_WALL] : [];
  return { collision, render, slabs };
}

/** A cave's passage: floor, roof, side walls and end walls, 0.3 m thick, from its walk region and its floor. The end
 * on the cave seam's line (x = 32) is the seam wall, from the floor to the roof; cave_seam_open_roof stops it 0.3 m
 * short. The rest of the passage is closed too, which the index checkers do not test (the cave builder's Blender check
 * does). The boxes are both the collision and what is drawn. */
function caveBoxes(id) {
  const A = WORLD.areas[id];
  const [x0, y0, x1, y1] = A.walk,
    z = A.floor,
    h = CAVE.roof,
    t = 0.3;
  const top = (x) => z + (FLAGS.openRoof === id && x === CAVE_SEAM.x ? h - 0.3 : h);
  return [
    bbox(x0 - t, y0 - t, z - 0.2, x1 + t, y1 + t, z), // the floor
    bbox(x0 - t, y0 - t, z + h, x1 + t, y1 + t, z + h + 0.2), // the roof
    bbox(x0 - t, y0 - t, z, x1 + t, y0, z + h), // the south wall
    bbox(x0 - t, y1, z, x1 + t, y1 + t, z + h), // the north wall
    bbox(x0 - t, y0, z, x0, y1, top(x0)), // the west end: in under_b the seam wall, its face on x = 32
    bbox(x1, y0, z, x1 + t, y1, top(x1)), // the east end: in under_a the seam wall, its face on x = 32
  ];
}

function writeArea(id) {
  const A = WORLD.areas[id];
  const G = new Gltf();
  G.materials =
    id === 'room_shop' ? [...MATERIALS] : A.kind === 'cave' ? [MATERIALS[3]] : MATERIALS.slice(0, 3);
  const atG = [A.at[0], 0, -A.at[1]]; // the Area node's glTF translation: zero unless a mutant moves it
  const children = [];
  const stats = {
    triangles_loaded: 0,
    triangles_collision: 0,
    draw_calls: 0,
    instanced_groups: 0,
    images: 0,
    texture_gpu_mb: 0,
    lights: 0,
  };
  const draw = (name, mesh, material, extra = {}) => {
    stats.triangles_loaded += mesh.idx.length / 3;
    stats.draw_calls += 1;
    return G.node({ name, mesh: G.mesh(name, mesh, material), ...extra });
  };
  let collisionMesh,
    collisionShared = null; // a cave's collision: the accessors of its drawn passage
  const sectionLights = []; // light definitions a variant adds to a section; the plain fixture has none

  if (id === 'room_shop') {
    const room = [
      bbox(-3, -3, -0.2, 3, 3, 0),
      bbox(-3, -3.3, 0, 3, -3, 3),
      bbox(-3, 3, 0, 3, 3.3, 3),
      bbox(-3.3, -3, 0, -3, 3, 3),
      bbox(3, -3, 0, 3.3, 3, 3),
      bbox(-3, -3.3, 3, 3, 3.3, 3.2),
    ];
    const m = shaped(boxesToMesh(room), A);
    m.col = new Float32Array(m.pos.length).fill(0.5); // the baked light: mid grey
    children.push(draw('Room', m, 3));
    children.push(
      draw('Lamp', shaped(boxesToMesh([bbox(-0.1, -0.1, 2.4, 0.1, 0.1, 2.6)]), A), 2, {
        extras: { wdi_cast_shadow: false },
      }),
    );
    const lamp = placed(A, [0, 0]);
    children.push(
      G.node({
        name: 'Lamp_light',
        translation: [lamp[0], r6(lamp[1] + 2.3), lamp[2]],
        extensions: { KHR_lights_punctual: { light: 0 } },
      }),
    );
    stats.lights = 1;
    collisionMesh = moved(shaped(boxesToMesh(room), A), atG); // collision is in world coordinates
  } else if (A.kind === 'cave') {
    // the passage is drawn with its collision boxes, the same positions and indices, in the unlit baked material and
    // with no vertex colours or normals: the test world stays small, and no checker reads what a cave looks like
    const m = shaped(boxesToMesh(caveBoxes(id)), A);
    const POSITION = G.positions(m),
      indices = G.accessor(m.idx, 'SCALAR', 5123, 34963);
    stats.triangles_loaded += m.idx.length / 3;
    stats.draw_calls += 1;
    children.push(G.node({ name: 'Passage', mesh: G.meshOf('Passage', { POSITION }, indices, 0) }));
    collisionShared = { POSITION, indices, triangles: m.idx.length / 3 };
  } else {
    const { collision, render, slabs } = sectionBoxes(id);
    const ground = shaped(boxesToMesh(render), A);
    ground.textured = true;
    // a variant may hang a light definition on the node that holds the ground mesh (light_ghost_spawn)
    if (A.ghostLight)
      sectionLights.push({ name: A.ghostLight, type: 'point', color: [1, 0.6, 0.3], intensity: 5 });
    children.push(
      draw(
        'Ground and gate',
        ground,
        0,
        A.ghostLight ? { extensions: { KHR_lights_punctual: { light: sectionLights.length - 1 } } } : {},
      ),
    );
    collisionMesh = shaped(boxesToMesh(collision), A);
    if (slabs.length) collisionMesh = joined(collisionMesh, shaped(slabsToMesh(slabs), A));
    stats.images = 1;
    stats.texture_gpu_mb = Math.round(((4 * 4 * 4 * 4) / 3 / 1e6) * 10) / 10 + 0; // RGBA8 with mips: 0.0 MB for 4 x 4
    if (A.sun) {
      sectionLights.push({ name: 'Sun', type: 'directional', color: [1, 0.9, 0.8], intensity: 3 });
      children.push(
        G.node({
          name: 'Sun',
          rotation: [-0.5, 0, 0, 0.8660254],
          extensions: { KHR_lights_punctual: { light: sectionLights.length - 1 } },
        }),
      );
    }
    stats.lights = sectionLights.length;
  }

  // empties under the Area: spawns and portals, in the Area's own coordinates
  const spawnNode = (s) => {
    const t = placed(A, s.at),
      q = quatY(spinForHeading(s.heading));
    return G.node({
      name: s.rawName ?? `Spawn_${s.id}`,
      ...(s.asMatrix ? { matrix: matrixOf(t, q) } : { translation: t, rotation: q }),
      extras: {
        wdi_spawn: s.spawn,
        wdi_district: s.district,
        wdi_facing_deg: s.heading,
        ...(s.picker === false ? { wdi_picker: false } : {}),
      },
    });
  };
  for (const s of A.spawns) children.push(spawnNode(s));
  for (const p of A.portals) {
    children.push(
      G.node({
        name: p.name,
        translation: placed(A, p.at),
        extras: {
          to: p.to,
          toSpawn: p.toSpawn,
          kind: p.kind,
          wdi_portal_id: p.pid,
          ...(p.seam ? { wdi_seam: p.seam, wdi_seam_kind: p.seamKind, wdi_width_m: p.width } : {}),
        },
      }),
    );
  }

  const area = G.node({
    name: `Area_${id}`,
    ...(atG.some((v) => v !== 0) ? { translation: atG } : {}),
    children,
    extras: {
      wdi_area: id,
      wdi_kind: A.kind,
      wdi_scene: A.scene,
      wdi_name: A.name,
      wdi_walk_region: walkRegion(A),
      ...(A.polygon || A.polygonRaw
        ? {
            wdi_walk_polygon:
              A.polygonRaw ?? (A.polygonForm === 'string' ? JSON.stringify(A.polygon) : A.polygon.flat()),
          }
        : {}),
      ...(A.indoor ? { wdi_indoor: true } : {}),
      ...(A.baked ? { wdi_baked: true } : {}),
      ...A.look,
    },
  });
  G.roots = [area];
  if (FLAGS.noCollision !== id) {
    stats.triangles_collision = collisionShared ? collisionShared.triangles : collisionMesh.idx.length / 3;
    G.roots.push(
      G.node({
        name: `HM_Collision_${id}`,
        mesh: collisionShared
          ? G.meshOf(
              `HM_Collision_${id}`,
              { POSITION: collisionShared.POSITION },
              collisionShared.indices,
              null,
            )
          : G.mesh(`HM_Collision_${id}`, collisionMesh, null),
        extras: { wdi_collision: true },
      }),
    );
  }
  if (FLAGS.twoAreas === id)
    G.roots.push(G.node({ name: 'Area_village_extra', extras: { wdi_area: 'village_extra' } }));

  const extra =
    id === 'room_shop'
      ? {
          extensionsUsed: ['KHR_materials_unlit', 'KHR_lights_punctual'],
          extensions: {
            KHR_lights_punctual: {
              lights: [
                { name: A.lightName ?? 'Lamp', type: 'point', color: [1, 0.6, 0.3], intensity: 20, range: 6 },
              ],
            },
          },
        }
      : A.kind === 'cave'
        ? { extensionsUsed: ['KHR_materials_unlit'] } // a cave is baked: unlit, its light in the vertex colours
        : {
            images: [{ uri: `data:image/png;base64,${png4x4().toString('base64')}`, name: 'snow_4x4' }],
            textures: [{ source: 0 }],
            ...(sectionLights.length
              ? {
                  extensionsUsed: ['KHR_lights_punctual'],
                  extensions: { KHR_lights_punctual: { lights: sectionLights } },
                }
              : {}),
          };
  if (A.requireExt) {
    extra.extensionsUsed = [...(extra.extensionsUsed ?? []), A.requireExt];
    extra.extensionsRequired = [A.requireExt];
  }
  const file = `walk-${id}.gltf`;
  G.write(join(OUT, file), `Walk fixture ${id}`, extra, A.sceneExtras ?? null);
  return { file, stats };
}

// ---------------------------------------------------------------- the files, then the index from the same data

const written = {};
for (const id of Object.keys(WORLD.areas)) written[id] = writeArea(id);

// The index lists the areas in the order of their ids, as walk_index.py does, so that both write the same bytes.
const AREAS = Object.entries(WORLD.areas).sort(([a], [b]) => (a < b ? -1 : 1));
const spawnHome = {}; // spawn id -> area id (the first one wins; a doubled id is what the dup mutants are about)
for (const [id, A] of AREAS) for (const s of A.spawns) spawnHome[s.id] ??= id;
const sceneAreas = {};
for (const [id, A] of AREAS) (sceneAreas[A.scene] ??= []).push(id);

const index = {
  format: 1,
  world: 'hollowmere-fixture',
  axes: 'Metres. Every 3-number vector is in glTF world axes: x east, y up, z = -north. Every field whose name ends in _xy is a plan view in Blender axes: x east, y north. yaw_deg is the yaw of the viewer: 0 looks along -z (north), positive turns left, so west is 90.',
  start: WORLD.start,
  areas: {},
  scenes: sceneAreas,
  seams: WORLD.seams.map(seamEntry),
  pending: WORLD.pending,
};
// walk_scenes: the entries of the walk-only scenes the files use (an area's scene, or where a portal leads), only when
// there is one. walk_scene_is_game_scene writes its own list of walk-only scenes beside the files.
{
  const scenes = FLAGS.walkScenes ?? WALK_SCENES;
  const used = new Set(AREAS.flatMap(([, A]) => [A.scene, ...A.portals.map((p) => p.to)]));
  const listed = Object.keys(scenes)
    .filter((s) => used.has(s))
    .sort();
  if (listed.length) index.walk_scenes = Object.fromEntries(listed.map((s) => [s, scenes[s]]));
  if (FLAGS.walkScenes) writeFileSync(join(OUT, 'walk_scenes.json'), `${prettyJson(FLAGS.walkScenes)}\n`);
}
for (const [id, A] of AREAS) {
  const path = join(OUT, written[id].file);
  const world = (at) => {
    const [x, y, z] = placed(A, at); // in the Area's own coordinates; the Area node's move is added
    return [r6(A.at[0] + x), y, r6(z - A.at[1])];
  };
  index.areas[id] = {
    file: written[id].file,
    bytes: statSync(path).size,
    sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
    kind: A.kind,
    scene: A.scene,
    name: A.name,
    indoor: A.indoor,
    baked: A.baked,
    walk_region_xy: walkRegion(A),
    ...(A.polygon ? { walk_polygon_xy: A.polygon } : {}),
    look: A.indexLook ?? A.look,
    spawns: A.spawns.map((s) => ({
      id: s.id,
      label: spawnLabel(s.id, { wdi_spawn: s.spawn, wdi_district: s.district }),
      name: spawnLabel(s.id, { wdi_spawn: s.spawn }),
      group: plainWords(s.district),
      position: world(s.at),
      yaw_deg: yawDeg(spinForHeading(s.heading)),
      ...(s.picker === false ? { picker: false } : {}),
    })),
    portals: A.portals.map((p) => ({
      id: p.name
        .slice('Portal_'.length)
        .replace(/\s/g, '_')
        .replace(/[.[\]:/]/g, ''),
      portal_id: p.pid,
      position: world(p.at),
      to: p.to,
      toSpawn: p.toSpawn,
      kind: p.kind,
      target_area: p.indexTarget ?? spawnHome[`${p.to}_${p.toSpawn}`] ?? null,
      ...(p.seam ? { seam: p.seam } : {}),
    })),
    stats: written[id].stats,
  };
}
writeFileSync(join(OUT, 'walk-index.json'), `${prettyJson(index)}\n`);
console.log(
  `wrote ${Object.keys(written).length} area files and walk-index.json to ${OUT}${MUTATE ? ` (MUTATE=${MUTATE})` : ''}`,
);
for (const a of Object.values(index.areas))
  console.log(`  ${a.file}  ${a.bytes} B  spawns ${a.spawns.length}  portals ${a.portals.length}`);
