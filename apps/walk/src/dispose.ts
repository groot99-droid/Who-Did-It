import type { BufferGeometry, InstancedMesh, Light, Material, Mesh, Object3D, Texture } from 'three';
import type { World } from './world';

/** What a deep dispose freed: counts of distinct objects. */
export interface DisposeReport {
  geometries: number;
  materials: number;
  textures: number;
  /** ImageBitmaps (and other images with a `close`) closed: three's dispose leaves them open. */
  bitmaps: number;
  instanced: number;
  /** The collider's merged geometry and its BVH were let go. */
  collider: boolean;
}

/** Every texture a material holds: in its own fields (map, normalMap ...) and in a shader material's uniforms. */
export function texturesOf(material: Material): Texture[] {
  const found = new Set<Texture>();
  const take = (v: unknown) => {
    if (v && typeof v === 'object' && (v as Texture).isTexture) found.add(v as Texture);
  };
  for (const v of Object.values(material)) take(v);
  const uniforms = (material as { uniforms?: Record<string, { value?: unknown }> }).uniforms;
  if (uniforms) for (const u of Object.values(uniforms)) take(u?.value);
  return [...found];
}

/** The distinct geometries, materials and textures under `root` (what a dispose of it frees). */
export function resourcesOf(root: Object3D): {
  geometries: Set<BufferGeometry>;
  materials: Set<Material>;
  textures: Set<Texture>;
  instanced: Set<InstancedMesh>;
} {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const instanced = new Set<InstancedMesh>();
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of mats) {
      materials.add(m);
      for (const t of texturesOf(m)) textures.add(t);
    }
    if ((obj as InstancedMesh).isInstancedMesh) instanced.add(obj as InstancedMesh);
  });
  return { geometries, materials, textures, instanced };
}

/** Bytes the textures under `root` hold as RGBA8 with a full chain of smaller copies (the contract's measure,
 * section 9), and the bytes of every geometry attribute and index. An estimate of what the GPU holds for it. */
export function memoryOf(root: Object3D): {
  textures: number;
  textureBytes: number;
  geometries: number;
  geometryBytes: number;
} {
  const { geometries, textures } = resourcesOf(root);
  let textureBytes = 0;
  for (const t of textures) {
    const img = t.image as { width?: number; height?: number } | null;
    if (img?.width && img.height) textureBytes += Math.round((img.width * img.height * 4 * 4) / 3);
  }
  let geometryBytes = 0;
  for (const g of geometries) {
    for (const a of Object.values(g.attributes))
      geometryBytes += (a.array as ArrayLike<number> & { byteLength: number }).byteLength;
    if (g.index) geometryBytes += (g.index.array as ArrayLike<number> & { byteLength: number }).byteLength;
  }
  return { textures: textures.size, textureBytes, geometries: geometries.size, geometryBytes };
}

/**
 * Frees everything under `root`: each geometry, material and texture once (three frees a texture's GPU copy only on
 * its own `dispose`, never through its material's), the instanced meshes' buffers, and the decoded images: an
 * ImageBitmap is closed (three never closes one) and the texture lets go of it. The caller removes `root` from the
 * scene first and drops its own references.
 */
export function disposeTree(root: Object3D): DisposeReport {
  const { geometries, materials, textures, instanced } = resourcesOf(root);
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
  let bitmaps = 0;
  for (const t of textures) {
    t.dispose();
    const img = t.image as { close?: () => void } | null;
    if (img && typeof img.close === 'function') {
      img.close();
      bitmaps++;
    }
    t.source.data = null;
  }
  for (const i of instanced) i.dispose();
  // A light frees its shadow map (shadows are off today, so there is none to free).
  root.traverse((o) => {
    if ((o as Light).isLight) (o as Light).dispose();
  });
  return {
    geometries: geometries.size,
    materials: materials.size,
    textures: textures.size,
    bitmaps,
    instanced: instanced.size,
    collider: false,
  };
}

/** Frees a whole world: its tree (disposeTree) and the collider's merged geometry with its BVH. */
export function disposeWorld(world: World): DisposeReport {
  const report = disposeTree(world.root);
  world.collider.geometry.dispose();
  // three-mesh-bvh keeps its tree on the MeshBVH object; nothing references it once the world is dropped.
  return { ...report, collider: true };
}
