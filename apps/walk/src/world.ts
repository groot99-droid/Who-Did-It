import { Color, Fog, FogExp2, Light, Mesh, Object3D } from 'three';
import { BvhCollider } from './physics/collider';
import { findSpawns, type Spawn } from './spawn';

export const COLLISION_NAME = 'HM_Collision';

export interface World {
  root: Object3D;
  collider: BvhCollider;
  spawns: Spawn[];
  /** `HM_Collision`, or `all meshes` when the GLB has none. */
  collisionSource: string;
  hasLights: boolean;
  fog: Fog | FogExp2 | null;
}

/** The world's collision roots: the `HM_Collision` object (hidden), or every mesh when the GLB has none. */
export function collisionRoots(root: Object3D): { roots: Object3D[]; source: string } {
  const named: Object3D[] = [];
  root.traverse((obj) => {
    if (obj.name === COLLISION_NAME || obj.name.startsWith(`${COLLISION_NAME}_`)) named.push(obj);
  });
  // Only the outermost match, so a mesh under a group of the same name is not counted twice.
  const roots = named.filter((o) => !named.some((other) => other !== o && isAncestor(other, o)));
  if (roots.length > 0) return { roots, source: COLLISION_NAME };
  const meshes: Object3D[] = [];
  root.traverse((obj) => {
    if ((obj as Mesh).isMesh) meshes.push(obj);
  });
  return { roots: meshes, source: 'all meshes' };
}

function isAncestor(a: Object3D, b: Object3D): boolean {
  for (let p = b.parent; p; p = p.parent) if (p === a) return true;
  return false;
}

/** Fog from the scene's glTF extras (Blender custom properties): `fog_color` with `fog_near` and `fog_far`,
 * or with `fog_density`. */
export function fogFromExtras(extras: Record<string, unknown> | undefined): Fog | FogExp2 | null {
  if (!extras) return null;
  const raw = extras.fog_color;
  let color: Color | null = null;
  if (typeof raw === 'string') color = new Color(raw);
  else if (Array.isArray(raw) && raw.length >= 3 && raw.every((n) => typeof n === 'number'))
    color = new Color().setRGB(raw[0] as number, raw[1] as number, raw[2] as number);
  if (!color) return null;
  const density = extras.fog_density;
  if (typeof density === 'number' && density > 0) return new FogExp2(color, density);
  const near = typeof extras.fog_near === 'number' ? extras.fog_near : 10;
  const far = typeof extras.fog_far === 'number' ? extras.fog_far : 200;
  return new Fog(color, near, far);
}

/** Turns a loaded glTF scene into a walkable world. */
export function buildWorld(root: Object3D, extras?: Record<string, unknown>): World {
  root.updateWorldMatrix(true, true);
  const { roots, source } = collisionRoots(root);
  const collider = BvhCollider.fromObjects(roots);
  if (source === COLLISION_NAME) for (const r of roots) r.visible = false;
  let hasLights = false;
  root.traverse((obj) => {
    if ((obj as Light).isLight) hasLights = true;
  });
  return {
    root,
    collider,
    spawns: findSpawns(root),
    collisionSource: source,
    hasLights,
    fog: fogFromExtras(extras),
  };
}
