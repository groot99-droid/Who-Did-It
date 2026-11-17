// check_areas.mjs: checks a folder of area files and its walk-index.json against docs/walk-areas.md (version 1),
// with the walk viewer's OWN code: findSpawns, pickSpawn (spawn.ts), findPortals, resolvePortal, PortalTrigger
// (portals.ts).
//
//   node check_areas.mjs <folder with walk-index.json> --src <path to apps/walk/src> [--three <path to the three package>] [--json out.json]
//
// --src    a checkout of the viewer's source folder apps/walk/src (branch claude/v2-walk). Required: without it this
//          script stops with a message. Nothing is installed and nothing in that folder is changed.
// --three  optional: the real three.js package (for example apps/walk/node_modules/three). Files that are not
//          Draco-compressed are then also parsed by the real GLTFLoader and compared with the stand-in.
//
// How the viewer's TypeScript runs here: Node removes the types (node:module stripTypeScriptTypes). Node cannot
// remove "constructor(private readonly x ...)", so that one form is first written out as "this.x = x" lines, and the
// import of 'three' is pointed at three_standin.mjs (or at the real package). Nothing else is changed; the script says
// how many lines it rewrote.
//
// It reads .gltf and .glb. Draco data is never decoded, so the checks that need triangles (spawns stand on the ground;
// a seam's wall is closed and 3 m high; the rest of a village section's edge is closed too) run only on files whose
// collision mesh is not compressed: the fixture.
// Every line starts with PASS, FAIL, NOTE or CTRL. CTRL is a control: a deliberately wrong way of doing things, shown
// to go wrong. A file or an index that cannot be read is a FAIL line (<file>.readable, index.readable), not a trace.
// Exit code: 0 no rule failed, 1 at least one FAIL, 2 the command could not run.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// ------------------------------------------------------------------------------------------------ the command line
const argv = process.argv.slice(2);
const opts = { dir: null, src: null, three: null, json: null };
for (let k = 0; k < argv.length; k++) {
  if (argv[k] === '--src') opts.src = argv[++k];
  else if (argv[k] === '--three') opts.three = argv[++k];
  else if (argv[k] === '--json') opts.json = argv[++k];
  else if (!argv[k].startsWith('--') && !opts.dir) opts.dir = argv[k];
}
const stop = (text) => {
  console.error(text);
  process.exit(2);
};
if (!opts.dir)
  stop(
    'usage: node check_areas.mjs <folder with walk-index.json> --src <path to apps/walk/src> [--three <path to three>] [--json out.json]',
  );

const defaultSrc = resolve(here, '../../../apps/walk/src');
const src = opts.src ? resolve(opts.src) : existsSync(join(defaultSrc, 'spawn.ts')) ? defaultSrc : null;
if (!src || !existsSync(join(src, 'spawn.ts')) || !existsSync(join(src, 'portals.ts'))) {
  stop(
    [
      "check_areas.mjs runs the walk viewer's own code and cannot find it.",
      'It needs the folder apps/walk/src of the viewer (its files spawn.ts and portals.ts). The viewer lives on branch claude/v2-walk.',
      `  looked in: ${src ?? '(no --src was given, and apps/walk/src is not in this checkout)'}`,
      'Give it a checkout of that branch, for example:',
      '  git worktree add ../walk-viewer origin/claude/v2-walk',
      '  node tools/blender/walk_areas/check_areas.mjs <folder> --src ../walk-viewer/apps/walk/src',
      'Nothing is installed and nothing in that folder is changed. walk_index.py checks most of the rules without the viewer.',
    ].join('\n'),
  );
}
if (typeof nodeModule.stripTypeScriptTypes !== 'function')
  stop(
    `check_areas.mjs needs Node 22.13 or newer (it uses node:module stripTypeScriptTypes); this is ${process.version}.`,
  );

// ------------------------------------------------------------------------------------------------ three: the stand-in or the real one
let threeUrl = pathToFileURL(join(here, 'three_standin.mjs')).href;
let GLTFLoader = null;
if (opts.three) {
  const pkg = resolve(opts.three),
    build = join(pkg, 'build', 'three.module.js'),
    loaderFile = join(pkg, 'examples', 'jsm', 'loaders', 'GLTFLoader.js');
  if (!existsSync(build) || !existsSync(loaderFile))
    stop(
      `--three ${opts.three}: build/three.module.js and examples/jsm/loaders/GLTFLoader.js were not found there. Give the folder of the three package (a node_modules/three).`,
    );
  globalThis.self ??= globalThis; // GLTFLoader looks for these in a browser
  globalThis.ProgressEvent ??= class extends Event {
    constructor(type, init = {}) {
      super(type);
      Object.assign(this, init);
    }
  };
  globalThis.createImageBitmap ??= async () => ({ width: 4, height: 4, close() {} });
  threeUrl = pathToFileURL(build).href;
  ({ GLTFLoader } = await import(pathToFileURL(loaderFile).href));
}
const THREE = await import(threeUrl);
const { Object3D, Vector3 } = THREE;

// ------------------------------------------------------------------------------------------------ the viewer's own two files
/** "constructor(private readonly a: T, readonly b = 1) {" becomes "constructor(a: T, b = 1) { this.a = a; this.b = b;". */
function writeOutParameterProperties(ts) {
  let out = ts,
    count = 0,
    from = 0;
  for (;;) {
    const at = out.indexOf('constructor(', from);
    if (at < 0) break;
    let depth = 0,
      end = -1;
    for (let k = at + 'constructor'.length; k < out.length; k++) {
      if (out[k] === '(') depth++;
      else if (out[k] === ')' && --depth === 0) {
        end = k;
        break;
      }
    }
    if (end < 0) break;
    const parts = [];
    let d = 0,
      cur = '';
    const params = out.slice(at + 'constructor('.length, end);
    for (let k = 0; k < params.length; k++) {
      const ch = params[k];
      if ('([{<'.includes(ch)) d++;
      else if (')]}'.includes(ch) || (ch === '>' && params[k - 1] !== '=')) d--;
      if (ch === ',' && d === 0) {
        parts.push(cur);
        cur = '';
      } else cur += ch;
    }
    if (cur.trim()) parts.push(cur);
    const names = [];
    const cleaned = parts.map((p) => {
      const m = p.match(/^(\s*)((?:(?:public|private|protected|readonly|override)\s+)+)([A-Za-z_$][\w$]*)/);
      if (!m) return p;
      names.push(m[3]);
      return m[1] + m[3] + p.slice(m[0].length);
    });
    if (names.length) {
      const brace = out.indexOf('{', end);
      out = `${out.slice(0, at)}constructor(${cleaned.join(',')}${out.slice(end, brace + 1)}${names.map((n) => ` this.${n} = ${n};`).join('')}${out.slice(brace + 1)}`;
      count += names.length;
    }
    from = at + 'constructor('.length;
  }
  return { text: out, count };
}
const rewrites = [];
async function loadViewerFile(file) {
  const { text, count } = writeOutParameterProperties(readFileSync(join(src, file), 'utf8'));
  let js;
  try {
    js = nodeModule.stripTypeScriptTypes(text, { mode: 'strip' });
  } catch (e) {
    stop(
      `${file}: Node could not remove the TypeScript types (${String(e.message).split('\n')[0]}). The file uses a form this script does not rewrite; see the comment at the top of check_areas.mjs.`,
    );
  }
  const others = [...js.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]).filter((s) => s !== 'three');
  if (others.length)
    stop(
      `${file} now imports ${others.join(', ')}. check_areas.mjs runs spawn.ts and portals.ts on their own and knows only their import of 'three'; it has to be taught the new import.`,
    );
  rewrites.push(`${file}: ${count} constructor parameter${count === 1 ? '' : 's'} written out`);
  js = js.replace(/\bfrom\s+(['"])three\1/g, `from ${JSON.stringify(threeUrl)}`);
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}
const emit = process.emitWarning; // the type remover is marked experimental: keep that one line out of the report
process.emitWarning = (w, ...rest) =>
  String(w?.message ?? w).includes('stripTypeScriptTypes') ? undefined : emit.call(process, w, ...rest);
const { findSpawns, pickSpawn, plainWords } = await loadViewerFile('spawn.ts');
const { findPortals, resolvePortal, PortalTrigger } = await loadViewerFile('portals.ts');

// ------------------------------------------------------------------------------------------------ the numbers of the contract (section 6)
const SEAM = {
  portalToWall: 0.45,
  arrivalInside: 1.65,
  arrivalBeyond: 2.1,
  gapMax: 1.8,
  endGapMax: 1.0,
  lateralMax: 0.1,
  yawMax: 15,
  arrivalClearMin: 1.2, // from EVERY portal of the arrival's file, its return row too
  rowClearMin: 2.0, // no portal outside a seam's row stands this close to a point of it (two 1 m discs)
  heightMax: 0.15, // the two files put the ground at the seam line at the same height, within this
  wallHeight: 3.0,
  tol: 0.05,
  widthMax: 100, // not a rule of the contract: this script does not sample an opening wider than this (a typo such as 5000 for 5 would keep it busy for minutes)
};
// The closed edge of a village section (docs/walk-areas.md, section 4). Metres.
const EDGE = {
  step: 0.25, // the edge is sampled this often (a gap the walker's capsule, 0.6 m across, fits through is wider)
  corner: 0.3, // ... but not within this of a corner of the outline (see checkEdge)
  inside: 0.5, // a ray starts this far inside the edge ...
  faceTol: 0.3, // ... and must meet a wall whose face is within this of the edge (the walker's radius)
  reach: 3, // how far a ray looks
  maxLength: 100000, // an edge longer than this is not sampled: it is no village section
};
const SEAM_KINDS = ['gate', 'level_crossing', 'footbridge', 'lychgate', 'stile', 'cutting', 'belt_gate'];
const CAPSULE = 0.3; // the walker's radius, apps/walk/src/config.ts WALK.radius
const RADIUS = new PortalTrigger([]).radius; // the viewer's own walk-in radius (1 m)
const WAY_BACK_FAR = 10; // a note: a room's way out arrives farther than this from the door that leads in
// Extras the viewer reads from the glTF SCENE (world.ts fogFromExtras, look.ts exposureFromScene). An area file has
// none of them there: its look is on its Area node. Scene-level fog is the harmful one: it makes the background flat
// and hides the sky (main.ts lines 121-123). A scene exposure is read only when the Area has none (main.ts lines
// 125-126), so it changes nothing while the Area has one; it is kept off as a precaution.
const SCENE_LOOK_KEYS = [
  'fog_color',
  'fog_density',
  'fog_near',
  'fog_far',
  'wdi_exposure',
  'tone_mapping_exposure',
  'toneMappingExposure',
  'exposure',
];
// What an area file may REQUIRE: an allow-list chosen by the contract (the same list as walk_index.py's
// EXTENSIONS_ALLOWED; docs/walk-areas.md, section 4). It is not the list of what the viewer's loader reads: three.js's
// GLTFLoader reads more (r160: clearcoat, ior, sheen, specular, transmission, iridescence, anisotropy, volume,
// EXT_materials_bump, EXT_texture_avif) and, for an extension it does not know that a file requires, only prints a
// warning. To allow another extension, add its name here, in walk_index.py and in section 4 of the contract, once the
// viewer's author has tried a file that needs it.
const EXTENSIONS_ALLOWED = [
  'KHR_draco_mesh_compression',
  'EXT_texture_webp',
  'KHR_texture_transform',
  'KHR_lights_punctual',
  'EXT_mesh_gpu_instancing',
  'KHR_materials_emissive_strength',
  'KHR_materials_unlit',
  'EXT_meshopt_compression',
  'KHR_texture_basisu',
  'KHR_mesh_quantization',
];
// node names as they are written in the file (docs/walk-areas.md, section 2)
const RAW_NAME = {
  area: /^Area_[a-z][a-z0-9_]*$/,
  collision: /^HM_Collision(_[a-z][a-z0-9_]*)?$/,
  spawn: /^Spawn_[a-z0-9_]+$/,
  portal: /^Portal_[a-z0-9_]+(\.[a-z0-9_]+)*$/,
};

// ------------------------------------------------------------------------------------------------ results
const results = [];
const check = (id, ok, detail = '') => {
  results.push({ status: ok ? 'PASS' : 'FAIL', id, detail });
  return ok;
};
const note = (id, detail) => results.push({ status: 'NOTE', id, detail });
const control = (id, detail) => results.push({ status: 'CTRL', id, detail });
const tally = (s) => results.filter((r) => r.status === s).length;
/** Prints every result line. `tail` lines follow them, before the totals. */
function report(tail = []) {
  for (const r of results) console.log(`${r.status}  ${r.id}  ${r.detail}`);
  for (const l of tail) console.log(l);
  console.log(
    `--- ${tally('PASS')} pass, ${tally('FAIL')} fail, ${tally('NOTE')} notes, ${tally('CTRL')} controls`,
  );
}
// Whatever goes wrong inside this script ends as one FAIL line and exit code 1: never a pass, never a bare trace.
process.on('uncaughtException', (e) => {
  if (process.env.CHECK_AREAS_TRACE) console.error(e);
  results.push({
    status: 'FAIL',
    id: 'checker.internal',
    detail: `check_areas.mjs itself stopped before it finished (${e?.name ?? 'Error'}: ${String(e?.message ?? e).split('\n')[0]}). Set CHECK_AREAS_TRACE=1 to see the trace`,
  });
  report();
  process.exit(1);
});
const f2 = (v, d = 2) => v.toFixed(d);
const deg = (r) => (r * 180) / Math.PI;
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ------------------------------------------------------------------------------------------------ reading a .gltf or .glb
function readGltf(path) {
  const data = readFileSync(path);
  if (path.toLowerCase().endsWith('.gltf')) {
    const json = JSON.parse(data.toString('utf8'));
    const uri = json.buffers?.[0]?.uri;
    return {
      json,
      bin: uri?.startsWith('data:') ? Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64') : null,
      data,
    };
  }
  let off = 12,
    json = null,
    bin = null;
  while (off + 8 <= data.length) {
    const len = data.readUInt32LE(off),
      type = data.toString('latin1', off + 4, off + 8);
    if (type === 'JSON') json = JSON.parse(data.toString('utf8', off + 8, off + 8 + len));
    else if (type.startsWith('BIN')) bin = data.subarray(off + 8, off + 8 + len);
    off += 8 + len;
  }
  return { json, bin, data };
}
const COMPONENT = {
  5120: [Int8Array, 1],
  5121: [Uint8Array, 1],
  5122: [Int16Array, 2],
  5123: [Uint16Array, 2],
  5125: [Uint32Array, 4],
  5126: [Float32Array, 4],
};
const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function accessorData(g, i) {
  const a = g.json.accessors[i],
    bv = g.json.bufferViews[a.bufferView];
  const [T, size] = COMPONENT[a.componentType];
  const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return new T(new Uint8Array(g.bin.subarray(start, start + a.count * NCOMP[a.type] * size)).buffer); // an aligned copy
}
function collisionTriangles(g, node) {
  const tris = [];
  for (const p of g.json.meshes[node.mesh].primitives) {
    const P = accessorData(g, p.attributes.POSITION),
      I = p.indices !== undefined ? accessorData(g, p.indices) : null;
    const n = I ? I.length : P.length / 3;
    for (let t = 0; t + 2 < n; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => (I ? I[t + k] : t + k) * 3);
      tris.push([P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2], P[c], P[c + 1], P[c + 2]]);
    }
  }
  return tris;
}
/** Distance along a ray (origin o, unit direction d) to the nearest triangle within tmax, or null. */
function rayFirstHit(tris, o, d, tmax) {
  let best = null;
  for (const [ax, ay, az, bx, by, bz, cx, cy, cz] of tris) {
    const e1 = [bx - ax, by - ay, bz - az],
      e2 = [cx - ax, cy - ay, cz - az];
    const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
    const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
    if (Math.abs(det) < 1e-12) continue;
    const t0 = [o[0] - ax, o[1] - ay, o[2] - az];
    const u = (t0[0] * p[0] + t0[1] * p[1] + t0[2] * p[2]) / det;
    if (u < -1e-9 || u > 1 + 1e-9) continue;
    const q = [t0[1] * e1[2] - t0[2] * e1[1], t0[2] * e1[0] - t0[0] * e1[2], t0[0] * e1[1] - t0[1] * e1[0]];
    const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
    if (v < -1e-9 || u + v > 1 + 1e-9) continue;
    const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
    if (t > 1e-9 && t <= tmax && (best === null || t < best)) best = t;
  }
  return best;
}
const CELL = 4; // metres: the cell of TriGrid
const MANY_CELLS = 4096; // a triangle that covers more cells than this is kept apart and tested by every ray
/** The triangles of a collision mesh sorted into 4 m cells of the ground plan (x, z), so that a ray tests only the
 * triangles near it. It changes how long a rule takes, never what it finds: the closed-edge rule casts thousands of
 * rays, and a real section's collision has up to 150,000 triangles. */
