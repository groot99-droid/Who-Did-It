import { Color, DirectionalLight, Fog, FogExp2, Light, Mesh, Object3D, Vector3 } from 'three';
import { exposureFromExtras } from './look';
import { BvhCollider } from './physics/collider';
import { findPortals, type Portal } from './portals';
import { findSpawns, type Spawn } from './spawn';
import { findZones, spawnModes, type TraverseKind, type TraverseZone } from './traverse';

export const COLLISION_NAME = 'HM_Collision';
export const AREA_PREFIX = 'Area_';

export interface World {
  root: Object3D;
  collider: BvhCollider;
  spawns: Spawn[];
  /** `HM_Collision`, or `all meshes` when the GLB has none. */
  collisionSource: string;
  hasLights: boolean;
  /** A directional light (a sun or moon) is in the GLB; without one the look's moon and sky light are added. */
  hasSun: boolean;
  /** The `Area_*` objects (Area_village at the origin, the wild areas 900 m and more away); one shows at a time. */
  areas: Object3D[];
  /** The `Portal_*` doors, in every area. */
  portals: Portal[];
  /** The `Trav_*` traversal zones (crawl, sidle, climb), in every area; none in a file without them. */
  zones: TraverseZone[];
  /** The mode a spawn asks to arrive in (its `wdi_mode`), by spawn id. */
  spawnModes: Map<string, TraverseKind>;
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

/** Every `Area_*` object under `root`, outermost only. */
export function findAreas(root: Object3D): Object3D[] {
  const areas: Object3D[] = [];
  root.traverse((o) => {
    if (o.name.startsWith(AREA_PREFIX) && !areas.some((a) => isAncestor(a, o))) areas.push(o);
  });
  return areas;
}

const at = new Vector3();
/** The area whose origin is nearest (x, z) on the ground plane, or null when there are none. */
export function nearestArea(areas: readonly Object3D[], x: number, z: number): Object3D | null {
  let best: Object3D | null = null;
  let bestD = Infinity;
  for (const a of areas) {
    a.getWorldPosition(at);
    const d = (at.x - x) ** 2 + (at.z - z) ** 2;
    if (d < bestD) [best, bestD] = [a, d];
  }
  return best;
}

/** Shows only the area nearest (x, z), so one area never draws another (its lights included). */
export function showNearestArea(areas: readonly Object3D[], x: number, z: number): void {
  const keep = nearestArea(areas, x, z);
  for (const a of areas) a.visible = a === keep;
}

/** What an area changes when the player is in it: from its extras, and indoors for `wdi_indoor` or `Area_room_`. */
export interface AreaLook {
  /** Indoors: no moon, sky light or sky dome. */
  indoor: boolean;
  /** Light baked into the vertex colours of unlit materials (`wdi_baked`); its live lights are off. */
  baked: boolean;
  fog: Fog | FogExp2 | null;
  exposure: number | null;
}

export function areaLook(area: Object3D | null): AreaLook {
  const x = (area?.userData ?? {}) as Record<string, unknown>;
  return {
    indoor: x.wdi_indoor === true || (area?.name.startsWith(`${AREA_PREFIX}room_`) ?? false),
    baked: x.wdi_baked === true,
    fog: fogFromExtras(x),
    exposure: exposureFromExtras(x),
  };
}

/**
 * A `wdi_baked` area has its light baked in Cycles into COLOR_0 under KHR_materials_unlit, which three loads as
 * MeshBasicMaterial with vertex colours: scene-linear radiance, so AgX and the area's `wdi_exposure` render it as
 * Blender's view does, and no live light can reach it. The area's exported lights are switched off, so they cost
 * nothing and light no lit prop on top of the bake.
 */
export function switchOffBakedLights(areas: readonly Object3D[]): void {
  for (const area of areas)
    if (areaLook(area).baked)
      area.traverse((o) => {
        if ((o as Light).isLight) o.visible = false;
      });
}

/** `wdi_cast_shadow: false` on a node (a lamp mesh, an instance holder) keeps it and everything under it from
 * casting shadows, instanced meshes included; the lights sit inside those meshes. Shadows are off by default. */
export function applyShadowFlags(root: Object3D): void {
  root.traverse((obj) => {
    if ((obj.userData as Record<string, unknown>).wdi_cast_shadow === false)
      obj.traverse((o) => {
        o.castShadow = false;
      });
  });
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
  applyShadowFlags(root);
  const areas = findAreas(root);
  switchOffBakedLights(areas);
  let hasLights = false;
  let hasSun = false;
  root.traverse((obj) => {
    if ((obj as Light).isLight) hasLights = true;
    if ((obj as DirectionalLight).isDirectionalLight) hasSun = true;
  });
  return {
    root,
    collider,
    spawns: findSpawns(root),
    collisionSource: source,
    hasLights,
    hasSun,
    areas,
    portals: findPortals(root),
    zones: findZones(root),
    spawnModes: spawnModes(root),
    fog: fogFromExtras(extras),
  };
}
