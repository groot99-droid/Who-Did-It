import { Object3D, Vector3 } from 'three';

export const PORTAL_PREFIX = 'Portal_';

/** A door: a `Portal_<id>` empty with the extras {to, toSpawn, kind}. */
export interface Portal {
  id: string;
  position: Vector3;
  /** A scene id from packages/content/data/scenes (`overworld` is the village). */
  to: string;
  toSpawn: string;
  kind: string;
}

/** Every `Portal_<id>` under `root` with a `to` and a `toSpawn`, at its world position. */
export function findPortals(root: Object3D): Portal[] {
  root.updateWorldMatrix(true, true);
  const portals: Portal[] = [];
  root.traverse((obj) => {
    if (!obj.name.startsWith(PORTAL_PREFIX)) return;
    const x = obj.userData as Record<string, unknown>;
    if (typeof x.to !== 'string' || typeof x.toSpawn !== 'string') return;
    portals.push({
      id: obj.name.slice(PORTAL_PREFIX.length),
      position: new Vector3().setFromMatrixPosition(obj.matrixWorld),
      to: x.to,
      toSpawn: x.toSpawn,
      kind: typeof x.kind === 'string' ? x.kind : 'door',
    });
  });
  return portals;
}

/** The spawn a portal leads to: `<to>_<toSpawn>`, else `<toSpawn>` alone (flagged as a fallback), else none. */
export function resolvePortal<T extends { id: string }>(
  portal: Portal,
  spawns: readonly T[],
): { spawn: T; fallback: boolean } | null {
  const exact = spawns.find((s) => s.id === `${portal.to}_${portal.toSpawn}`);
  if (exact) return { spawn: exact, fallback: false };
  const loose = spawns.find((s) => s.id === portal.toSpawn);
  return loose ? { spawn: loose, fallback: true } : null;
}

/**
 * Decides when a portal fires: on walking within `radius` of it, or on use within `useRadius`. Walking in only
 * fires once the player has been outside every portal's radius since the last trip, so arriving next to the
 * return door never bounces the player straight back.
 */
export class PortalTrigger {
  private armed = false;

  constructor(
    private readonly portals: readonly Portal[],
    readonly radius = 1,
    readonly useRadius = 2,
  ) {}

  /** Call after every move that was not a walk (a spawn, a portal trip). */
  disarm(): void {
    this.armed = false;
  }

  /** The nearest portal within `max` metres on the ground plane (and 2 m of height), or null. */
  nearest(at: Vector3, max: number): Portal | null {
    let best: Portal | null = null;
    let bestD = max;
    for (const p of this.portals) {
      if (Math.abs(p.position.y - at.y) > 2) continue;
      const d = Math.hypot(p.position.x - at.x, p.position.z - at.z);
      if (d <= bestD) [best, bestD] = [p, d];
    }
    return best;
  }

  /** The portal to take this frame, or null. */
  update(at: Vector3, use: boolean): Portal | null {
    if (use) {
      const near = this.nearest(at, this.useRadius);
      if (near) {
        this.armed = false;
        return near;
      }
    }
    const inside = this.nearest(at, this.radius);
    if (!inside) {
      this.armed = true;
      return null;
    }
    if (!this.armed) return null;
    this.armed = false;
    return inside;
  }
}
