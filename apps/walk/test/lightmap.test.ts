import { Mesh, MeshBasicMaterial, SRGBColorSpace } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { disposeWorld, resourcesOf } from '../src/dispose';
import { countLightmapped, hasLightmap, hookLightmaps, LightmapPlugin, lightmapInfo } from '../src/lightmap';
import { patchLantern } from '../src/lantern';
import { buildWorld } from '../src/world';
import './helpers/node-gltf';

// A cave's lightmap (docs/walk-areas.md, "A cave's lightmap"): one triangle drawn with an unlit material that has the
// scan on TEXCOORD_0 and a page on TEXCOORD_1 (the emissiveTexture), with and without the COLOR_0 fallback, a copy
// of the material without a page (a seam face) and a material the file gives no page.

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC';

function gltf(opts: { withColor: boolean; page: boolean }): string {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const uv = new Float32Array([0, 0, 1, 0, 0, 1]);
  const col = new Float32Array(9).fill(0.2);
  const parts = [Buffer.from(pos.buffer), Buffer.from(uv.buffer), Buffer.from(uv.buffer)];
  if (opts.withColor) parts.push(Buffer.from(col.buffer));
  const bin = Buffer.concat(parts);
  const attributes: Record<string, number> = { POSITION: 0, TEXCOORD_0: 1, TEXCOORD_1: 2 };
  if (opts.withColor) attributes.COLOR_0 = 3;
  const unlit = { KHR_materials_unlit: {} };
  const lit = {
    name: 'cave_limestone_wall',
    extensions: unlit,
    pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
    ...(opts.page
      ? {
          emissiveTexture: { index: 1, texCoord: 1 },
          emissiveFactor: [0.5, 0.5, 0.5],
          extras: {
            wdi_lightmap: {
              page: 0,
              texCoord: 1,
              scale: 0.5,
              encoding: 'srgb',
              vertex_fallback: opts.withColor,
            },
          },
        }
      : {}),
  };
  const accessors = [
    { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
    { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' },
    { bufferView: 2, componentType: 5126, count: 3, type: 'VEC2' },
    ...(opts.withColor ? [{ bufferView: 3, componentType: 5126, count: 3, type: 'VEC3' }] : []),
  ];
  const sizes = [36, 24, 24, 36];
  let at = 0;
  const bufferViews = accessors.map((_a, i) => {
    const v = { buffer: 0, byteOffset: at, byteLength: sizes[i]! };
    at += sizes[i]!;
    return v;
  });
  return JSON.stringify({
    asset: { version: '2.0' },
    extensionsUsed: ['KHR_materials_unlit'],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Area_under_t', mesh: 0, extras: { wdi_kind: 'cave' } }],
    meshes: [{ primitives: [{ attributes, material: 0 }] }],
    materials: [lit],
    textures: [{ source: 0 }, { source: 1, sampler: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9729, wrapS: 33071, wrapT: 33071 }],
    images: [{ uri: `data:image/png;base64,${PNG}` }, { uri: `data:image/png;base64,${PNG}` }],
    accessors,
    bufferViews,
    buffers: [
      { byteLength: bin.length, uri: `data:application/octet-stream;base64,${bin.toString('base64')}` },
    ],
  });
}

const withPlugin = () => new GLTFLoader().register((p) => new LightmapPlugin(p));
const wallOf = (scene: { traverse: (f: (o: unknown) => void) => void }): MeshBasicMaterial => {
  let found: MeshBasicMaterial | null = null;
  scene.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) found = mesh.material as MeshBasicMaterial;
  });
  return found!;
};

describe('the lightmap hookup', () => {
  it('sets the page as the lightMap: sRGB, on the second UV set, S x pi, and no vertex colours', async () => {
    const g = await withPlugin().parseAsync(gltf({ withColor: true, page: true }), '');
    const m = wallOf(g.scene);
    expect(lightmapInfo(m)).toMatchObject({ page: 0, texCoord: 1, scale: 0.5 });
    expect(m.lightMap).toBeTruthy();
    expect(m.lightMap!.colorSpace).toBe(SRGBColorSpace);
    expect(m.lightMap!.channel).toBe(1);
    expect(m.lightMapIntensity).toBeCloseTo(0.5 * Math.PI, 12);
    // GLTFLoader turned the vertex colours on for COLOR_0; the page holds that light, so they are off.
    expect(m.vertexColors).toBe(false);
    expect(hasLightmap(m)).toBe(true);
    expect(countLightmapped(g.scene)).toBe(1);
    // The scan stays on the first UV set.
    expect(m.map).toBeTruthy();
    expect(m.map!.channel).toBe(0);
  });

  it('a file whose primitives have no COLOR_0 is hooked the same way', async () => {
    const g = await withPlugin().parseAsync(gltf({ withColor: false, page: true }), '');
    const m = wallOf(g.scene);
    expect(hasLightmap(m)).toBe(true);
    expect(m.vertexColors).toBe(false);
  });

  it('leaves a material without a page as it was: vertex-lit, and a loader without the plugin too', async () => {
    const plain = await withPlugin().parseAsync(gltf({ withColor: true, page: false }), '');
    const m = wallOf(plain.scene);
    expect(m.lightMap).toBeNull();
    expect(m.vertexColors).toBe(true);
    expect(hasLightmap(m)).toBe(false);
    // Without the plugin the page is not read: the vertex fallback shows, as in a viewer that predates it.
    const old = await new GLTFLoader().parseAsync(gltf({ withColor: true, page: true }), '');
    const o = wallOf(old.scene);
    expect(o.lightMap).toBeNull();
    expect(o.vertexColors).toBe(true);
    // hookLightmaps can be called later and is then idempotent.
    expect(await hookLightmaps(old.parser, old.scene)).toBe(1);
    expect(hasLightmap(o)).toBe(true);
    expect(await hookLightmaps(old.parser, old.scene)).toBe(0);
  });

  it('keeps the lantern working on a lightmapped material, and frees the page with the world', async () => {
    const g = await withPlugin().parseAsync(gltf({ withColor: false, page: true }), '');
    const w = buildWorld(g.scene);
    expect(patchLantern(w.root)).toBe(1);
    const m = wallOf(w.root);
    const page = m.lightMap!;
    // Both the scan and the page are the material's textures, so the dispose reaches them.
    expect(resourcesOf(w.root).textures.has(page)).toBe(true);
    let freed = 0;
    page.addEventListener('dispose', () => freed++);
    m.addEventListener('dispose', () => freed++);
    const report = disposeWorld(w);
    expect(report.textures).toBe(2);
    expect(freed).toBe(2);
  });
});
