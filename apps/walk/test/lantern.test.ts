import {
  Color,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  ShaderLib,
  Texture,
  Vector3,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from 'three';
import { describe, expect, it } from 'vitest';
import { LANTERN, WALK } from '../src/config';
import { disposeWorld, resourcesOf } from '../src/dispose';
import {
  FLICKER_HZ,
  Lantern,
  flickerAt,
  hasLantern,
  injectLantern,
  lanternAnywhere,
  lanternFalloff,
  lanternShape,
  lanternUniforms,
  lanternWanted,
  patchLantern,
  takesLantern,
} from '../src/lantern';
import { AreaSwap } from '../src/session';
import { buildWorld } from '../src/world';
import './helpers/node-gltf';
import { memoryIo } from './helpers/node-gltf';

// three r186's AgX (tonemapping_pars_fragment) and the sRGB output, as tools/blender/meshy_room_build.py ports it:
// the display luminance a scene-linear colour shows at an exposure.
const SRGB_TO_2020 = [
  [0.6274, 0.3293, 0.0433],
  [0.0691, 0.9195, 0.0113],
  [0.0164, 0.088, 0.8956],
];
const REC2020_TO_SRGB = [
  [1.6605, -0.5876, -0.0728],
  [-0.1246, 1.1329, -0.0083],
  [-0.0182, -0.1006, 1.1187],
];
const INSET = [
  [0.856627153315983, 0.0951212405381588, 0.0482516061458583],
  [0.137318972929847, 0.761241990602591, 0.101439036467562],
  [0.11189821299995, 0.0767994186031903, 0.811302368396859],
];
const OUTSET = [
  [1.1271005818144368, -0.11060664309660323, -0.016493938717834573],
  [-0.1413297634984383, 1.157823702216272, -0.016493938717834257],
  [-0.14132976349843826, -0.11060664309660294, 1.2519364065950405],
];
const mul = (m: number[][], c: number[]) =>
  m.map((row) => row[0]! * c[0]! + row[1]! * c[1]! + row[2]! * c[2]!);
function agxDisplayLuma(rgb: number[], exposure: number): number {
  let c = mul(
    INSET,
    mul(
      SRGB_TO_2020,
      rgb.map((v) => v * exposure),
    ),
  );
  c = c.map((v) =>
    Math.min(1, Math.max(0, (Math.log2(Math.max(v, 1e-10)) + 12.47393) / (4.026069 + 12.47393))),
  );
  c = c.map((x) => {
    const x2 = x * x;
    const x4 = x2 * x2;
    return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
  });
  c = mul(OUTSET, c).map((v) => Math.max(v, 0) ** 2.2);
  c = mul(REC2020_TO_SRGB, c).map((v) => Math.min(1, Math.max(0, v)));
  c = c.map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

describe('the lantern falloff', () => {
  it('is intensity / (1 + (d / 2.5)^2), fading out between 8.4 and 12 m', () => {
    expect(LANTERN.near).toBe(2.5);
    expect(LANTERN.reach).toBe(12);
    expect(lanternShape(0)).toBe(1);
    expect(lanternShape(2.5)).toBeCloseTo(0.5, 12);
    expect(lanternShape(5)).toBeCloseTo(0.2, 12);
    // Up to 0.7 x 12 m no fade; then a smoothstep: half way at 10.2 m, nothing from 12 m.
    expect(lanternShape(8.4)).toBeCloseTo(1 / (1 + (8.4 / 2.5) ** 2), 12);
    expect(lanternShape(10.2)).toBeCloseTo(0.5 / (1 + (10.2 / 2.5) ** 2), 12);
    expect(lanternShape(12)).toBe(0);
    expect(lanternShape(30)).toBe(0);
    expect(lanternFalloff(2)).toBeCloseTo(LANTERN.intensity / 1.64, 12);
    let last = Infinity;
    for (let d = 0; d <= 13; d += 0.05) {
      const v = lanternShape(d);
      expect(v).toBeLessThanOrEqual(last);
      expect(v).toBeGreaterThanOrEqual(0);
      last = v;
    }
  });

  it('lights a cave wall 2 m away as bright as the brightest gate-lamp pool (display 0.55 through AgX)', () => {
    // The limestone and default walls' mean linear albedo (luminance), at the caves' exposure.
    const albedo = 0.0816;
    const exposure = 2.378414230005442;
    const warm = new Color(LANTERN.colour);
    expect([warm.r, warm.g, warm.b].map((v) => +v.toFixed(3))).toEqual([1, 0.456, 0.095]);
    const lit = [warm.r, warm.g, warm.b].map((v) => v * albedo * lanternFalloff(2));
    expect(agxDisplayLuma(lit, exposure)).toBeCloseTo(0.55, 2);
    // Nearer is brighter and stays under white; 6 m away it is well down.
    const at = (d: number) =>
      agxDisplayLuma(
        [warm.r, warm.g, warm.b].map((v) => v * albedo * lanternFalloff(d)),
        exposure,
      );
    expect(at(0.5)).toBeLessThan(1);
    expect(at(0.5)).toBeGreaterThan(at(2));
    expect(at(6)).toBeLessThan(0.4);
  });
});

describe('the flicker', () => {
  it('moves the light by at most 4 % (3 % as set), slowly, with nothing fast enough to strobe', () => {
    expect(LANTERN.flicker).toBeLessThanOrEqual(0.04);
    let lo = Infinity;
    let hi = -Infinity;
    let steepest = 0;
    let prev = flickerAt(0);
    const dt = 1 / 240;
    for (let t = dt; t < 600; t += dt) {
      const f = flickerAt(t);
      lo = Math.min(lo, f);
      hi = Math.max(hi, f);
      steepest = Math.max(steepest, Math.abs(f - prev) / dt);
      prev = f;
    }
    expect(hi).toBeLessThanOrEqual(1 + LANTERN.flicker + 1e-12);
    expect(lo).toBeGreaterThanOrEqual(1 - LANTERN.flicker - 1e-12);
    expect(hi - lo).toBeGreaterThan(LANTERN.flicker); // it does move
    for (const hz of FLICKER_HZ) expect(hz).toBeLessThan(3);
    // At most about a quarter of the depth per second: a slow breathing, not a flash.
    expect(steepest).toBeLessThan(0.3);
  });
});

const area = (name: string, extras: Record<string, unknown>) => {
  const o = new Object3D();
  o.name = name;
  o.userData = extras;
  return o;
};

describe('where the lantern is carried', () => {
  it('in cave areas: the index kind cave, the area kind cave, or wdi_lantern on the scene or the area', () => {
    expect(lanternWanted({ kind: 'cave' })).toBe(true);
    expect(lanternWanted({ area: area('Area_under_swallow', { wdi_kind: 'cave' }) })).toBe(true);
    expect(lanternWanted({ sceneExtras: { wdi_lantern: true } })).toBe(true);
    expect(lanternWanted({ area: area('Area_x', { wdi_lantern: true }) })).toBe(true);
  });

  it('not in the village, the wild areas or the rooms; wdi_lantern false turns it off even in a cave', () => {
    expect(lanternWanted({})).toBe(false);
    expect(lanternWanted({ kind: 'village' })).toBe(false);
    expect(lanternWanted({ kind: 'room', area: area('Area_room_widow_bedroom', { wdi_baked: true }) })).toBe(
      false,
    );
    expect(lanternWanted({ area: area('Area_village', { wdi_exposure: 2 }) })).toBe(false);
    expect(lanternWanted({ kind: 'cave', area: area('Area_c', { wdi_lantern: false }) })).toBe(false);
    expect(lanternWanted({ kind: 'cave', sceneExtras: { wdi_lantern: false } })).toBe(false);
    expect(lanternWanted({ sceneExtras: 'not extras', area: null })).toBe(false);
  });

  it('a file is patched when any of its areas can want it', () => {
    const village = area('Area_village', {});
    const mouth = area('Area_tin_mouth', { wdi_kind: 'cave' });
    expect(lanternAnywhere({ areas: [village] })).toBe(false);
    expect(lanternAnywhere({ areas: [village, mouth] })).toBe(true);
    expect(lanternAnywhere({ kind: 'cave', areas: [] })).toBe(true);
    expect(lanternAnywhere({ sceneExtras: { wdi_lantern: true }, areas: [] })).toBe(true);
    expect(lanternAnywhere({ areas: [] })).toBe(false);
  });
});

/** Compiles `material` as three would: its onBeforeCompile on the basic shader's source. */
function compile(material: MeshBasicMaterial): WebGLProgramParametersWithUniforms {
  const shader = {
    vertexShader: ShaderLib.basic.vertexShader,
    fragmentShader: ShaderLib.basic.fragmentShader,
    uniforms: {},
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
}

describe('the lantern in the unlit shader', () => {
  it("finds its anchors in three's basic shader, and adds the light to the base colour before tone mapping", () => {
    const out = injectLantern(ShaderLib.basic.vertexShader, ShaderLib.basic.fragmentShader)!;
    expect(out).not.toBeNull();
    expect(out.vertex).toContain('vWdiView = mvPosition.xyz;');
    const f = out.fragment;
    // The base colour is taken after the texture and before the vertex colours (the bake) multiply it.
    expect(f.indexOf('#include <map_fragment>')).toBeLessThan(
      f.indexOf('vec3 wdiAlbedo = diffuseColor.rgb;'),
    );
    expect(f.indexOf('vec3 wdiAlbedo')).toBeLessThan(f.indexOf('#include <color_fragment>'));
    // Added to the light, before tone mapping and fog.
    const add = f.indexOf('outgoingLight += wdiAlbedo * wdiLanternColor * wdiK;');
    expect(add).toBeGreaterThan(f.indexOf('vec3 outgoingLight'));
    expect(add).toBeLessThan(f.indexOf('#include <tonemapping_fragment>'));
    expect(add).toBeLessThan(f.indexOf('#include <fog_fragment>'));
    expect(f).toContain('smoothstep( 0.7 * wdiLanternRange.y, wdiLanternRange.y, wdiD )');
    expect(injectLantern('void main() {}', ShaderLib.basic.fragmentShader)).toBeNull();
  });

  it('patches unlit materials once, skips lit ones and emitters, and shares one set of uniforms', () => {
    const root = new Group();
    const wall = new MeshBasicMaterial({ name: 'cave_limestone_wall', vertexColors: true });
    const floor = new MeshBasicMaterial({ name: 'cave_limestone_floor' });
    const glass = new MeshBasicMaterial({ name: 'cave_lamp_glass' });
    const sky = new MeshBasicMaterial({ name: 'cave_vista_sky' });
    const lit = new MeshStandardMaterial({ name: 'cave_lit' });
    const g = new PlaneGeometry();
    root.add(
      new Mesh(g, wall),
      new Mesh(g, [floor, glass]),
      new Mesh(g, sky),
      new Mesh(g, lit),
      new Mesh(g, wall),
    );
    expect(patchLantern(root)).toBe(2);
    expect(patchLantern(root)).toBe(0); // once
    expect([wall, floor, glass, sky, lit].map(hasLantern)).toEqual([true, true, false, false, false]);
    expect(takesLantern(lit)).toBe(false);
    const opted = new MeshBasicMaterial({ name: 'cave_x' });
    opted.userData.wdi_lantern = false;
    expect(takesLantern(opted)).toBe(false);
    // One program for every patched material, and the same uniform objects in each.
    expect(wall.customProgramCacheKey()).toBe(floor.customProgramCacheKey());
    const a = compile(wall);
    const b = compile(floor);
    expect(a.fragmentShader).toContain('wdiLanternColor');
    expect(a.uniforms.wdiLanternPos).toBe(lanternUniforms.wdiLanternPos);
    expect(b.uniforms.wdiLanternColor).toBe(lanternUniforms.wdiLanternColor);
    expect(a.uniforms.wdiLanternRange!.value.toArray()).toEqual([2.5, 12]);
  });
});

describe('the Lantern', () => {
  it('is carried 1.45 m above the feet and 0.3 m ahead of the eye, and goes into view space', () => {
    const feet = new Vector3(4, -10, 2);
    const eye = feet.clone().setY(feet.y + WALK.eyeHeight);
    const north = Lantern.place(eye, 0);
    expect(north.toArray().map((v) => +v.toFixed(6))).toEqual([4, -8.55, 1.7]);
    const east = Lantern.place(eye, -Math.PI / 2); // yaw -90 degrees looks along +X
    expect(east.x).toBeCloseTo(4.3, 9);
    expect(east.z).toBeCloseTo(2, 9);
    expect(east.y - feet.y).toBeCloseTo(1.45, 9);
    const u = {
      wdiLanternPos: { value: new Vector3() },
      wdiLanternColor: { value: new Color() },
      wdiLanternRange: { value: lanternUniforms.wdiLanternRange.value },
    };
    const l = new Lantern(u);
    l.wanted = true;
    const view = new Matrix4().makeTranslation(-4, 8.55, -1.7); // the camera's inverse: lantern at the origin
    l.update(0, eye, 0, view);
    expect(u.wdiLanternPos.value.length()).toBeCloseTo(0, 9);
  });

  it('is on by default where it is wanted, toggles, and is dark where it is not wanted', () => {
    const u = {
      wdiLanternPos: { value: new Vector3() },
      wdiLanternColor: { value: new Color() },
      wdiLanternRange: { value: lanternUniforms.wdiLanternRange.value },
    };
    const l = new Lantern(u);
    const eye = new Vector3(0, 1.6, 0);
    const id = new Matrix4();
    expect(l.enabled).toBe(true);
    l.update(0.016, eye, 0, id);
    expect(l.lit).toBe(false); // not in a cave
    expect(u.wdiLanternColor.value.toArray()).toEqual([0, 0, 0]);
    l.wanted = true;
    l.update(0.016, eye, 0, id);
    expect(l.lit).toBe(true);
    const warm = new Color(LANTERN.colour).multiplyScalar(LANTERN.intensity * l.flicker);
    expect(u.wdiLanternColor.value.r).toBeCloseTo(warm.r, 9);
    expect(u.wdiLanternColor.value.g).toBeCloseTo(warm.g, 9);
    expect(u.wdiLanternColor.value.b).toBeCloseTo(warm.b, 9);
    expect(l.toggle()).toBe(false);
    l.update(0.016, eye, 0, id);
    expect(u.wdiLanternColor.value.toArray()).toEqual([0, 0, 0]);
    expect(l.toggle()).toBe(true);
    l.update(0.016, eye, 0, id);
    expect(u.wdiLanternColor.value.r).toBeGreaterThan(3.8);
    // The walker's choice holds when the area changes (a crossing), and the next cave is dark until it is wanted.
    l.toggle();
    l.wanted = false;
    l.wanted = true;
    expect(l.enabled).toBe(false);
    expect(l.lit).toBe(false);
  });
});

/** A one-quad cave file as glTF JSON: an unlit wall (with a texture and baked vertex colours) and the lamp's glass
 * under `Area_<id>`, with the area's extras and the scene's. */
function caveGltf(
  id: string,
  areaExtras: Record<string, unknown>,
  sceneExtras: Record<string, unknown> = {},
): Buffer {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const col = new Float32Array([0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2]);
  const uv = new Float32Array([0, 0, 1, 0, 0, 1]);
  const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(col.buffer), Buffer.from(uv.buffer)]);
  // A 1 x 1 PNG (grey).
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC';
  const unlit = { KHR_materials_unlit: {} };
  const json = {
    asset: { version: '2.0' },
    extensionsUsed: ['KHR_materials_unlit'],
    scene: 0,
    scenes: [{ nodes: [2], extras: sceneExtras }],
    nodes: [
      { name: `Wall_${id}`, mesh: 0 },
      { name: `Glass_${id}`, mesh: 1 },
      { name: `Area_${id}`, children: [0, 1], extras: areaExtras },
    ],
    meshes: [
      { primitives: [{ attributes: { POSITION: 0, COLOR_0: 1, TEXCOORD_0: 2 }, material: 0 }] },
      { primitives: [{ attributes: { POSITION: 0 }, material: 1 }] },
    ],
    materials: [
      {
        name: 'cave_limestone_wall',
        extensions: unlit,
        pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
      },
      {
        name: 'cave_lamp_glass',
        extensions: unlit,
        pbrMetallicRoughness: { baseColorFactor: [1, 0.2, 0, 1] },
      },
    ],
    textures: [{ source: 0 }],
    images: [{ uri: `data:image/png;base64,${png}` }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: 3, type: 'VEC2' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 36 },
      { buffer: 0, byteOffset: 72, byteLength: 24 },
    ],
    buffers: [
      { byteLength: bin.length, uri: `data:application/octet-stream;base64,${bin.toString('base64')}` },
    ],
  };
  return Buffer.from(JSON.stringify(json), 'utf8');
}