class TriGrid {
  constructor(tris) {
    this.cells = new Map();
    this.many = [];
    this.top = -Infinity;
    this.bottom = Infinity;
    for (const t of tris) {
      this.top = Math.max(this.top, t[1], t[4], t[7]);
      this.bottom = Math.min(this.bottom, t[1], t[4], t[7]);
      const [i0, i1] = [Math.min, Math.max].map((f) => Math.floor(f(t[0], t[3], t[6]) / CELL));
      const [k0, k1] = [Math.min, Math.max].map((f) => Math.floor(f(t[2], t[5], t[8]) / CELL));
      if ((i1 - i0 + 1) * (k1 - k0 + 1) > MANY_CELLS) {
        this.many.push(t);
        continue;
      }
      for (let i = i0; i <= i1; i++)
        for (let k = k0; k <= k1; k++) {
          const key = `${i},${k}`;
          if (!this.cells.has(key)) this.cells.set(key, []);
          this.cells.get(key).push(t);
        }
    }
  }
  /** What rayFirstHit gives for the same ray over every triangle. */
  firstHit(o, d, tmax) {
    const [ex, ez] = [o[0] + d[0] * tmax, o[2] + d[2] * tmax];
    const [i0, i1] = [Math.min, Math.max].map((f) => Math.floor(f(o[0], ex) / CELL));
    const [k0, k1] = [Math.min, Math.max].map((f) => Math.floor(f(o[2], ez) / CELL));
    const near = [...this.many];
    for (let i = i0; i <= i1; i++)
      for (let k = k0; k <= k1; k++) for (const t of this.cells.get(`${i},${k}`) ?? []) near.push(t);
    return rayFirstHit(near, o, d, tmax);
  }
}

// ------------------------------------------------------------------------------------------------ the node tree, named as GLTFLoader names it
// three.js keeps one table of names for the whole file (GLTFParser.createUniqueName and
// PropertyBinding.sanitizeNodeName; read in r160's source and measured with r160; the viewer pins 0.186.1, not run).
// The scene's name is taken first; then the nodes, depth first, each node's own name before the name of the camera
// and of the light definition it holds (a light with no name is light_<index>); a name already taken gets _1, _2 ...
// Mesh names are taken after every node name, so they never change a node's.
const sanitize = (name) => name.replace(/\s/g, '_').replace(/[[\].:/]/g, '');
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNumbers = (v, n) => Array.isArray(v) && v.length === n && v.every((q) => Number.isFinite(q));
/** What three.js's Matrix4.decompose gives for a glTF node matrix (16 numbers, column-major): the position, the
 * rotation as a quaternion [x, y, z, w], and the scale. */
