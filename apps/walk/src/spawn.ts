import { Object3D, Vector3 } from 'three';

export const SPAWN_PREFIX = 'Spawn_';
export const PREFERRED_SPAWN = 'square';

export interface Spawn {
  /** The empty's name without `Spawn_`. */
  id: string;
  position: Vector3;
  /** Yaw of the empty's -Z axis (0 looks along -Z, positive turns left). */
  yaw: number;
  /** Plain words for the picker, from the `wdi_spawn` and `wdi_district` extras, else the id. */
  label: string;
}

/** `station_street` -> `Station street`; plain words are kept as they are. */
export function plainWords(raw: string): string {
  const t = raw.replace(/[_-]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function spawnLabel(id: string, extras: Record<string, unknown> = {}): string {
  const name = plainWords(typeof extras.wdi_spawn === 'string' && extras.wdi_spawn ? extras.wdi_spawn : id);
  const district = typeof extras.wdi_district === 'string' ? plainWords(extras.wdi_district) : '';
  return district && district.toLowerCase() !== name.toLowerCase() ? `${name} (${district})` : name;
}

/** Yaw that looks along a horizontal direction (dx, dz). */
export function yawFromDirection(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/** The spawn to start at: the requested one, else `square`, else the first, else none (the origin). */
export function pickSpawn<T extends { id: string }>(
  spawns: readonly T[],
  requested?: string | null,
): T | null {
  if (requested) {
    const asked = spawns.find((s) => s.id === requested);
    if (asked) return asked;
  }
  return spawns.find((s) => s.id === PREFERRED_SPAWN) ?? spawns[0] ?? null;
}

/** Every `Spawn_<id>` object under `root`, in scene order, with its world position and facing. */
export function findSpawns(root: Object3D): Spawn[] {
  root.updateWorldMatrix(true, true);
  const spawns: Spawn[] = [];
  const seen = new Set<string>();
  const forward = new Vector3();
  root.traverse((obj) => {
    if (!obj.name.startsWith(SPAWN_PREFIX)) return;
    const id = obj.name.slice(SPAWN_PREFIX.length);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const position = new Vector3().setFromMatrixPosition(obj.matrixWorld);
    forward.set(0, 0, -1).transformDirection(obj.matrixWorld);
    spawns.push({
      id,
      position,
      yaw: yawFromDirection(forward.x, forward.z),
      label: spawnLabel(id, obj.userData as Record<string, unknown>),
    });
  });
  return spawns;
}