const caveArea = (id: string) => ({
  id,
  file: `walk-${id}.gltf`,
  bytes: 0,
  sha256: '',
  kind: 'cave',
  scene: 'undermere',
  name: id,
  spawns: [],
  portals: [],
});

describe('the lantern across area swaps', () => {
  it('loads unlit cave materials from glTF, patches them, and leaves nothing behind when the area is freed', async () => {
    const files = new Map([
      ['http://walk.test/walk-cave_a.gltf', caveGltf('cave_a', { wdi_kind: 'cave' })],
      ['http://walk.test/walk-cave_b.gltf', caveGltf('cave_b', {}, { wdi_lantern: true })],
      ['http://walk.test/walk-room_c.gltf', caveGltf('room_c', { wdi_indoor: true })],
    ]);
    const swap = new AreaSwap(memoryIo(files));
    const a = await swap.open(caveArea('cave_a'), 'http://walk.test/walk-cave_a.gltf');
    const sceneOf = (w: typeof a.world) => w.root.userData;
    expect(lanternAnywhere({ kind: null, sceneExtras: sceneOf(a.world), areas: a.world.areas })).toBe(true);
    const aMaterials = [...resourcesOf(a.world.root).materials];
    expect(aMaterials.map((m) => [m.name, m.type])).toEqual([
      ['cave_limestone_wall', 'MeshBasicMaterial'],
      ['cave_lamp_glass', 'MeshBasicMaterial'],
    ]);
    expect(patchLantern(a.world.root)).toBe(1);
    const disposed: string[] = [];
    for (const m of aMaterials) m.addEventListener('dispose', () => disposed.push(m.name));

    // Crossing into b frees a's materials (and so their programs), patched or not.
    const b = await swap.open(caveArea('cave_b'), 'http://walk.test/walk-cave_b.gltf');
    expect(disposed.sort()).toEqual(['cave_lamp_glass', 'cave_limestone_wall']);
    expect(lanternAnywhere({ kind: null, sceneExtras: sceneOf(b.world), areas: b.world.areas })).toBe(true);
    expect(patchLantern(b.world.root)).toBe(1);
    // The shared uniforms hold no material, texture or geometry of any area.
    for (const u of Object.values(lanternUniforms))
      expect((u.value as { isTexture?: boolean }).isTexture).toBeFalsy();

    // A room is not patched (the page asks lanternAnywhere first).
    const c = await swap.open({ ...caveArea('room_c'), kind: 'room' }, 'http://walk.test/walk-room_c.gltf');
    expect(lanternAnywhere({ kind: 'room', sceneExtras: sceneOf(c.world), areas: c.world.areas })).toBe(
      false,
    );
    expect([...resourcesOf(c.world.root).materials].some(hasLantern)).toBe(false);
    disposeWorld(c.world);
  });

  it('a built world keeps its patched materials disposable like any other', () => {
    const root = new Group();
    const zone = new Object3D();
    zone.name = 'Area_under_t';
    zone.userData = { wdi_kind: 'cave' };
    const tex = new Texture();
    const m = new MeshBasicMaterial({ name: 'cave_slate_wall', map: tex });
    zone.add(new Mesh(new PlaneGeometry(), m));
    root.add(zone);
    const w = buildWorld(root);
    expect(lanternAnywhere({ areas: w.areas })).toBe(true);
    expect(patchLantern(w.root)).toBe(1);
    let freed = 0;
    m.addEventListener('dispose', () => freed++);
    tex.addEventListener('dispose', () => freed++);
    const report = disposeWorld(w);
    expect(report.materials).toBe(1);
    expect(report.textures).toBe(1);
    expect(freed).toBe(2);
  });
});
