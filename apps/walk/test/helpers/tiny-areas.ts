import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { BoxGeometry } from 'three';

// Two tiny cave files and their walk-index.json, built in memory as real .glb bytes (nothing binary is committed:
// *.glb goes to Git LFS, which CI does not check out). The layout, glTF axes (x east, y up, z = -north), metres:
//
//   walk-under_x.glb  Area_under_x: a floor x -10..0, z -3..3, top at y = -10, with one 4 x 4 texture.
//     Spawn_undermere_mouth_x (-8, -10, 0) facing +X; Portal_um.x_out (-9.5, -10, 0), a cave mouth to overworld /
//     mouth_x, whose village is not in the index (pending); the seam row Portal_seam_xy_a_1 (-0.45, -10, 0) to
//     undermere / seam_xy_b_1, and its arrival Spawn_undermere_seam_xy_a_1 (-1.65, -10, 0) facing -X (picker false).
//   walk-under_y.glb  Area_under_y: a floor x 0..10, with its own 4 x 4 texture. Portal_seam_xy_b_1 (0.45, -10, 0)
//     to undermere / seam_xy_a_1; the arrival Spawn_undermere_seam_xy_b_1 (1.65, -10, 0) facing +X with wdi_mode
//     sidle, standing in the sidle zone Trav_y_curtain (x 1..5, 0.84 m wide); Spawn_undermere_far_y (8, -10, 0).

export const TINY_INDEX_URL = 'http://walk.test/caves/walk-index.json';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A 4 x 4 RGB PNG of one colour, as a data URI. */
function pngDataUri(rgb: [number, number, number]): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(4, 0);
  ihdr.writeUInt32BE(4, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const rows: number[] = [];
  for (let y = 0; y < 4; y++) rows.push(0, ...[0, 1, 2, 3].flatMap(() => rgb));
  const png = Buffer.concat([
    PNG_SIG,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.from(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

type Vec3 = [number, number, number];
interface Node {
  name: string;
  translation?: Vec3;
  rotation?: [number, number, number, number];
  mesh?: number;
  children?: number[];
  extras?: Record<string, unknown>;
}

/** A quaternion turning -Z (a spawn's facing) to look along +X (yaw -90 degrees) or -X (yaw 90 degrees). */
const FACE_EAST: [number, number, number, number] = [0, -Math.SQRT1_2, 0, Math.SQRT1_2];
const FACE_WEST: [number, number, number, number] = [0, Math.SQRT1_2, 0, Math.SQRT1_2];

interface AreaSpec {
  id: string;
  name: string;
  floor: [number, number];
  colour: [number, number, number];
  nodes: Node[];
}

/** One area file: Area_<id> holding a textured floor and `nodes`; HM_Collision_<id> the floor's box. */
function glb(spec: AreaSpec): Buffer {
  const g = new BoxGeometry(spec.floor[1] - spec.floor[0], 0.2, 6);
  g.translate((spec.floor[0] + spec.floor[1]) / 2, -10.1, 0);
  const pos = new Float32Array(g.getAttribute('position').array);
  const uv = new Float32Array(g.getAttribute('uv').array);
  const idx = new Uint16Array(g.getIndex()!.array);
  const parts = [Buffer.from(pos.buffer), Buffer.from(uv.buffer), Buffer.from(idx.buffer)];
  const pad = (n: number) => (4 - (n % 4)) % 4;
  const views: { buffer: 0; byteOffset: number; byteLength: number }[] = [];
  let offset = 0;
  for (const p of parts) {
    views.push({ buffer: 0, byteOffset: offset, byteLength: p.length });
    offset += p.length + pad(p.length);
  }
  const bin = Buffer.concat(parts.flatMap((p) => [p, Buffer.alloc(pad(p.length))]));
  g.computeBoundingBox();
  const { min, max } = g.boundingBox!;
  const count = pos.length / 3;
  const nodes: Node[] = [
    { name: `Floor_${spec.id}`, mesh: 0 },
    ...spec.nodes,
    {
      name: `Area_${spec.id}`,
      children: [],
      extras: { wdi_area: spec.id, wdi_name: spec.name, wdi_indoor: true },
    },
    { name: `HM_Collision_${spec.id}`, mesh: 1, extras: { wdi_collision: true } },
  ];
  const areaNode = nodes.length - 2;
  nodes[areaNode]!.children = nodes.slice(0, areaNode).map((_, i) => i);
  const json = {
    asset: { version: '2.0', generator: 'apps/walk/test/helpers/tiny-areas.ts' },
    scene: 0,
    scenes: [{ nodes: [areaNode, areaNode + 1] }],
    nodes,
    meshes: [
      { primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] },
      { primitives: [{ attributes: { POSITION: 0 }, indices: 2 }] },
    ],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 } }],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{}],
    images: [{ uri: pngDataUri(spec.colour) }],
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: 'VEC3', min: min.toArray(), max: max.toArray() },
      { bufferView: 1, componentType: 5126, count, type: 'VEC2' },
      { bufferView: 2, componentType: 5123, count: idx.length, type: 'SCALAR' },
    ],
    bufferViews: views,
    buffers: [{ byteLength: bin.length }],
  };
  let text = Buffer.from(JSON.stringify(json), 'utf8');
  text = Buffer.concat([text, Buffer.alloc(pad(text.length), 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + bin.length, 8);
  const chunk = (type: number, data: Buffer) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.writeUInt32LE(type, 4);
    return Buffer.concat([h, data]);
  };
  return Buffer.concat([header, chunk(0x4e4f534a, text), chunk(0x004e4942, bin)]);
}

