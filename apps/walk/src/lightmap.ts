import {
  SRGBColorSpace,
  type Material,
  type Mesh,
  type MeshBasicMaterial,
  type Object3D,
  type Texture,
} from 'three';
import type { GLTF, GLTFLoaderPlugin, GLTFParser } from 'three/addons/loaders/GLTFLoader.js';

// A cave's lightmap (docs/walk-areas.md, "A cave's lightmap"). The cave shell's light is baked into one page per file,
// on the shell's second UV set (TEXCOORD_1). The file carries it as the material's `emissiveTexture` and says so in
// the material's extras (`wdi_lightmap`), because GLTFLoader reads no emissive for an unlit material. This module sets
// the page as the material's `lightMap`: three's basic shader then shows base colour x page, where it showed base
// colour x COLOR_0. A material without the extra, or a file without a page, is left as it was. (The baked ambient
// occlusion the lantern reads is not in the page: it is the `_OCCL` vertex attribute, lantern.ts.)

/** What a lightmapped material's extras say (`wdi_lightmap`). */
export interface LightmapInfo {
  page?: number;
  texCoord?: number;
  /** S: the page holds the light divided by this (at most 1). */
  scale?: number;
  encoding?: string;
  /** The primitives carry COLOR_0 too, the same light per vertex, for a viewer that cannot read the page. */
  vertex_fallback?: boolean;
}

/** The material's lightmap extras, or null. */
export function lightmapInfo(material: Material): LightmapInfo | null {
  const info = (material.userData as Record<string, unknown>).wdi_lightmap;
  return typeof info === 'object' && info !== null && !Array.isArray(info) ? (info as LightmapInfo) : null;
}

interface MaterialDef {
  emissiveTexture?: { index: number; texCoord?: number };
}

/**
 * Hooks every lightmapped material under `scene` up to its page: `lightMap` the page (sRGB, on the UV set the file
 * names, 1 by default), `lightMapIntensity` S x pi (three's basic shader divides the light map by pi), and
 * `vertexColors` false (GLTFLoader turned them on for COLOR_0, and the page already holds that light). Returns how
 * many materials it hooked. A file without pages, or a material that has none, is left alone.
 */
export async function hookLightmaps(parser: GLTFParser, scene: Object3D): Promise<number> {
  const defs = (parser.json as { materials?: MaterialDef[] }).materials ?? [];
  const jobs: Promise<boolean>[] = [];
  const seen = new Set<Material>();
  scene.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (seen.has(m)) continue;
      seen.add(m);
      const info = lightmapInfo(m);
      if (!info || (m as MeshBasicMaterial).lightMap) continue;
      const assoc = parser.associations.get(m) as { materials?: number } | undefined;
      const slot = assoc?.materials === undefined ? undefined : defs[assoc.materials]?.emissiveTexture;
      if (!slot) continue;
      const material = m as MeshBasicMaterial;
      jobs.push(
        (parser.getDependency('texture', slot.index) as Promise<Texture>).then((tex) => {
          tex.colorSpace = SRGBColorSpace;
          tex.channel = slot.texCoord ?? info.texCoord ?? 1;
          material.lightMap = tex;
          material.lightMapIntensity = (info.scale ?? 1) * Math.PI;
          material.vertexColors = false;
          material.needsUpdate = true;
          return true;
        }),
      );
    }
  });
  return (await Promise.all(jobs)).length;
}

/** A GLTFLoader plugin that hooks a file's lightmap pages up once it is parsed (`afterRoot`). */
export class LightmapPlugin implements GLTFLoaderPlugin {
  readonly name = 'WDI_lightmap';
  constructor(readonly parser: GLTFParser) {}
  async afterRoot(result: GLTF): Promise<void> {
    await hookLightmaps(this.parser, result.scene);
  }
}

/** Whether a material is shown with its page: a lightMap and no vertex colours. */
export function hasLightmap(material: Material): boolean {
  const m = material as MeshBasicMaterial;
  return !!m.lightMap && !m.vertexColors;
}

/** How many materials under `root` are shown with their page (for the debug readout). */
export function countLightmapped(root: Object3D): number {
  const seen = new Set<Material>();
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      if (hasLightmap(m)) seen.add(m);
  });
  return seen.size;
}