function decomposeMatrix(m) {
  let sx = Math.hypot(m[0], m[1], m[2]);
  const sy = Math.hypot(m[4], m[5], m[6]),
    sz = Math.hypot(m[8], m[9], m[10]);
  const det =
    m[0] * (m[5] * m[10] - m[9] * m[6]) -
    m[4] * (m[1] * m[10] - m[9] * m[2]) +
    m[8] * (m[1] * m[6] - m[5] * m[2]);
  if (det < 0) sx = -sx; // a mirrored matrix: one scale is inverted
  const [m11, m21, m31] = [m[0] / sx, m[1] / sx, m[2] / sx],
    [m12, m22, m32] = [m[4] / sy, m[5] / sy, m[6] / sy],
    [m13, m23, m33] = [m[8] / sz, m[9] / sz, m[10] / sz];
  let q;
  if (m11 + m22 + m33 > 0) {
    const s = 0.5 / Math.sqrt(m11 + m22 + m33 + 1);
    q = [(m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s];
  } else if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    q = [0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s];
  } else if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    q = [(m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    q = [(m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s];
  }
  return { position: [m[12], m[13], m[14]], quaternion: q, scale: [sx, sy, sz] };
}
/** The optional outline wdi_walk_polygon as [[x, y], ...], or null. Three forms are read (docs/walk-areas.md, section
 * 4): a flat list of numbers [x0, y0, x1, y1, ...], which is what a Blender custom property can hold; the same list
 * of points as a JSON string, which is how today's exporter writes nested data (wdi_look_json); and a list of [x, y]
 * pairs, which a writer that is not Blender may use. */
function walkPolygon(raw) {
  let p = raw;
  if (typeof p === 'string') {
    try {
      p = JSON.parse(p);
    } catch {
      return null;
    }
  }
  if (Array.isArray(p) && p.length >= 6 && p.length % 2 === 0 && p.every((v) => Number.isFinite(v)))
    p = Array.from({ length: p.length / 2 }, (_, k) => [p[2 * k], p[2 * k + 1]]);
  return Array.isArray(p) && p.length >= 3 && p.every((q) => isNumbers(q, 2)) ? p : null;
}
/** Throws, in plain words, when the JSON is not shaped like glTF where this script walks it. */
function buildGraph(json) {
  if (!isObject(json)) throw new Error('its JSON part is not an object');
  if (!Array.isArray(json.nodes) || !json.nodes.every(isObject)) throw new Error('it has no list of nodes');
  if (!Array.isArray(json.scenes) || json.scenes.length === 0 || !json.scenes.every(isObject))
    throw new Error('it has no list of scenes');
  const sceneDef = json.scenes[json.scene ?? 0];
  if (!sceneDef) throw new Error('its default scene is not one of its scenes');
  const nodeNumbers = (v, what) => {
    if (!Array.isArray(v) || !v.every((c) => Number.isInteger(c) && c >= 0 && c < json.nodes.length))
      throw new Error(`${what} is not a list of node numbers`);
    return v;
  };
  const used = new Map(),
    renamed = [],
    sunNodes = [],
    seen = new Set(),
    seenLight = new Set(),
    seenCamera = new Set();
  const lights = json.extensions?.KHR_lights_punctual?.lights ?? [],
    cameras = json.cameras ?? [];
  const unique = (raw) => {
    const s = sanitize(raw);
    if (used.has(s)) {
      used.set(s, used.get(s) + 1);
      return `${s}_${used.get(s)}`;
    }
    used.set(s, 0);
    return s;
  };
  const scene = new Object3D();
  if (typeof sceneDef.name === 'string' && sceneDef.name) scene.name = unique(sceneDef.name);
  // three.js copies extras only when they are an object; so does this
  if (isObject(sceneDef.extras)) Object.assign(scene.userData, structuredClone(sceneDef.extras));
  const make = (i) => {
    if (seen.has(i))
      throw new Error(`node ${i} is reached twice: the node tree loops or a node has two parents`);
    seen.add(i);
    const n = json.nodes[i],
      o = new Object3D(),
      label = `node ${i} (${n.name ?? 'no name'})`;
    if (typeof n.name === 'string' && n.name) {
      o.name = unique(n.name);
      o.userData.name = n.name;
      if (o.name !== sanitize(n.name)) renamed.push([n.name, o.name]);
    }
    if (Number.isInteger(n.camera) && cameras[n.camera] && !seenCamera.has(n.camera)) {
      seenCamera.add(n.camera);
      if (typeof cameras[n.camera].name === 'string' && cameras[n.camera].name)
        unique(cameras[n.camera].name);
    }
    const li = n.extensions?.KHR_lights_punctual?.light;
    if (Number.isInteger(li) && isObject(lights[li])) {
      if (!seenLight.has(li)) {
        seenLight.add(li);
        unique(typeof lights[li].name === 'string' && lights[li].name ? lights[li].name : `light_${li}`);
      }
      if (lights[li].type === 'directional') sunNodes.push(n.name ?? '(no name)');
    }
    for (const [key, size] of [
      ['translation', 3],
      ['rotation', 4],
      ['scale', 3],
      ['matrix', 16],
    ])
      if (key in n && !isNumbers(n[key], size))
        throw new Error(`the ${key} of ${label} is not ${size} numbers`);
    if ('mesh' in n && !(Number.isInteger(n.mesh) && isObject(json.meshes?.[n.mesh])))
      throw new Error(`the mesh of ${label} is not one of the file's meshes`);
    if (n.matrix) {
      // legal glTF, and what GLTFLoader reads first: a matrix, and then no translation, rotation or scale
      const d = decomposeMatrix(n.matrix);
      o.position.set(...d.position);
      o.quaternion.set(...d.quaternion);
      o.scale.set(...d.scale);
    } else {
      if (n.translation) o.position.set(...n.translation);
      if (n.rotation) o.quaternion.set(...n.rotation);
      if (n.scale) o.scale.set(...n.scale);
    }
    if (isObject(n.extras)) Object.assign(o.userData, structuredClone(n.extras));
    o.userData.gltfIndex = i;
    for (const c of nodeNumbers(n.children ?? [], `the children of ${label}`)) o.add(make(c));
    return o;
  };
  for (const r of nodeNumbers(sceneDef.nodes ?? [], "the scene's list of root nodes")) scene.add(make(r));
  scene.updateWorldMatrix(true, true);
  // A name with a reserved prefix on something that is not a node. three.js can add an object of that name to the
  // scene (measured with r160: a light definition or a camera Spawn_x on a node that also holds a mesh; a mesh
  // Spawn_x of two primitives; the scene itself), and the viewer would take it for a spawn or an Area. A mesh may be
  // named so only when three.js gives its object the node's name: one primitive, and every node that holds it has a
  // name and no camera or light (today's collision meshes).
  const reserved = (name) =>
    typeof name === 'string' && /^(Area_|HM_Collision|Spawn_|Portal_)/.test(sanitize(name));
  const elsewhere = [];
  if (reserved(sceneDef.name)) elsewhere.push(`the scene ${JSON.stringify(sceneDef.name)}`);
  for (const [k, c] of cameras.entries())
    if (isObject(c) && reserved(c.name)) elsewhere.push(`camera ${k} ${JSON.stringify(c.name)}`);
  for (const [k, d] of lights.entries())
    if (isObject(d) && reserved(d.name)) elsewhere.push(`light definition ${k} ${JSON.stringify(d.name)}`);
  for (const [k, m] of (Array.isArray(json.meshes) ? json.meshes : []).entries()) {
    if (!isObject(m) || !reserved(m.name)) continue;
    const holders = json.nodes.filter((n) => n.mesh === k);
    const plain =
      Array.isArray(m.primitives) &&
      m.primitives.length === 1 &&
      holders.every(
        (n) => typeof n.name === 'string' && n.name && !('camera' in n) && !n.extensions?.KHR_lights_punctual,
      );
    if (!plain) elsewhere.push(`mesh ${k} ${JSON.stringify(m.name)}`);
  }
  return {
    scene,
    renamed,
    sunNodes,
    reservedElsewhere: elsewhere,
    sceneExtras: isObject(sceneDef.extras) ? sceneDef.extras : {},
  };
}
const worldPos = (o) => new Vector3().setFromMatrixPosition(o.matrixWorld);
/** The point (3000 + 600 i, 3000 + 600 j) m of the old single file's far grid that lies inside a plan rectangle
 * [x0, y0, x1, y1], or null. */
const slotIn = ([x0, y0, x1, y1]) => {
  const next = (v) => 3000 + 600 * Math.max(0, Math.ceil((v - 3000) / 600 - 1e-9));
  return next(x0) <= x1 + 1e-6 && next(y0) <= y1 + 1e-6 ? [next(x0), next(y0)] : null;
};
/** The distance on the ground plan between two positions, or null when they are more than 2 m apart in height: the
 * viewer's trigger does not see a portal that far above or below the player (portals.ts, PortalTrigger.nearest). */
const planGap = (a, b) => (Math.abs(a.y - b.y) > 2 ? null : Math.hypot(a.x - b.x, a.z - b.z));
const hasTransform = (n) => {
  if (n.matrix) return n.matrix.some((v, k) => Math.abs(v - (k % 5 === 0 ? 1 : 0)) > 1e-9);
  return (
    (n.translation ?? [0, 0, 0]).some((v) => Math.abs(v) > 1e-9) ||
    (n.rotation ?? [0, 0, 0, 1]).some((v, k) => Math.abs(v - (k === 3 ? 1 : 0)) > 1e-9) ||
    (n.scale ?? [1, 1, 1]).some((v) => Math.abs(v - 1) > 1e-9)
  );
};

// ------------------------------------------------------------------------------------------------ the index and the files
const dir = resolve(opts.dir);
if (!existsSync(join(dir, 'walk-index.json')))
  stop(`no walk-index.json in ${opts.dir}. Build one with: python walk_index.py <folder>`);
let index;
try {
  index = JSON.parse(readFileSync(join(dir, 'walk-index.json'), 'utf8'));
  if (!isObject(index)) throw new Error('it is not a JSON object');
  if (!isObject(index.areas ?? {}) || !Object.values(index.areas ?? {}).every(isObject))
    throw new Error('its "areas" is not an object of areas');
  for (const key of ['seams', 'pending'])
    if (key in index && !Array.isArray(index[key])) throw new Error(`its "${key}" is not a list`);
  if (!(index.seams ?? []).every(isObject)) throw new Error('its "seams" holds something that is not a seam');
  for (const [id, A] of Object.entries(index.areas ?? {})) {
    if (typeof A.file !== 'string') throw new Error(`areas.${id}.file is not a file name`);
    for (const key of ['spawns', 'portals'])
      if (!Array.isArray(A[key]) || !A[key].every(isObject))
        throw new Error(`areas.${id}.${key} is not a list`);
    if (!A.spawns.every((s) => isNumbers(s.position, 3)) || !A.portals.every((p) => isNumbers(p.position, 3)))
      throw new Error(`areas.${id} has a spawn or a portal with no position of three numbers`);
  }
} catch (e) {
  check(
    'index.readable',
    false,
    `walk-index.json could not be read as an index: ${String(e.message).split('\n')[0]}`,
  );
  report();
  process.exit(1);
}
check(
  'index.format',
  index.format === 1 && typeof index.axes === 'string' && index.axes.length > 0,
  `format ${index.format}; the axes note is ${typeof index.axes === 'string' ? 'there' : 'missing'}`,
);
const onDisk = readdirSync(dir)
  .filter((f) => /^walk-.+\.(glb|gltf)$/.test(f))
  .sort();
const listed = Object.values(index.areas ?? {})
  .map((a) => a.file)
  .sort();
check(
  'index.areas',
  same(onDisk, listed),
  same(onDisk, listed)
    ? `the index lists the ${onDisk.length} area files`
    : `files in the folder: ${onDisk.join(', ') || 'none'}; files in the index: ${listed.join(', ') || 'none'}`,
);

const loaded = {}; // area id -> everything read from its file
for (const [id, A] of Object.entries(index.areas ?? {})) {
  const path = join(dir, A.file);
  if (!check(`${id}.file`, existsSync(path), A.file)) continue;
  let g, graph;
  try {
    g = readGltf(path);
    graph = buildGraph(g.json);
  } catch (e) {
    // a file that is not glTF where this script reads it is one FAIL line; the other files are still checked
    check(`${A.file}.readable`, false, `could not be read as glTF: ${String(e.message).split('\n')[0]}`);
    continue;
  }
  const { scene, renamed } = graph;
  check(
    `${id}.bytes`,
    statSync(path).size === A.bytes,
    `${statSync(path).size} bytes; the index says ${A.bytes}`,
  );
  check(
    `${id}.sha256`,
    createHash('sha256').update(g.data).digest('hex') === A.sha256,
    'the content hash is the one in the index',
  );
  const L = {
    id,
    A,
    g,
    root: scene,
    renamed,
    real: null,
    sunNodes: graph.sunNodes,
    sceneExtras: graph.sceneExtras,
    reservedElsewhere: graph.reservedElsewhere,
  };
  const draco = (g.json.extensionsUsed ?? []).includes('KHR_draco_mesh_compression');
  if (GLTFLoader && !draco) {
    const parsed = await new GLTFLoader().parseAsync(
      path.toLowerCase().endsWith('.gltf')
        ? g.data.toString('utf8')
        : g.data.buffer.slice(g.data.byteOffset, g.data.byteOffset + g.data.byteLength),
      '',
    );
    parsed.scene.updateWorldMatrix(true, true);
    L.real = parsed.scene;
  }
  // the viewer's own readers; with --three they read what the real GLTFLoader built
  L.spawns = findSpawns(L.real ?? L.root);
  L.portals = findPortals(L.real ?? L.root);
  loaded[id] = L;
}

// ------------------------------------------------------------------------------------------------ rules for one file
for (const [id, L] of Object.entries(loaded)) {
  const { A, g, root } = L,
    j = g.json;
  const base = A.file.replace(/\.(glb|gltf)$/, '');
  check(`${id}.file_name`, base === `walk-${id}`, `${A.file}; the contract's name is walk-${id}.glb`);
  const extRequired = [j.extensionsRequired ?? []].flat().map(String),
    extNotListed = extRequired.filter((e) => !EXTENSIONS_ALLOWED.includes(e));
  check(
    `${id}.extensions`,
    extNotListed.length === 0,
    `required: ${extRequired.join(', ') || 'none'}${extNotListed.length ? `; not on the contract's list of required extensions: ${extNotListed.join(', ')}` : ''}`,
  );
  const extOdd = [j.extensionsUsed ?? []]
    .flat()
    .map(String)
    .filter((e) => !EXTENSIONS_ALLOWED.includes(e));
  if (extOdd.length)
    note(
      `${id}.extensions_used`,
      `used and not on the contract's list (the list limits what a file may require, not what it may use): ${extOdd.join(', ')}`,
    );
  const all = [];
  root.traverse((o) => all.push(o));
  const areaNodes = all.filter((o) => o.name.startsWith('Area_')),
    areaRoots = root.children.filter((o) => o.name.startsWith('Area_'));
  const isColl = (o) => o.name === 'HM_Collision' || o.name.startsWith('HM_Collision_'); // the viewer's rule, world.ts collisionRoots
  const collNodes = all.filter(isColl);
  check(
    `${id}.one_area`,
    areaNodes.length === 1 && areaRoots.length === 1 && areaRoots[0].name === `Area_${id}`,
    `Area nodes in the file: ${areaNodes.map((o) => o.name).join(', ') || 'none'}; at the scene root: ${areaRoots.length}`,
  );
  check(
    `${id}.one_collision`,
    collNodes.length === 1 && collNodes[0].name === `HM_Collision_${id}` && collNodes[0].parent === root,
    `collision nodes: ${collNodes.map((o) => o.name).join(', ') || 'none'}; the contract's name is HM_Collision_${id}`,
  );
  const stray = root.children.filter((o) => o !== areaRoots[0] && !collNodes.includes(o));
  check(
    `${id}.scene_roots`,
    stray.length === 0 && j.scenes.length === 1,
    `${j.scenes.length === 1 ? 'one scene' : `${j.scenes.length} scenes in the file, and an area file holds one`}; scene roots: ${root.children.map((o) => o.name || '(no name)').join(', ')}${stray.length ? '; only the Area and its collision node belong at the root' : ''}`,
  );
  const lookKeys = SCENE_LOOK_KEYS.filter((k) => k in L.sceneExtras);
  check(
    `${id}.scene_extras`,
    lookKeys.length === 0,
    lookKeys.length === 0
      ? `the glTF scene carries no fog or exposure extras (${Object.keys(L.sceneExtras).length ? `its extras: ${Object.keys(L.sceneExtras).sort().join(', ')}` : 'it has no extras'})`
      : `the glTF scene carries ${lookKeys.join(', ')}. The viewer reads fog from the scene for the whole file and then paints a flat background and hides the sky. A scene exposure changes nothing while the Area has its own (the Area's is read first); it is kept off as a precaution. An area's look belongs on its Area node`,
  );
  const area = areaRoots[0],
    coll = collNodes[0];
  L.area = area;
  L.coll = coll;
  if (!area) continue;
  const x = area.userData;
  L.baked = x.wdi_baked === true;
  L.look = Object.fromEntries(
    ['wdi_exposure', 'fog_color', 'fog_density', 'fog_near', 'fog_far']
      .filter((k) => k in x)
      .map((k) => [k, x[k]]),
  );
  if (coll) {
    const cn = j.nodes[coll.userData.gltfIndex],
      prims = cn.mesh !== undefined ? j.meshes[cn.mesh].primitives : [];
    L.collDraco = prims.some((p) => p.extensions?.KHR_draco_mesh_compression);
    check(
      `${id}.collision_form`,
      cn.mesh !== undefined &&
        !hasTransform(cn) &&
        prims.every((p) => p.material === undefined) &&
        coll.children.length === 0 &&
        coll.userData.wdi_collision === true,
      `mesh ${cn.mesh !== undefined}, no transform ${!hasTransform(cn)}, no material ${prims.every((p) => p.material === undefined)}, no children ${coll.children.length === 0}, wdi_collision ${coll.userData.wdi_collision}`,
    );
    if (cn.mesh !== undefined && !L.collDraco && g.bin) {
      try {
        L.triangles = collisionTriangles(g, cn);
      } catch (e) {
        check(
          `${A.file}.readable`,
          false,
          `its collision mesh could not be read (${String(e.message).split('\n')[0]}): the rules that need triangles are left out`,
        );
      }
    }
  }
  const an = j.nodes[area.userData.gltfIndex],
    t = an.translation ?? [0, 0, 0];
  check(
    `${id}.area_at_origin`,
    !hasTransform(an),
    `Area node at glTF (${t.join(', ')})${hasTransform(an) ? "; an area file's coordinates are its own, the Area node carries no transform" : ''}`,
  );
  // a room and a wild area are built around their own origin: the origin lies on the ground the player can walk
  // (the Area's wdi_walk_region; a legacy file without one is measured by the index's rectangle)
  const region = isNumbers(x.wdi_walk_region, 4)
    ? x.wdi_walk_region
    : isNumbers(A.walk_region_xy, 4)
      ? A.walk_region_xy
      : null;
  if ((A.kind === 'room' || A.kind === 'wild') && region) {
    const atHome =
      region[0] - 1e-6 <= 0 && 0 <= region[2] + 1e-6 && region[1] - 1e-6 <= 0 && 0 <= region[3] + 1e-6;
    check(
      `${id}.origin_in_walk_region`,
      atHome,
      atHome
        ? `the file's origin lies inside the walk region x ${region[0]}..${region[2]}, y ${region[1]}..${region[3]}`
        : `the walk region is x ${region[0]}..${region[2]}, y ${region[1]}..${region[3]}, which does not hold the file's origin (0, 0): a ${A.kind === 'room' ? 'room' : 'wild area'} sits at its own origin`,
    );
    const slot = slotIn(region) ?? slotIn([t[0], -t[2], t[0], -t[2]]);
    if (slot)
      note(
        `${id}.slot`,
        `it stands on the far grid of the old single file, around (${slot[0]}, ${slot[1]}) m. Slots are not used for separate files: a room sits at its own origin`,
      );
  }
  // the Area's extras: every missing or wrong one is named
  const missing = [],
    wrong = [];
  const need = (key, ok, why) => {
    if (!(key in x)) missing.push(key);
    else if (!ok) wrong.push(`${key} (${why})`);
  };
  need('wdi_area', x.wdi_area === id, `is ${JSON.stringify(x.wdi_area)}`);
  need(
    'wdi_kind',
    x.wdi_kind === A.kind && ['section', 'room', 'wild'].includes(x.wdi_kind),
    `is ${JSON.stringify(x.wdi_kind)}, the index says ${A.kind}`,
  );
  need(
    'wdi_scene',
    typeof x.wdi_scene === 'string' && x.wdi_scene === A.scene,
    `is ${JSON.stringify(x.wdi_scene)}, the index says ${A.scene}`,
  );
  need('wdi_name', typeof x.wdi_name === 'string' && x.wdi_name !== '', 'must be words');
  const w = x.wdi_walk_region;
  need(
    'wdi_walk_region',
    Array.isArray(w) && w.length === 4 && w.every(isNum) && w[0] < w[2] && w[1] < w[3],
    'must be [x0, y0, x1, y1] with x0 < x1 and y0 < y1',
  );
  need('wdi_exposure', isNum(x.wdi_exposure) && x.wdi_exposure > 0, 'must be a number above 0');
  if ('wdi_walk_polygon' in x && walkPolygon(x.wdi_walk_polygon) === null)
    wrong.push(
      'wdi_walk_polygon (must be three or more points: a flat list [x0, y0, x1, y1, ...], a list of [x, y] pairs, or either of them as a JSON string)',
    );
  const indoor = x.wdi_indoor === true || area.name.startsWith('Area_room_'); // the viewer's rule, world.ts areaLook
  if (A.kind === 'room') need('wdi_indoor', x.wdi_indoor === true, 'a room says true');
  else if (A.kind === 'section' && x.wdi_indoor === true)
    wrong.push('wdi_indoor (a village section is outdoors)');
  if (indoor !== A.indoor) wrong.push(`indoor (the file reads as ${indoor}, the index says ${A.indoor})`);
  if ((x.wdi_baked === true) !== A.baked)
    wrong.push(`wdi_baked (the file says ${x.wdi_baked === true}, the index says ${A.baked})`);
  if (!indoor) {
    const fc = x.fog_color;
    need(
      'fog_color',
      typeof fc === 'string' || (Array.isArray(fc) && fc.length >= 3 && fc.every(isNum)),
      'must be a colour',
    );
    if (!((isNum(x.fog_density) && x.fog_density > 0) || (isNum(x.fog_near) && isNum(x.fog_far))))
      missing.push('fog_density (or fog_near and fog_far)');
  }
  check(
    `${id}.area_extras`,
    missing.length === 0 && wrong.length === 0,
    missing.length === 0 && wrong.length === 0
      ? `all present: wdi_area, wdi_kind, wdi_scene, wdi_name, wdi_walk_region, wdi_exposure${A.kind === 'room' ? ', wdi_indoor' : ', fog'}`
      : `missing: ${missing.join(', ') || 'none'}${wrong.length ? `; wrong: ${wrong.join('; ')}` : ''}`,
  );
  check(
    `${id}.look_matches_index`,
    same(L.look, A.look),
    same(L.look, A.look)
      ? `the index's look is the Area's: ${JSON.stringify(L.look)}`
      : `the file says ${JSON.stringify(L.look)}; the index says ${JSON.stringify(A.look)}`,
  );
  const mine = L.renamed.filter(([raw]) => /^(Area_|HM_Collision|Spawn_|Portal_)/.test(raw));
  check(
    `${id}.names_unique_in_file`,
    mine.length === 0,
    mine.length === 0
      ? 'no Area, collision, spawn or portal name is used twice'
      : `the loader would rename: ${mine.map(([a, b]) => `${a} -> ${b}`).join(', ')}`,
  );
  check(
    `${id}.reserved_names`,
    L.reservedElsewhere.length === 0,
    L.reservedElsewhere.length === 0
      ? 'no scene, camera or light definition is named Area_, HM_Collision, Spawn_ or Portal_ something; no mesh is, but a one-primitive mesh whose node gives the object its own name'
      : `${L.reservedElsewhere.join(', ')}. three.js keeps these names in one table with the node names and can put an object of that name into the scene, which the viewer would take for an Area, a collision mesh, a spawn or a portal`,
  );
  // the names as they are written in the file, before three.js strips anything from them
  const rawOf = (o) => o.userData.name ?? o.name;
  const kindOf = (o) =>
    o.name.startsWith('Area_')
      ? 'area'
      : isColl(o)
        ? 'collision'
        : o.name.startsWith('Spawn_') && o.name.length > 6
          ? 'spawn'
          : o.name.startsWith('Portal_')
            ? 'portal'
            : null;
  const named = all.filter((o) => kindOf(o));
  const odd = named.filter((o) => !RAW_NAME[kindOf(o)].test(rawOf(o))).map((o) => JSON.stringify(rawOf(o)));
  check(
    `${id}.raw_names`,
    odd.length === 0,
    odd.length === 0
      ? `the names of ${named.length} Area, collision, spawn and portal nodes are written with lower-case letters, digits and _ (a portal's id may hold dots)`
      : `written with other characters, which three.js strips or changes without a word: ${odd.join(', ')}. After the prefix a name holds lower-case letters, digits and _; a portal's id may hold dots between them`,
  );
  if (A.kind === 'section')
    check(
      `${id}.no_directional_light`,
      L.sunNodes.length === 0,
      L.sunNodes.length === 0
        ? "no light of the file is directional: the viewer adds the look's moon and sky light, as in every section"
        : `a directional light on ${L.sunNodes.join(', ')}. The viewer adds its own moon and sky light only to a file that has none, so this section would be lit differently from its neighbours`,
    );
  // with --three: the real GLTFLoader and the stand-in must give the viewer the same spawns and portals
  if (L.real) {
    const s2 = findSpawns(root),
      p2 = findPortals(root);
    const sOk =
      s2.length === L.spawns.length &&
      s2.every(
        (s, k) =>
          s.id === L.spawns[k].id &&
          s.position.distanceTo(L.spawns[k].position) < 1e-4 &&
          angDiff(deg(s.yaw), deg(L.spawns[k].yaw)) < 0.01 &&
          s.label === L.spawns[k].label,
      );
    const pOk =
      p2.length === L.portals.length &&
      p2.every(
        (p, k) =>
          p.id === L.portals[k].id &&
          p.position.distanceTo(L.portals[k].position) < 1e-4 &&
          p.to === L.portals[k].to &&
          p.toSpawn === L.portals[k].toSpawn,
      );
    check(
      `${id}.standin_matches_three`,
      sOk && pOk,
      `the real GLTFLoader (three r${THREE.REVISION}) gives ${L.spawns.length} spawns and ${L.portals.length} portals: ${L.spawns.map((s) => s.id).join(', ')} | ${L.portals.map((p) => p.id).join(', ')}; the stand-in gives ${sOk && pOk ? 'the same' : `${s2.map((s) => s.id).join(', ')} | ${p2.map((p) => p.id).join(', ')}`}`,
    );
  }
  // the index against what the viewer reads from the file
  const sBad = [];
  if (L.spawns.length !== A.spawns.length)
    sBad.push(
      `the viewer finds ${L.spawns.length} spawns (${L.spawns.map((s) => s.id).join(', ')}), the index lists ${A.spawns.length}`,
    );
  for (const [k, s] of L.spawns.entries()) {
    const e = A.spawns[k];
    if (!e) break;
    const node =
      all.find((o) => o.userData.name === `Spawn_${s.id}`) ?? all.find((o) => o.name === `Spawn_${s.id}`);
    const d = Math.hypot(
      s.position.x - e.position[0],
      s.position.y - e.position[1],
      s.position.z - e.position[2],
    );
    const probs = [];
    if (s.id !== e.id) probs.push(`id ${s.id}, the index says ${e.id}`);
    if (d > 1e-4) probs.push(`${f2(d, 4)} m from the index's place`);
    if (angDiff(deg(s.yaw), e.yaw_deg) > 0.01)
      probs.push(`yaw ${f2(deg(s.yaw), 3)}, the index says ${e.yaw_deg}`);
    if (s.label !== e.label || s.name !== e.name || s.group !== e.group)
      probs.push(
        `words "${s.label}" / "${s.name}" / "${s.group}", the index says "${e.label}" / "${e.name}" / "${e.group}"`,
      );
    if ((e.picker === false) !== (node?.userData.wdi_picker === false))
      probs.push(`wdi_picker ${node?.userData.wdi_picker}, the index says picker ${e.picker}`);
    if (probs.length) sBad.push(`${s.id}: ${probs.join(', ')}`);
  }
  check(
    `${id}.viewer_spawns`,
    sBad.length === 0,
    sBad.length === 0
      ? `${L.spawns.length} spawns: the viewer's findSpawns gives the index's ids, places, facings and picker words`
      : sBad.join('; '),
  );
  const pBad = [];
  if (L.portals.length !== A.portals.length)
    pBad.push(`the viewer finds ${L.portals.length} portals, the index lists ${A.portals.length}`);
  for (const [k, p] of L.portals.entries()) {
    const e = A.portals[k];
    if (!e) break;
    if (
      p.id !== e.id ||
      p.to !== e.to ||
      p.toSpawn !== e.toSpawn ||
      p.kind !== e.kind ||
      Math.hypot(p.position.x - e.position[0], p.position.y - e.position[1], p.position.z - e.position[2]) >
        1e-4
    )
      pBad.push(
        `${p.id} -> ${p.to}/${p.toSpawn} (${p.kind}); the index says ${e.id} -> ${e.to}/${e.toSpawn} (${e.kind})`,
      );
  }
  check(
    `${id}.viewer_portals`,
    pBad.length === 0,
    pBad.length === 0
      ? `${L.portals.length} portals: the viewer's findPortals gives the index's ids, places and targets`
      : pBad.join('; '),
  );
  L.nodes = all;
  // a spawn inside a portal's walk-in radius, by the viewer's own test (PortalTrigger.nearest): the trigger stays off
  // there until the player has stepped out
  const probe = new PortalTrigger(L.portals),
    near = [],
    gaps = [];
  for (const s of L.spawns) {
    for (const p of L.portals)
      if (planGap(s.position, p.position) !== null) gaps.push(planGap(s.position, p.position));
    const p = probe.nearest(s.position, RADIUS);
    if (p) near.push(`Spawn_${s.id} is ${f2(planGap(s.position, p.position))} m from Portal_${p.id}`);
  }
  if (A.kind === 'section')
    check(
      `${id}.spawn_clear_of_portals`,
      near.length === 0,
      near.length === 0
        ? `${L.spawns.length} spawns, each more than ${RADIUS} m from every portal of the file${gaps.length ? ` (the nearest pair is ${f2(Math.min(...gaps))} m apart)` : ''}`
        : `${near.join('; ')}. In a village section every spawn stands more than ${RADIUS} m from every portal: inside the radius the walk-in trigger is off until the player steps out, and the nearest portal takes the door prompt`,
    );
  else if (near.length)
    note(
      `${id}.spawn_inside_portal_radius`,
      `${near.join('; ')}: arriving there the walk-in trigger stays off until the player steps out and comes back. The arrival of a room or a wild area may stand like this; a spawn of a village section may not`,
    );
  // standing on the ground, when the collision triangles can be read
  if (L.triangles) {
    const off = [];
    for (const q of [...L.spawns, ...L.portals]) {
      const hit = rayFirstHit(L.triangles, [q.position.x, q.position.y + 1, q.position.z], [0, -1, 0], 1e4);
      const h = hit === null ? null : hit - 1;
      if (h === null || h < -0.01 || h > 0.1)
        off.push(`${q.id} ${h === null ? 'no ground' : `${f2(h, 3)} m`}`);
    }
    check(
      `${id}.stand_on_ground`,
      off.length === 0,
      off.length === 0
        ? `${L.spawns.length + L.portals.length} spawns and portals stand 0 to 0.10 m above the collision floor`
        : `off the ground: ${off.join(', ')}`,
    );
    if (A.kind === 'section') checkEdge(L, x);
  } else if (coll)
    note(
      `${id}.geometry_not_checked`,
      "the collision mesh is Draco-compressed: standing on the ground, the closed edge of a section and seam walls are not checked here (the exporter's Blender checks do that)",
    );
}

// ------------------------------------------------------------------------------------------------ rules across the files
const indexSpawns = Object.entries(index.areas ?? {}).flatMap(([id, A]) =>
  A.spawns.map((s) => ({ ...s, area: id })),
);
const homes = new Map(); // spawn id -> area ids, from what the viewer reads in the files
for (const L of Object.values(loaded))
  for (const s of L.spawns) homes.set(s.id, [...(homes.get(s.id) ?? []), L.id]);
const dup = [...homes].filter(([, v]) => v.length > 1);
const indexDup = indexSpawns.map((s) => s.id).filter((v, k, a) => a.indexOf(v) !== k);
check(
  'world.spawn_unique',
  dup.length === 0 && indexDup.length === 0,
  dup.length === 0 && indexDup.length === 0
    ? `${[...homes].length} spawn ids in ${Object.keys(loaded).length} files, each used once`
    : `used more than once: ${[...dup.map(([k, v]) => `${k} in ${v.join(' and ')}`), ...[...new Set(indexDup)].map((k) => `${k} twice in the index`)].join('; ')}`,
);
// Starting (docs/walk-areas.md, section 7, step 2): the spawn is the address's when the index has it, else the index's
// `start`; the file of the area that holds it is opened; the player is placed with pickSpawn(world.spawns, <that id>).
const spawnArea = Object.fromEntries(indexSpawns.map((s) => [s.id, s.area]));
const startHome = loaded[spawnArea[index.start]];
const startGot = startHome ? pickSpawn(startHome.spawns, index.start)?.id : undefined;
check(
  'index.start',
  pickSpawn(indexSpawns, index.start)?.id === index.start && startGot === index.start,
  startGot === index.start
    ? `"${index.start}" is in ${startHome.id}; the viewer's pickSpawn over that file's spawns, given the id, places the player there`
    : `the viewer's pickSpawn, asked for "${index.start}", gives ${pickSpawn(indexSpawns, index.start)?.id ?? 'nothing'} over the whole index and ${startGot ?? 'nothing'} over the spawns of ${startHome?.id ?? 'no file'}`,
);
{
  // every spawn id of the index opens by its id alone: what ?spawn=, the picker and a page reload at a crossing need
  const lost = indexSpawns
    .filter((s) => pickSpawn(loaded[s.area]?.spawns ?? [], s.id)?.id !== s.id)
    .map((s) => s.id);
  check(
    'index.spawn_by_id',
    lost.length === 0,
    lost.length === 0
      ? `all ${indexSpawns.length} spawn ids of the index: the viewer's pickSpawn over the spawns of the file that holds the id, given the id, finds it`
      : `not found by their id in the file the index names: ${lost.join(', ')}`,
  );
  // the wrong way, shown to go wrong: main.ts line 158 passes params.get('spawn'), which is empty when the start
  // came from the index, and pickSpawn then falls back to "square", else to the file's first spawn
  const gets = Object.values(loaded).map((L) => `${pickSpawn(L.spawns, null)?.id ?? 'nothing'} in ${L.id}`);
  const missed = indexSpawns.filter((s) => pickSpawn(loaded[s.area]?.spawns ?? [], null)?.id !== s.id);
  control(
    'viewer.start_without_the_id',
    `pickSpawn(world.spawns, null), which is what main.ts line 158 does when the address names no spawn, gives ${gets.join(', ')}. A start at any of the other ${missed.length} spawn ids of the index would begin there instead. That is why the chosen id is passed to pickSpawn`,
  );
}

// Where a portal leads with an index: the exact id <to>_<toSpawn>, looked up across the whole index, and nothing else.
// The viewer's own resolvePortal is used for the lookup; its bare-id fallback is a failure here (decision C5).
const pending = new Set(index.pending ?? []);
function resolveAcross(portal) {
  const hit = resolvePortal(portal, indexSpawns);
  return hit && !hit.fallback ? { id: hit.spawn.id, area: hit.spawn.area } : null;
}
/** A portal's node name as written in the file, with its dot. */
const rawPortal = (L, p) => {
  const node = L.nodes?.find((o) => o.name === `Portal_${p.id}`);
  return node ? (node.userData.name ?? node.name) : `Portal_${p.id}`;
};
// Portals whose bare toSpawn is also a spawn id somewhere: no fault with an index, a trap for a loader that falls back
// to the bare id. `exactHazards` are portals whose exact target exists; `waitingHazards` lead into a scene that is not
// built yet (docs/walk-areas.md, section 5): with an index the viewer says so and never looks at the bare id.
const exactHazards = [],
  waitingHazards = [];
for (const L of Object.values(loaded)) {
  const bad = [];
  let ok = 0,
    waiting = 0;
  for (const p of L.portals) {
    const hit = resolvePortal(p, indexSpawns);
    const bare = indexSpawns.find((s) => s.id === p.toSpawn);
    const hint = hit?.fallback
      ? ` (a spawn with the bare id '${p.toSpawn}' exists in ${hit.spawn.area}: the single-file fallback of today would take it; with an index it is not used)`
      : '';
    if (hit && !hit.fallback) {
      if (index.areas[hit.spawn.area].scene !== p.to)
        bad.push(
          `Portal_${p.id}: Spawn_${hit.spawn.id} is in ${hit.spawn.area}, whose scene is ${index.areas[hit.spawn.area].scene}, not ${p.to}`,
        );
      else ok++;
      if (bare)
        exactHazards.push(
          `${rawPortal(L, p)} in ${L.id} (exact target Spawn_${hit.spawn.id} in ${hit.spawn.area}; the bare id '${p.toSpawn}' is a spawn in ${bare.area})`,
        );
    } else if (index.scenes?.[p.to])
      bad.push(`Portal_${p.id}: scene ${p.to} is built and has no Spawn_${p.to}_${p.toSpawn}${hint}`);
    else if (!pending.has(p.to))
      bad.push(`Portal_${p.id}: scene "${p.to}" is in no file and is not listed under pending${hint}`);
    else {
      // a scene that is not built yet: the viewer says so, whether or not another scene has a spawn with the bare id
      waiting++;
      if (bare)
        waitingHazards.push(
          `${rawPortal(L, p)} in ${L.id} (scene ${p.to} is not built yet, so the viewer says so; the bare id '${p.toSpawn}' is a spawn in ${bare.area})`,
        );
    }
  }
  check(
    `${L.id}.portal_target`,
    bad.length === 0,
    bad.length === 0
      ? `${ok} of ${L.portals.length} portals lead to a spawn in the index by the exact id; ${waiting} lead to scenes that are not built yet`
      : bad.join('; '),
  );
  // what the index says of each portal beyond what findPortals reads: the area that holds its target, the game's id
  // with its dot, and the seam it belongs to
  const drift = [];
  for (const [k, p] of L.portals.entries()) {
    const e = L.A.portals[k];
    if (!e || e.id !== p.id) continue; // viewer_portals has said so
    const node = L.nodes?.find((o) => o.name === `Portal_${p.id}`),
      raw = rawPortal(L, p);
    const want = {
      target_area: resolveAcross(p)?.area ?? null,
      portal_id:
        typeof node?.userData.wdi_portal_id === 'string'
          ? node.userData.wdi_portal_id
          : raw.slice('Portal_'.length),
      seam:
        raw.startsWith('Portal_seam_') && typeof node?.userData.wdi_seam === 'string'
          ? node.userData.wdi_seam
          : undefined,
    };
    for (const key of ['target_area', 'portal_id', 'seam'])
      if ((e[key] ?? null) !== (want[key] ?? null))
        drift.push(
          `${e.id}: ${key} is ${JSON.stringify(e[key] ?? null)}, the files give ${JSON.stringify(want[key] ?? null)}`,
        );
  }
  check(
    `${L.id}.portals_match_index`,
    drift.length === 0,
    drift.length === 0
      ? `${L.portals.length} portals: target_area, portal_id and seam in the index are what the files give`
      : drift.join('; '),
  );
}
if (exactHazards.length + waitingHazards.length)
  note(
    'world.bare_id_hazard',
    `a loader that falls back to the bare toSpawn would go wrong at: ${[...exactHazards, ...waitingHazards].join('; ')}. With an index the exact id is the only lookup`,
  );

// Two notes, never failures (walk_index.py prints the same two). An area that no portal of another area leads into;
// the area the viewer starts in is left out. And a way out of a room or a wild area that arrives in another file than
// the door that leads in, or more than 10 m from that door.
{
  const into = new Map(); // area id -> the portals of other areas that lead into it
  for (const L of Object.values(loaded))
    for (const p of L.portals) {
      const hit = resolveAcross(p);
      if (hit && hit.area !== L.id)
        into.set(hit.area, [...(into.get(hit.area) ?? []), { from: L.id, portal: p }]);
    }
  for (const L of Object.values(loaded).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const ways = into.get(L.id);
    if (!ways) {
      if (L.id !== spawnArea[index.start])
        note(
          `${L.id}.no_way_in`,
          `no portal of another area leads into ${L.id}: the player reaches it only through the picker, or a link that names one of its spawns`,
        );
      continue;
    }
    if (L.A.kind !== 'room' && L.A.kind !== 'wild') continue;
    for (const p of L.portals) {
      const hit = resolveAcross(p);
      const spawn = hit && hit.area !== L.id ? loaded[hit.area]?.spawns.find((s) => s.id === hit.id) : null;
      if (!spawn) continue;
      const doors = ways.filter((d) => d.from === hit.area).map((d) => d.portal);
      if (doors.length === 0) {
        note(
          `${L.id}.way_back`,
          `Portal_${p.id} arrives at Spawn_${hit.id} in ${hit.area}, and no door into ${L.id} stands in that file (its doors are in ${[...new Set(ways.map((d) => d.from))].sort().join(', ')}): the player comes out in another file than the one they went in by`,
        );
        continue;
      }
      const [far, door] = doors
        .map((q) => [Math.hypot(spawn.position.x - q.position.x, spawn.position.z - q.position.z), q])
        .sort((a, b) => a[0] - b[0])[0];
      if (far > WAY_BACK_FAR)
        note(
          `${L.id}.way_back`,
          `Portal_${p.id} arrives at Spawn_${hit.id}, ${f2(far, 1)} m from Portal_${door.id}, the nearest door into ${L.id}: more than ${WAY_BACK_FAR} m from where the player went in`,
        );
    }
  }
}

// ------------------------------------------------------------------------------------------------ seams
const xy = (v) => [v.x, -v.z]; // glTF world -> Blender plan
const seams = {};
for (const L of Object.values(loaded)) {
  if (!L.area) continue;
  const nodes = [];
  L.root.traverse((o) => nodes.push(o));
  for (const o of nodes) {
    const raw = o.userData.name ?? o.name;
    let m = /^Portal_seam_(.+)_([ab])_([1-9][0-9]*)$/.exec(raw);
    if (raw.startsWith('Portal_seam_')) {
      const sid = typeof o.userData.wdi_seam === 'string' ? o.userData.wdi_seam : (m?.[1] ?? '?');
      const S = (seams[sid] ??= { portals: { a: [], b: [] }, arrivals: { a: [], b: [] }, badNames: [] });
      if (!m || m[1] !== sid) {
        S.badNames.push(raw);
        if (!m) continue;
      }
      S.portals[m[2]].push({
        n: Number(m[3]),
        raw,
        area: L.id,
        extras: o.userData,
        pos: worldPos(o),
        id: raw.slice('Portal_'.length),
      });
    }
    m = /^Spawn_overworld_seam_(.+)_([ab])_([1-9][0-9]*)$/.exec(raw);
    if (m) {
      const S = (seams[m[1]] ??= { portals: { a: [], b: [] }, arrivals: { a: [], b: [] }, badNames: [] });
      const sp = L.spawns.find((s) => s.id === raw.slice('Spawn_'.length));
      S.arrivals[m[2]].push({
        n: Number(m[3]),
        raw,
        area: L.id,
        extras: o.userData,
        pos: worldPos(o),
        yaw: sp?.yaw ?? 0,
      });
    }
  }
}
const derivedSeams = [];
for (const [sid, S] of Object.entries(seams).sort()) {
  const rule = `seam.${sid}.`;
  const rows = { a: S.portals.a.sort((p, q) => p.n - q.n), b: S.portals.b.sort((p, q) => p.n - q.n) };
  const home = { a: [...new Set(rows.a.map((p) => p.area))], b: [...new Set(rows.b.map((p) => p.area))] };
  const sidesOk =
    /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(sid) &&
    S.badNames.length === 0 &&
    home.a.length === 1 &&
    home.b.length === 1 &&
    home.a[0] !== home.b[0] &&
    [home.a[0], home.b[0]].every((h) => index.areas[h]?.kind === 'section');
  check(
    `${rule}sides`,
    sidesOk,
    sidesOk
      ? `side a is ${home.a[0]}, side b is ${home.b[0]}`
      : `seam id "${sid}"; side a in ${home.a.join(', ') || 'no file'}, side b in ${home.b.join(', ') || 'no file'}; names that do not fit Portal_seam_<seamId>_<a or b>_<n>: ${S.badNames.join(', ') || '-'}; a seam joins two village sections`,
  );
  if (!sidesOk) continue;
  const count = rows.a.length,
    na = rows.a.map((p) => p.n),
    nb = rows.b.map((p) => p.n);
  const numbered =
    same(
      na,
      Array.from({ length: count }, (_, k) => k + 1),
    ) && same(na, nb);
  check(
    `${rule}numbering`,
    numbered,
    numbered
      ? `${count} points a side, numbered 1 to ${count}`
      : `side a has ${na.join(', ')}; side b has ${nb.join(', ')}; both rows count 1, 2, 3 ... with the same numbers`,
  );
  const width = rows.a[0].extras.wdi_width_m,
    kind = rows.a[0].extras.wdi_seam_kind;
  const badExtras = [];
  for (const side of ['a', 'b'])
    for (const p of rows[side]) {
      const e = p.extras,
        other = side === 'a' ? 'b' : 'a',
        probs = [];
      if (e.to !== 'overworld') probs.push(`to is ${JSON.stringify(e.to)}, not "overworld"`);
      if (e.toSpawn !== `seam_${sid}_${other}_${p.n}`) probs.push(`toSpawn is ${JSON.stringify(e.toSpawn)}`);
      if (e.kind !== 'gate') probs.push(`kind is ${JSON.stringify(e.kind)}, not "gate"`);
      if (e.wdi_portal_id !== `seam_${sid}_${side}_${p.n}`)
        probs.push(`wdi_portal_id is ${JSON.stringify(e.wdi_portal_id)}`);
      if (e.wdi_seam !== sid) probs.push(`wdi_seam is ${JSON.stringify(e.wdi_seam)}`);
      if (!SEAM_KINDS.includes(e.wdi_seam_kind) || e.wdi_seam_kind !== kind)
        probs.push(`wdi_seam_kind is ${JSON.stringify(e.wdi_seam_kind)}`);
      if (
        !isNum(e.wdi_width_m) ||
        !(e.wdi_width_m > 0 && e.wdi_width_m <= SEAM.widthMax) ||
        e.wdi_width_m !== width
      )
        probs.push(
          `wdi_width_m is ${JSON.stringify(e.wdi_width_m)} (a number above 0, the same on every portal of the seam; these tools do not sample an opening wider than ${SEAM.widthMax} m)`,
        );
      if (probs.length) badExtras.push(`${p.raw}: ${probs.join(', ')}`);
    }
  check(
    `${rule}extras`,
    badExtras.length === 0,
    badExtras.length === 0
      ? `to overworld, kind gate, wdi_seam_kind ${kind}, wdi_width_m ${width} on all ${2 * count} portals`
      : badExtras.join('; '),
  );
  if (!isNum(width) || !(width > 0 && width <= SEAM.widthMax)) continue;
  // the frame of the seam: its middle, the direction along the rows, the direction from side a to side b
  const centre = (row) => [0, 1].map((k) => row.reduce((s, p) => s + xy(p.pos)[k], 0) / row.length);
  const ca = centre(rows.a),
    cb = centre(rows.b);
  let tg, nrm;
  if (count >= 2) {
    const first = xy(rows.a[0].pos),
      last = xy(rows.a[count - 1].pos),
      ln = Math.hypot(last[0] - first[0], last[1] - first[1]) || 1;
    tg = [(last[0] - first[0]) / ln, (last[1] - first[1]) / ln];
    const d = [cb[0] - ca[0], cb[1] - ca[1]],
      along = d[0] * tg[0] + d[1] * tg[1];
    nrm = [d[0] - along * tg[0], d[1] - along * tg[1]];
  } else nrm = [cb[0] - ca[0], cb[1] - ca[1]];
  const nl = Math.hypot(nrm[0], nrm[1]) || 1;
  nrm = [nrm[0] / nl, nrm[1] / nl];
  if (count < 2) tg = [-nrm[1], nrm[0]];
  const mid = [(ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2];
  const lat = (pos) => (xy(pos)[0] - mid[0]) * tg[0] + (xy(pos)[1] - mid[1]) * tg[1];
  const fwd = (pos) => (xy(pos)[0] - mid[0]) * nrm[0] + (xy(pos)[1] - mid[1]) * nrm[1];
  const la = rows.a.map((p) => lat(p.pos)),
    lb = rows.b.map((p) => lat(p.pos)),
    fa = rows.a.map((p) => fwd(p.pos)),
    fb = rows.b.map((p) => fwd(p.pos));
  const mean = (v) => v.reduce((s, q) => s + q, 0) / v.length;
  const apart = mean(fb) - mean(fa);
  const straight =
    Math.max(...fa.map((v) => Math.abs(v - mean(fa)))) <= SEAM.tol &&
    Math.max(...fb.map((v) => Math.abs(v - mean(fb)))) <= SEAM.tol;
  const facing = la.length === lb.length && la.every((v, k) => Math.abs(v - lb[k]) <= SEAM.lateralMax);
  const rowOk = straight && facing && Math.abs(apart - 2 * SEAM.portalToWall) <= 2 * SEAM.tol;
  check(
    `${rule}row`,
    rowOk,
    rowOk
      ? `the rows are straight, ${f2(apart)} m apart (2 x ${SEAM.portalToWall}), and the same numbers face each other`
      : `straight ${straight}; rows ${f2(apart)} m apart (should be ${f2(2 * SEAM.portalToWall)}); same numbers face each other ${facing}`,
  );
  const gaps = [...la.slice(1).map((v, k) => v - la[k]), ...lb.slice(1).map((v, k) => v - lb[k])];
  const spacingOk = gaps.every((q) => q > 1e-6 && q <= SEAM.gapMax + 1e-3);
  check(
    `${rule}spacing`,
    spacingOk,
    spacingOk
      ? `gaps between neighbours: ${
          gaps
            .slice(0, la.length - 1)
            .map((q) => f2(q))
            .join(', ') || 'one point'
        } m (at most ${SEAM.gapMax})`
      : `gaps between neighbours: ${gaps.map((q) => f2(q)).join(', ')} m; the rule is at most ${SEAM.gapMax} m, counted in one direction`,
  );
  // arrivals
  const badArr = [];
  let nArr = 0,
    walkedBack = 0;
  for (const [side, other, travel] of [
    ['a', 'b', nrm],
    ['b', 'a', [-nrm[0], -nrm[1]]],
  ]) {
    const wrongFile = S.arrivals[other].filter((s) => s.area !== home[other][0]).map((s) => s.raw);
    if (wrongFile.length) badArr.push(`in the wrong file: ${wrongFile.join(', ')}`);
    for (const p of rows[side]) {
      const sp = S.arrivals[other].find((s) => s.n === p.n);
      if (!sp) {
        badArr.push(`no Spawn_overworld_seam_${sid}_${other}_${p.n}`);
        continue;
      }
      nArr++;
      const d = [xy(sp.pos)[0] - xy(p.pos)[0], xy(sp.pos)[1] - xy(p.pos)[1]];
      const beyond = d[0] * travel[0] + d[1] * travel[1],
        sideOff = Math.abs(d[0] * tg[0] + d[1] * tg[1]);
      const face = [-Math.sin(sp.yaw), Math.cos(sp.yaw)]; // the viewer's yaw as a Blender plan direction
      const yawErr = deg(Math.acos(Math.max(-1, Math.min(1, face[0] * travel[0] + face[1] * travel[1]))));
      // every portal of the file the arrival stands in, the return row and any door or other seam alike
      const filePortals = loaded[sp.area].portals;
      const close = filePortals
        .map((q) => [planGap(sp.pos, q.position), q])
        .filter(([gap]) => gap !== null && gap < SEAM.arrivalClearMin - 1e-3);
      const probs = [];
      if (Math.abs(beyond - SEAM.arrivalBeyond) > SEAM.tol)
        probs.push(`${f2(beyond)} m beyond its departure portal, not ${SEAM.arrivalBeyond}`);
      if (sideOff > SEAM.lateralMax + 1e-6) probs.push(`${f2(sideOff)} m sideways`);
      if (yawErr > SEAM.yawMax) probs.push(`faces ${f2(yawErr, 1)} degrees off the direction of travel`);
      for (const [gap, q] of close)
        probs.push(`${f2(gap)} m from Portal_${q.id}, under ${SEAM.arrivalClearMin}`);
      if (sp.extras.wdi_picker !== false) probs.push('wdi_picker is not false');
      // and by the viewer's own trigger, holding every portal of that file: it is ready at once, and a walk
      // straight back to the wall (to 0.3 m short of the line, the walker's radius) fires a point of the return row
      const trigger = new PortalTrigger(filePortals);
      trigger.disarm();
      let fired = trigger.update(sp.pos.clone(), false);
      const reach = Math.min(Math.abs(fwd(sp.pos)) - CAPSULE, 20); // an arrival 1e9 m from its seam is a fault the rule above names; not a reason to walk there
      for (let gone = 0; !fired && gone < reach;) {
        gone = Math.min(reach, gone + 1.4 / 60);
        fired = trigger.update(
          new Vector3(sp.pos.x - travel[0] * gone, sp.pos.y, sp.pos.z + travel[1] * gone),
          false,
        );
      }
      if (!fired)
        probs.push(
          "walking straight back to the wall fires nothing: the viewer's trigger is not ready at the arrival",
        );
      else if (!rows[other].some((q) => sanitize(q.id) === fired.id))
        probs.push(`walking straight back to the wall, Portal_${fired.id} fires before the seam`);
      else walkedBack++;
      if (probs.length) badArr.push(`${sp.raw}: ${probs.join(', ')}`);
    }
    const extra = S.arrivals[side].filter((s) => !rows[other].some((p) => p.n === s.n)).map((s) => s.raw);
    if (extra.length) badArr.push(`arrival with no portal leading to it: ${extra.join(', ')}`);
  }
  check(
    `${rule}arrival`,
    badArr.length === 0,
    badArr.length === 0
      ? `${nArr} arrivals: ${SEAM.arrivalBeyond} m beyond the departure portal, at most ${SEAM.lateralMax} m sideways, at most ${SEAM.yawMax} degrees off, at least ${SEAM.arrivalClearMin} m from every portal of their file, wdi_picker false; the viewer's PortalTrigger is ready at ${walkedBack} of ${nArr}: a walk straight back to the wall fires the return row`
      : badArr.join('; '),
  );
  // nothing else near the rows: a portal that is not of this seam's row stands at least 2 m from every point of it,
  // so that no other 1 m disc reaches into the discs of the row
  {
    const crowd = [];
    let nearestOther = null;
    for (const side of ['a', 'b']) {
      const own = new Set(rows[side].map((p) => sanitize(p.id)));
      for (const q of loaded[home[side][0]].portals) {
        if (own.has(q.id)) continue;
        for (const p of rows[side]) {
          const gap = planGap(q.position, p.pos);
          if (gap === null) continue;
          nearestOther = nearestOther === null ? gap : Math.min(nearestOther, gap);
          if (gap < SEAM.rowClearMin - 1e-3) crowd.push(`Portal_${q.id} is ${f2(gap)} m from ${p.raw}`);
        }
      }
    }
    check(
      `${rule}clear`,
      crowd.length === 0,
      crowd.length === 0
        ? `no other portal within ${SEAM.rowClearMin} m of a point of either row${nearestOther === null ? ' (the two files hold no other portal at that height)' : ` (the nearest is ${f2(nearestOther)} m away)`}`
        : `${crowd.join('; ')}. No portal outside a seam's own row stands within ${SEAM.rowClearMin} m of a point of it: the two walk-in discs would overlap and the wrong one could fire`,
    );
  }
  // the two files agree on the height of the ground at the seam line. Each side's ground is carried to the line from
  // its portal and the arrival behind it; this needs no collision data, so it runs on Draco files too
  {
    const lineH = (side, p) => {
      const sp = S.arrivals[side].find((s) => s.n === p.n),
        dp = Math.abs(fwd(p.pos)),
        da = sp ? Math.abs(fwd(sp.pos)) : 0;
      return sp && da - dp > 0.1 ? p.pos.y + ((p.pos.y - sp.pos.y) * dp) / (da - dp) : p.pos.y;
    };
    const steps = rows.a
      .filter((p) => rows.b.some((q) => q.n === p.n))
      .map((p) => {
        const [ha, hb] = [
          lineH('a', p),
          lineH(
            'b',
            rows.b.find((q) => q.n === p.n),
          ),
        ];
        return { n: p.n, ha, hb, step: Math.abs(ha - hb) };
      });
    const stepBad = steps
      .filter((s) => s.step > SEAM.heightMax + 1e-6)
      .map(
        (s) => `point ${s.n}: side a puts the ground at the line at ${f2(s.ha)} m, side b at ${f2(s.hb)} m`,
      );
    check(
      `${rule}height`,
      steps.length > 0 && stepBad.length === 0,
      steps.length > 0 && stepBad.length === 0
        ? `the two files put the ground at the seam line at the same height: at most ${f2(Math.max(...steps.map((s) => s.step)))} m apart at ${steps.length} points (the rule is ${SEAM.heightMax} m)`
        : `${stepBad.join('; ') || 'no pair of points to compare'}. Village sections share the village's coordinates, heights too: the two sides differ by more than ${SEAM.heightMax} m`,
    );
  }
  // the look: equal in the two files and in the index. wdi_baked is part of it: the viewer switches off every light of
  // an area that says so (world.ts, switchOffBakedLights), so one baked side changes the picture
  const [ida, idb] = [home.a[0], home.b[0]];
  const baked = [ida, idb].map((id) => [loaded[id].baked, index.areas[id].baked === true]);
  const lookOk =
    same(loaded[ida].look, loaded[idb].look) &&
    same(index.areas[ida].look, index.areas[idb].look) &&
    'wdi_exposure' in (loaded[ida].look ?? {}) &&
    baked[0][0] === baked[1][0] &&
    baked[0][1] === baked[1][1];
  check(
    `${rule}look_equal`,
    lookOk,
    lookOk
      ? `both files and both index entries: ${JSON.stringify(loaded[ida].look)}, wdi_baked ${baked[0][0]}`
      : `files: ${ida} ${JSON.stringify(loaded[ida].look)}, wdi_baked ${baked[0][0]}; ${idb} ${JSON.stringify(loaded[idb].look)}, wdi_baked ${baked[1][0]}; index: ${ida} ${JSON.stringify(index.areas[ida].look)}, baked ${baked[0][1]}; ${idb} ${JSON.stringify(index.areas[idb].look)}, baked ${baked[1][1]}: the crossing would change the picture`,
  );
  // the wall across the opening, in each file whose collision triangles can be read
  for (const [side, toward] of [
    ['a', nrm],
    ['b', [-nrm[0], -nrm[1]]],
  ]) {
    const L = loaded[home[side][0]];
    if (!L.triangles) {
      note(
        `${rule}barrier_not_checked.${side}`,
        `${L.id}: the collision mesh is ${L.coll ? 'Draco-compressed' : 'missing'}, so the wall across the opening is not checked here`,
      );
      continue;
    }
    const row = rows[side],
      base = centre(row),
      baseLat = (base[0] - mid[0]) * tg[0] + (base[1] - mid[1]) * tg[1];
    const rowLat = row.map((p) => lat(p.pos)),
      d3 = [toward[0], 0, -toward[1]];
    const holes = [],
      cols = Math.max(1, Math.round((width - 0.1) / 0.25));
    let rays = 0;
    for (let k = 0; k <= cols; k++) {
      const s = -width / 2 + 0.05 + ((width - 0.1) * k) / cols;
      const px = base[0] + tg[0] * (s - baseLat),
        py = base[1] + tg[1] * (s - baseLat);
      // the wall's height is measured from the ground under each ray, so ground that slopes is no fault
      const start = rowHeight(row, rowLat, s) + 1,
        down = rayFirstHit(L.triangles, [px, start, -py], [0, -1, 0], 6);
      if (down === null) {
        rays += 4;
        holes.push(`at ${f2(s)} m along the opening: no ground under the row`);
        continue;
      }
      const ground = start - down;
      for (const h of [0.25, 1.0, 2.0, SEAM.wallHeight - 0.05]) {
        rays++;
        const hit = rayFirstHit(L.triangles, [px, ground + h, -py], d3, 50);
        if (hit === null || Math.abs(hit - SEAM.portalToWall) > SEAM.tol)
          holes.push(
            `at ${f2(s)} m along the opening, ${h} m above the ground: ${hit === null ? 'nothing within 50 m' : `wall at ${f2(hit)} m`}`,
          );
      }
    }
    const back = [];
    for (const sp of S.arrivals[side]) {
      rays++;
      const hit = rayFirstHit(L.triangles, [sp.pos.x, sp.pos.y + 1, sp.pos.z], d3, 50);
      if (hit === null || Math.abs(hit - SEAM.arrivalInside) > SEAM.tol)
        back.push(
          `${sp.raw}: ${hit === null ? 'no wall behind it' : `wall ${f2(hit)} m behind it, not ${SEAM.arrivalInside}`}`,
        );
    }
    check(
      `${rule}barrier.${side}`,
      holes.length === 0 && back.length === 0,
      holes.length === 0 && back.length === 0
        ? `${L.id}: ${rays} rays across the ${width} m opening, up to ${SEAM.wallHeight - 0.05} m above the ground under each, all meet the wall ${SEAM.portalToWall} m in front of the row; arrivals stand ${SEAM.arrivalInside} m inside it`
        : `${L.id}: ${holes.length} of ${rays} rays find no wall ${SEAM.portalToWall} m in front of the row (${holes.slice(0, 3).join('; ')})${back.length ? `; ${back.slice(0, 3).join('; ')}` : ''}`,
    );
  }
  // coverage: the row's ends against the opening, then the viewer's own trigger walked across the whole opening
  const endGaps = [la, lb].flatMap((row) => [width / 2 + Math.min(...row), width / 2 - Math.max(...row)]);
  const half = width / 2,
    opening = [
      [mid[0] - tg[0] * half, mid[1] - tg[1] * half],
      [mid[0] + tg[0] * half, mid[1] + tg[1] * half],
    ];
  // the trigger holds EVERY portal of the file, as the viewer's does: a door that fires before the seam is a fault too
  const sweeps = {
    a: sweep(rows.a, loaded[ida].portals, opening, nrm),
    b: sweep(rows.b, loaded[idb].portals, opening, [-nrm[0], -nrm[1]]),
  };
  const staticOk = endGaps.every((q) => q >= -1e-3 && q <= SEAM.endGapMax + 1e-3),
    sweepOk = [sweeps.a, sweeps.b].every((w) => w.dead.length === 0 && w.stolen.length === 0);
  const stolen = [...new Set([...sweeps.a.stolen, ...sweeps.b.stolen])];
  check(
    `${rule}coverage`,
    staticOk && sweepOk,
    staticOk && sweepOk
      ? `the opening is ${width} m wide; the end points stand ${f2(Math.max(...endGaps))} m from its ends (at most ${SEAM.endGapMax}); the viewer's PortalTrigger, holding every portal of the file, fires a point of the row first for a walker at ${sweeps.a.fired} of ${sweeps.a.total} places across it from side a and ${sweeps.b.fired} of ${sweeps.b.total} from side b; the walker is moved sideways by at most ${f2(Math.max(sweeps.a.maxSide, sweeps.b.maxSide))} m`
      : `the opening is ${width} m wide; end points stand ${endGaps.map((q) => f2(q)).join(', ')} m from its ends (at most ${SEAM.endGapMax}, none outside the opening); the viewer's PortalTrigger, holding every portal of the file, fires a point of the row first at ${sweeps.a.fired} of ${sweeps.a.total} places from side a (silent ${sweeps.a.runs}) and ${sweeps.b.fired} of ${sweeps.b.total} from side b (silent ${sweeps.b.runs})${stolen.length ? `; another portal fires first: ${stolen.join(', ')}` : ''}. An opening wider than 2 m needs a row, and nothing else may fire in front of it`,
  );
  if (count > 1) {
    const middle = rows.a[Math.floor(count / 2)];
    const one = sweep(
      [middle],
      loaded[ida].portals.filter((q) => q.id === sanitize(middle.id)),
      opening,
      nrm,
    );
    control(
      `${rule}one_point_only`,
      `with only the middle portal of side a, the viewer's trigger fires at ${one.fired} of ${one.total} places across the ${width} m opening; a walker is not taken through at ${one.runs} m from the middle. That is why an opening wider than 2 m has a row`,
    );
  }
  derivedSeams.push({
    id: sid,
    kind,
    width_m: width,
    a: ida,
    b: idb,
    portals: count,
    opening_xy: opening,
    normal_xy: nrm,
  });
}
// the index's list of seams against what the files give
{
  const close = (u, v) => Math.abs(u - v) <= 1e-6;
  const got = index.seams ?? [],
    bad = [];
  if (got.length !== derivedSeams.length)
    bad.push(`the index lists ${got.length} seams, the files give ${derivedSeams.length}`);
  for (const d of derivedSeams) {
    const s = got.find((q) => q.id === d.id);
    if (!s) {
      bad.push(`${d.id} is not in the index`);
      continue;
    }
    if (
      s.kind !== d.kind ||
      s.a !== d.a ||
      s.b !== d.b ||
      s.portals !== d.portals ||
      !close(s.width_m, d.width_m) ||
      ![0, 1].every((e) => [0, 1].every((k) => close(s.opening_xy?.[e]?.[k], d.opening_xy[e][k]))) ||
      ![0, 1].every((k) => close(s.normal_xy?.[k], d.normal_xy[k]))
    )
      bad.push(`${d.id}: the index says ${JSON.stringify(s)}; the files give ${JSON.stringify(d)}`);
  }
  check(
    'index.seams',
    bad.length === 0,
    bad.length === 0
      ? `${derivedSeams.length} seam${derivedSeams.length === 1 ? '' : 's'} in the index, as the files give`
      : bad.join('; '),
  );
}

/** Walks toward the wall at every 5 cm across the opening (0.3 m, the walker's radius, off each end), from 6 m back to
 * 0.3 m short of the seam line, calling the viewer's PortalTrigger once a frame at 60 frames a second and 1.4 m/s.
 * `row` is the seam's own points; `held` is what the trigger holds (the viewer's portals of the whole file). A place
 * counts as fired when the first portal to fire is a point of the row; `stolen` names what fired first elsewhere;
 * `maxSide` is how far sideways of the walker the point that fired stood, at most. */
function sweep(row, held, opening, toward) {
  const trigger = new PortalTrigger(held),
    own = new Map(row.map((p) => [sanitize(p.id), p]));
  const [p0, p1] = opening,
    len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]),
    u = [(p1[0] - p0[0]) / len, (p1[1] - p0[1]) / len];
  const y = row[0].pos.y,
    dead = [],
    stolen = new Set();
  let total = 0,
    fired = 0,
    maxSide = 0;
  for (let s = CAPSULE; s <= len - CAPSULE + 1e-9; s += 0.05) {
    total++;
    trigger.disarm();
    const P = [p0[0] + u[0] * s, p0[1] + u[1] * s];
    let hit = null;
    for (let back = 6; back >= CAPSULE - 1e-9 && !hit; back -= 1.4 / 60)
      hit = trigger.update(new Vector3(P[0] - toward[0] * back, y, -(P[1] - toward[1] * back)), false);
    const point = hit ? own.get(hit.id) : null;
    if (point) {
      fired++;
      const along = (xy(point.pos)[0] - p0[0]) * u[0] + (xy(point.pos)[1] - p0[1]) * u[1];
      maxSide = Math.max(maxSide, Math.abs(s - along));
    } else {
      dead.push(s - len / 2);
      if (hit) stolen.add(`Portal_${hit.id}`);
    }
  }
  const runs = [];
  for (const v of dead) {
    const last = runs[runs.length - 1];
    if (last && v - last[1] < 0.0501) last[1] = v;
    else runs.push([v, v]);
  }
  return {
    total,
    fired,
    dead,
    stolen: [...stolen],
    maxSide,
    runs: runs.map((r) => `${f2(r[0])} to ${f2(r[1])}`).join(' and ') || 'nowhere',
  };
}

function inPolygon(x, y, poly) {
  let inside = false;
  for (let k = 0; k < poly.length; k++) {
    const [x1, y1] = poly[k],
      [x2, y2] = poly[(k + 1) % poly.length];
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}
/** docs/walk-areas.md, section 4: the whole edge of a village section's walk region is closed by collision at least
 * 3 m above the ground, its face on the edge within the walker's radius. Run on collision that is not Draco-compressed.
 * Every 0.25 m along the outline (the Area's wdi_walk_polygon when it has one, else its wdi_walk_region), a ray finds
 * the ground 0.5 m inside the edge, then four rays at 0.25, 1, 2 and 2.95 m above that ground go outward; each must
 * meet a wall 0.5 m +/- 0.3 m away. The seam walls of section 6 are part of the edge and are held to this as well.
 * walk_index.py has the same rule. */
function checkEdge(L, x) {
  const rule = `${L.id}.edge_closed`;
  const r = isNumbers(x.wdi_walk_region, 4)
    ? x.wdi_walk_region
    : isNumbers(L.A.walk_region_xy, 4)
      ? L.A.walk_region_xy
      : null;
  const outline =
    walkPolygon(x.wdi_walk_polygon) ??
    (r
      ? [
          [r[0], r[1]],
          [r[2], r[1]],
          [r[2], r[3]],
          [r[0], r[3]],
        ]
      : null);
  if (!outline) return;
  const segLen = (k) => {
    const [[x1, y1], [x2, y2]] = [outline[k], outline[(k + 1) % outline.length]];
    return Math.hypot(x2 - x1, y2 - y1);
  };
  const length = outline.reduce((s, _, k) => s + segLen(k), 0);
  if (length > EDGE.maxLength) {
    check(
      rule,
      false,
      `the edge of the walk region is ${f2(length, 1)} m long: longer than the ${EDGE.maxLength} m this script samples; a village section is smaller`,
    );
    return;
  }
  if (L.triangles.length === 0) {
    check(rule, false, 'the collision mesh holds no triangle, so there is no wall at the edge');
    return;
  }
  L.grid ??= new TriGrid(L.triangles);
  const grid = L.grid,
    heights = [0.25, 1.0, 2.0, SEAM.wallHeight - 0.05],
    holes = [];
  let places = 0,
    rays = 0;
  for (let k = 0; k < outline.length; k++) {
    const [[x1, y1], [x2, y2]] = [outline[k], outline[(k + 1) % outline.length]],
      seg = segLen(k);
    if (seg < 1e-9) continue;
    // not within 0.3 m of a corner of the outline: there a ray's start can lie inside the thickness of the next wall, and
    // a gap that close to a corner is narrower than the walker (0.6 m) and cannot be walked through
    const [ux, uy] = [(x2 - x1) / seg, (y2 - y1) / seg],
      span = seg - 2 * EDGE.corner,
      count = span > 0 ? Math.max(1, Math.ceil(span / EDGE.step - 1e-9)) : 1;
    for (let j = 0; j < count; j++) {
      const t = span > 0 ? EDGE.corner + ((j + 0.5) / count) * span : seg / 2,
        [px, py] = [x1 + ux * t, y1 + uy * t];
      let [ix, iy] = [-uy, ux]; // the left normal ...
      if (!inPolygon(px + ix * 0.1, py + iy * 0.1, outline)) [ix, iy] = [-ix, -iy]; // ... is inward when the outline runs counter-clockwise
      places++;
      const [gx, gz] = [px + ix * EDGE.inside, -(py + iy * EDGE.inside)]; // the ray's start in glTF axes
      rays++;
      const down = grid.firstHit([gx, grid.top + 1, gz], [0, -1, 0], grid.top - grid.bottom + 2);
      if (down === null) {
        holes.push(`at (${f2(px)}, ${f2(py)}): no ground ${EDGE.inside} m inside the edge`);
        continue;
      }
      const ground = grid.top + 1 - down,
        found = [];
      for (const h of heights) {
        rays++;
        const hit = grid.firstHit([gx, ground + h, gz], [-ix, 0, iy], EDGE.reach);
        if (hit === null || Math.abs(hit - EDGE.inside) > EDGE.faceTol + 1e-6)
          found.push(
            `${h} m above the ground: ${hit === null ? `no wall within ${EDGE.reach} m` : `wall ${f2(hit)} m from the ray's start`}`,
          );
      }
      if (found.length) holes.push(`at (${f2(px)}, ${f2(py)}), ${found.join('; ')}`);
    }
  }
  check(
    rule,
    holes.length === 0,
    holes.length === 0
      ? `the ${f2(length, 1)} m edge is closed: at ${places} places, ${EDGE.step} m apart, four rays up to ${SEAM.wallHeight - 0.05} m above the ground, from ${EDGE.inside} m inside the edge, all meet a wall within ${EDGE.faceTol} m of it (${rays} rays)`
      : `${holes.length} of ${places} places along the ${f2(length, 1)} m edge are open: ${holes.slice(0, 3).join('; ')}${holes.length > 3 ? ' ...' : ''}. The whole edge of a village section is closed by collision at least ${SEAM.wallHeight} m high with its face within ${EDGE.faceTol} m of the edge: a gap lets the player walk off into the void`,
  );
}

/** The height of a seam's row at the sideways place s: between two portal points, on the straight line through their
 * heights; beyond the ends, on the line through the last two. With one point, that point's height. */
function rowHeight(row, rowLat, s) {
  if (row.length < 2) return row[0].pos.y;
  let k = 0;
  while (k < row.length - 2 && s > rowLat[k + 1]) k++;
  const span = rowLat[k + 1] - rowLat[k];
  if (Math.abs(span) < 1e-9) return row[k].pos.y;
  return row[k].pos.y + ((row[k + 1].pos.y - row[k].pos.y) * (s - rowLat[k])) / span;
}

// ------------------------------------------------------------------------------------------------ controls: wrong ways, shown to go wrong
// 1. Two areas in one scene: the viewer's nearest-origin rule (world.ts nearestArea, copied here: 8 lines) picks the
//    wrong one, because every area file sits at its own origin. Hence one World in the scene (decision C1).
{
  const at = new Vector3();
  const nearestArea = (areas, x, z) => {
    let best = null,
      bestD = Infinity;
    for (const a of areas) {
      a.getWorldPosition(at);
      const d = (at.x - x) ** 2 + (at.z - z) ** 2;
      if (d < bestD) [best, bestD] = [a, d];
    }
    return best;
  };
  const areas = Object.values(loaded)
    .filter((L) => L.area)
    .map((L) => L.area);
  const lines = [];
  for (const L of Object.values(loaded)) {
    if (!L.area || !Array.isArray(L.A.walk_region_xy)) continue;
    const [x0, y0, x1, y1] = L.A.walk_region_xy;
    if ((x1 - x0) * (y1 - y0) > 4e6) {
      lines.push(`${L.id} not sampled (a walk region of more than 4 square km)`); // a hostile index must not keep this busy
      continue;
    }
    let n = 0,
      wrong = 0;
    for (let bx = x0 + 0.25; bx < x1; bx += 0.5)
      for (let by = y0 + 0.25; by < y1; by += 0.5) {
        n++;
        if (nearestArea(areas, bx, -by) !== L.area) wrong++;
      }
    lines.push(`${L.id} ${wrong} of ${n}`);
  }
  if (areas.length > 1)
    control(
      'viewer.nearest_area_rule',
      `if all ${areas.length} areas were in one scene, the viewer's nearest-origin rule would show another area at this many sample points of each walk region: ${lines.join('; ')}. That is why one World is in the scene at a time`,
    );
}

// 2. The journey: the trip a loader has to make, driven through the viewer's own trigger. Written for the fixture.
const FIXTURE =
  ['village_west', 'village_east', 'room_shop'].every((k) => loaded[k]?.area) &&
  same(Object.keys(index.areas).sort(), ['room_shop', 'village_east', 'village_west']);
function journey() {
  const log = [],
    fails = [];
  const expect = (ok, text) => {
    log.push(`${ok ? 'ok  ' : 'FAIL'} ${text}`);
    if (!ok) fails.push(text);
  };
  const g2 = (bx, by) => [bx, -by]; // Blender (x, y) -> glTF (x, z)
  let current = null,
    trigger = null,
    yaw = 0;
  const pos = new Vector3();
  const open = (id) => {
    current = id;
    trigger = new PortalTrigger(loaded[id].portals);
  }; // one World: the area left is gone
  const goTo = (spawn) => {
    pos.copy(spawn.position);
    yaw = spawn.yaw;
    trigger.disarm();
  };
  const enter = (spawnId) => {
    const id = spawnArea[spawnId];
    open(id);
    goTo(loaded[id].spawns.find((s) => s.id === spawnId));
    return id;
  };
  const walk = (to, speed = 1.4) => {
    const from = [pos.x, pos.z],
      len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    for (let gone = 0; gone < len;) {
      gone = Math.min(len, gone + speed / 60);
      pos.set(from[0] + ((to[0] - from[0]) * gone) / len, pos.y, from[1] + ((to[1] - from[1]) * gone) / len);
      const p = trigger.update(pos, false);
      if (p) return p;
    }
    return null;
  };
  const travel = (portal) => {
    const r = resolveAcross(portal);
    if (!r) return { say: `${plainWords(portal.to)} is not built yet` };
    const fetched = r.area !== current;
    if (fetched) open(r.area);
    goTo(loaded[r.area].spawns.find((s) => s.id === r.id));
    return { to: r.id, area: r.area, fetched };
  };
  expect(
    enter('square') === 'village_west',
    'start: the spawn "square" is in village_west, so that file opens',
  );
  {
    // a start that is not "square" (section 7, step 2): the index's start set to another spawn, no spawn in the address
    const want = 'overworld_shop_door',
      file = spawnArea[want];
    const got = pickSpawn(loaded[file].spawns, want)?.id,
      today = pickSpawn(loaded[file].spawns, null)?.id,
      unknown = pickSpawn(loaded[file].spawns, 'no_such_spawn')?.id;
    expect(
      file === 'village_west' && got === want && today === 'square' && unknown === 'square',
      `a start that is not "square": were the index's start ${want} and the address without a spawn, ${file} opens and pickSpawn(world.spawns, "${want}") places the player at ${got}; pickSpawn(world.spawns, null), as line 158 of main.ts calls it today, would give ${today}, and so would an address with ?spawn=no_such_spawn (${unknown})`,
    );
  }
  let p = walk(g2(-0.3, 0));
  expect(
    p?.id === 'seam_west_east_a_2',
    `walking east fires ${p?.id} at x = ${f2(pos.x)} (the portal stands at -0.45; the radius is 1 m)`,
  );
  let t = travel(p);
  expect(
    t.area === 'village_east' && t.fetched && t.to === 'overworld_seam_west_east_b_2',
    `the seam: the exact id ${t.to} is in ${t.area}; that file opens`,
  );
  expect(
    Math.abs(pos.x - 1.65) < 1e-6 && Math.abs(pos.z) < 1e-6 && Math.abs(deg(yaw) + 90) < 0.01,
    `arrival at (${f2(pos.x)}, ${f2(-pos.z)}) looking east (yaw ${f2(deg(yaw), 1)}): a step of ${f2(1.65 + 1.45, 1)} m hidden by the fade`,
  );
  expect(
    walk(g2(20, 0)) === null,
    'walking on east fires nothing: the arrival stood 1.2 m from the return row',
  );
  p = walk(g2(0.3, 0));
  expect(p?.id === 'seam_west_east_b_2', `walking back west fires ${p?.id} at x = ${f2(pos.x)}`);
  t = travel(p);
  expect(
    t.area === 'village_west' &&
      t.fetched &&
      t.to === 'overworld_seam_west_east_a_2' &&
      Math.abs(deg(yaw) - 90) < 0.01,
    `back through the seam: ${t.to} in ${t.area}, looking west (yaw ${f2(deg(yaw), 1)})`,
  );
  expect(walk(g2(-40, 0), 3.5) === null, 'running west to x = -40 fires nothing');
  p = walk(g2(-40, 7.9));
  expect(
    p?.id === 'ovshop',
    `the shop door fires as ${p?.id} at y = ${f2(-pos.z)} (the viewer reads Portal_ov.shop as "ovshop")`,
  );
  t = travel(p);
  expect(
    t.area === 'room_shop' && t.to === 'shop_door' && t.fetched,
    `the door: ${t.to} is in ${t.area}; that file opens`,
  );
  const out = loaded.room_shop.portals[0];
  expect(
    Math.hypot(pos.x - out.position.x, pos.z - out.position.z) < 1 && walk([pos.x, pos.z - 0.2]) === null,
    'the room arrival stands 0.5 m from the way out, inside its radius: nothing fires, nothing bounces',
  );
  walk([pos.x, pos.z - 2]);
  p = walk([pos.x, pos.z + 2.2]);
  expect(p?.id === 'shopdoor', `after stepping 2 m into the room and coming back, ${p?.id} fires`);
  const naive = resolvePortal(p, loaded.room_shop.spawns);
  control(
    'journey.bare_id_fallback',
    `the viewer's resolvePortal over the spawns of the loaded file alone sends the way out of the shop to Spawn_${naive?.spawn.id}${naive?.fallback ? ' (its bare-id fallback)' : ''}, the room's own spawn. The exact id overworld_shop_door is in village_west. That is why the exact id is looked up across the whole index and the bare id is not used`,
  );
  t = travel(p);
  const door = loaded.village_west.portals.find((q) => q.id === 'ovshop');
  expect(
    t.area === 'village_west' &&
      t.to === 'overworld_shop_door' &&
      Math.hypot(pos.x - door.position.x, pos.z - door.position.z) >= 1.2,
    `the way out: ${t.to} in ${t.area}, ${f2(Math.hypot(pos.x - door.position.x, pos.z - door.position.z))} m from the door portal`,
  );
  expect(enter('mill') === 'village_east', 'the picker: choosing "mill" opens village_east');
  p = walk(g2(54.9, 0), 3.5);
  expect(p?.id === 'ovmine', `running to the mine door fires ${p?.id}`);
  t = travel(p);
  expect(
    t.say === 'Mine is not built yet',
    `a pending scene: the viewer says "${t.say}" and the player stays`,
  );
  expect(trigger.update(pos, false) === null, 'standing in the radius afterwards does not fire it again');
  expect(
    walk(g2(50, 0)) === null && walk(g2(55.5, 0))?.id === 'ovmine',
    'stepping away and coming back fires it again',
  );
  expect(
    enter('shop_door') === 'room_shop',
    'a link straight into a room: the spawn "shop_door" opens room_shop first',
  );
  const arrivalIds = indexSpawns.filter((s) => s.picker === false).map((s) => s.id);
  expect(
    arrivalIds.length === 6 &&
      arrivalIds.every((id) => pickSpawn(loaded[spawnArea[id]].spawns, id)?.id === id),
    `every arrival spawn can be opened by its id alone (${arrivalIds.length} ids): what a page reload with the spawn in the address needs`,
  );
  return { log, fails };
}
let J = {
  log: ['not run: the scripted journey is written for the fixture (village_west, village_east, room_shop)'],
  fails: [],
};
if (FIXTURE) {
  try {
    J = journey();
  } catch (e) {
    J = {
      log: [
        `FAIL the journey stopped: ${String(e.message).split('\n')[0]} (a step found no portal or spawn: an earlier rule is broken)`,
      ],
      fails: ['stopped'],
    };
  }
  check('journey', J.fails.length === 0, `${J.log.length - J.fails.length} of ${J.log.length} steps`);
}

// ------------------------------------------------------------------------------------------------ the report
report([
  '--- the journey',
  ...J.log.map((l) => `  ${l}`),
  `--- the viewer's code: ${rewrites.join('; ')}; three: ${GLTFLoader ? `the real package, r${THREE.REVISION}` : 'the stand-in'}`,
]);
if (opts.json)
  writeFileSync(opts.json, `${JSON.stringify({ results, journey: J.log, seams: derivedSeams }, null, 1)}\n`);
process.exit(tally('FAIL') ? 1 : 0);