const spawn = (id: string, at: Vec3, east: boolean, extras: Record<string, unknown> = {}): Node => ({
  name: `Spawn_${id}`,
  translation: at,
  rotation: east ? FACE_EAST : FACE_WEST,
  extras: { wdi_district: 'The Undermere', ...extras },
});
const portal = (name: string, at: Vec3, to: string, toSpawn: string, kind: string, extra = {}): Node => ({
  name: `Portal_${name}`,
  translation: at,
  extras: { to, toSpawn, kind, ...extra },
});
const seam = { wdi_seam: 'xy', wdi_seam_kind: 'curtain', wdi_width_m: 2 };

const X: AreaSpec = {
  id: 'under_x',
  name: 'The Undermere, near cave',
  floor: [-10, 0],
  colour: [70, 90, 120],
  nodes: [
    spawn('undermere_mouth_x', [-8, -10, 0], true, { wdi_spawn: 'X cave mouth' }),
    portal('um.x_out', [-9.5, -10, 0], 'overworld', 'mouth_x', 'cave_mouth'),
    portal('seam_xy_a_1', [-0.45, -10, 0], 'undermere', 'seam_xy_b_1', 'gate', seam),
    spawn('undermere_seam_xy_a_1', [-1.65, -10, 0], false, {
      wdi_spawn: 'Curtain, arrival 1',
      wdi_picker: false,
    }),
  ],
};

const Y: AreaSpec = {
  id: 'under_y',
  name: 'The Undermere, far cave',
  floor: [0, 10],
  colour: [120, 100, 80],
  nodes: [
    portal('seam_xy_b_1', [0.45, -10, 0], 'undermere', 'seam_xy_a_1', 'gate', seam),
    spawn('undermere_seam_xy_b_1', [1.65, -10, 0], true, {
      wdi_spawn: 'Curtain, arrival 1',
      wdi_picker: false,
      wdi_mode: 'sidle',
    }),
    spawn('undermere_far_y', [8, -10, 0], true, { wdi_spawn: 'Far end' }),
    {
      name: 'Trav_y_curtain',
      translation: [3, -8.75, 0],
      extras: { wdi_traverse: 'sidle', size: [4, 2.5, 0.84] },
    },
  ],
};

export interface TinyWorld {
  /** Address to bytes: the index and the two files, at their addresses under TINY_INDEX_URL's folder. */
  files: Map<string, Buffer>;
  /** The index as JSON (parse it with parseIndex). */
  index: Record<string, unknown>;
}

function indexEntry(spec: AreaSpec, file: string, bytes: Buffer): Record<string, unknown> {
  const spawns = spec.nodes
    .filter((n) => n.name.startsWith('Spawn_'))
    .map((n) => {
      const id = n.name.slice('Spawn_'.length);
      const x = n.extras ?? {};
      const name = typeof x.wdi_spawn === 'string' ? x.wdi_spawn : id;
      return {
        id,
        label: `${name} (The Undermere)`,
        name,
        group: 'The Undermere',
        position: n.translation,
        yaw_deg: n.rotation === FACE_EAST ? -90 : 90,
        ...(x.wdi_picker === false ? { picker: false } : {}),
      };
    });
  const portals = spec.nodes
    .filter((n) => n.name.startsWith('Portal_'))
    .map((n) => {
      const portalId = n.name.slice('Portal_'.length);
      const x = n.extras as { to: string; toSpawn: string; kind: string; wdi_seam?: string };
      const target = x.to === 'undermere' ? (x.toSpawn.endsWith('_b_1') ? 'under_y' : 'under_x') : null;
      return {
        id: portalId.replace(/\./g, ''),
        portal_id: portalId,
        position: n.translation,
        to: x.to,
        toSpawn: x.toSpawn,
        kind: x.kind,
        target_area: target,
        ...(x.wdi_seam ? { seam: x.wdi_seam } : {}),
      };
    });
  return {
    file,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    kind: 'cave',
    scene: 'undermere',
    name: spec.name,
    indoor: true,
    baked: false,
    walk_region_xy: [spec.floor[0], -3, spec.floor[1], 3],
    look: {},
    spawns,
    portals,
    // Fields this viewer does not read are ignored (section 3).
    stats: { images: 1 },
  };
}

/** Builds the tiny world: two .glb files and the index that lists them. */
export function tinyWorld(): TinyWorld {
  const x = glb(X);
  const y = glb(Y);
  const index = {
    format: 1,
    world: 'tiny',
    axes: 'glTF world axes',
    start: 'undermere_mouth_x',
    areas: {
      under_x: indexEntry(X, 'walk-under_x.glb', x),
      under_y: indexEntry(Y, 'walk-under_y.glb', y),
    },
    scenes: { undermere: ['under_x', 'under_y'] },
    seams: [{ id: 'xy', kind: 'curtain', width_m: 2, a: 'under_x', b: 'under_y', portals: 1 }],
    pending: ['overworld'],
    walk_scenes: {
      undermere: { name: 'The Undermere', kind: 'cave', area_prefix: 'under_', portal_ns: 'um' },
    },
  };
  const folder = new URL('.', TINY_INDEX_URL).href;
  const files = new Map<string, Buffer>([
    [TINY_INDEX_URL, Buffer.from(JSON.stringify(index, null, 2))],
    [`${folder}walk-under_x.glb`, x],
    [`${folder}walk-under_y.glb`, y],
  ]);
  return { files, index };
}
