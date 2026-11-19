import { Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { SIDLE, TRAVERSE } from './config';
import { SPAWN_PREFIX } from './spawn';

export const TRAVERSE_PREFIX = 'Trav_';
export const TRAVERSE_KINDS = ['crawl', 'sidle', 'climb'] as const;
/** A traversal zone's kind, its `wdi_traverse` extra. */
export type TraverseKind = (typeof TRAVERSE_KINDS)[number];
/** What the walker is doing: walking, or the traversal mode a zone put it in. */
export type Mode = 'walk' | TraverseKind;

/** The word the HUD shows while a mode lasts. */
export const MODE_HINT: Readonly<Record<TraverseKind, string>> = {
  crawl: 'Crawling',
  sidle: 'Sideways',
  climb: 'Climbing',
};

export function isTraverseKind(v: unknown): v is TraverseKind {
  return typeof v === 'string' && (TRAVERSE_KINDS as readonly string[]).includes(v);
}

const LOCAL = new Vector3();

/**
 * A `Trav_<id>` zone: a box `size` metres across in its node's frame, placed by the node's world position and
 * rotation (its scale is ignored). +X runs along the passage and +Y is up; on a climb, +Z points out of the wall
 * towards the walker and the face is the box's z = 0 plane.
 */
export class TraverseZone {
  /** Half the box along each of its axes, metres. */
  readonly half: Vector3;
  readonly origin = new Vector3();
  /** The box's axes in world space, unit vectors. */
  readonly axisX = new Vector3();
  readonly axisY = new Vector3();
  readonly axisZ = new Vector3();
  /** The X and Z axes laid on the ground plane, unit vectors, for the horizontal input. */
  readonly flatX = new Vector3();
  readonly flatZ = new Vector3();

  constructor(
    readonly id: string,
    readonly kind: TraverseKind,
    size: readonly [number, number, number],
    position: Vector3,
    rotation: Quaternion,
  ) {
    this.half = new Vector3(size[0] / 2, size[1] / 2, size[2] / 2);
    this.origin.copy(position);
    this.axisX.set(1, 0, 0).applyQuaternion(rotation);
    this.axisY.set(0, 1, 0).applyQuaternion(rotation);
    this.axisZ.set(0, 0, 1).applyQuaternion(rotation);
    flatten(this.axisX, this.flatX);
    flatten(this.axisZ, this.flatZ);
  }

  /** A zone placed by a node's world matrix, without its scale. */
  static fromMatrix(
    id: string,
    kind: TraverseKind,
    size: readonly [number, number, number],
    matrix: Matrix4,
  ): TraverseZone {
    const position = new Vector3();
    const rotation = new Quaternion();
    matrix.decompose(position, rotation, new Vector3());
    return new TraverseZone(id, kind, size, position, rotation);
  }

  /** `p` in the box's frame. */
  toLocal(p: Vector3, out = new Vector3()): Vector3 {
    const dx = p.x - this.origin.x;
    const dy = p.y - this.origin.y;
    const dz = p.z - this.origin.z;
    const { axisX: ax, axisY: ay, axisZ: az } = this;
    return out.set(
      dx * ax.x + dy * ax.y + dz * ax.z,
      dx * ay.x + dy * ay.y + dz * ay.z,
      dx * az.x + dy * az.y + dz * az.z,
    );
  }

  /** The world point at (x, y, z) in the box's frame. */
  toWorld(x: number, y: number, z: number, out = new Vector3()): Vector3 {
    return out
      .copy(this.origin)
      .addScaledVector(this.axisX, x)
      .addScaledVector(this.axisY, y)
      .addScaledVector(this.axisZ, z);
  }

  /** `p` is in the box, counted `endMargin` longer at both ends of its X axis (feet within `TRAVERSE.edge` of a
   * face count as inside). */
  contains(p: Vector3, endMargin = 0): boolean {
    const l = this.toLocal(p, LOCAL);
    const e = TRAVERSE.edge;
    return (
      Math.abs(l.x) <= this.half.x + endMargin + e &&
      Math.abs(l.y) <= this.half.y + e &&
      Math.abs(l.z) <= this.half.z + e
    );
  }
}

function flatten(axis: Vector3, out: Vector3): void {
  out.set(axis.x, 0, axis.z);
  const len = out.length();
  if (len > 1e-6) out.divideScalar(len);
  else out.set(0, 0, 0);
}

function boxSize(v: unknown): [number, number, number] | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  if (!v.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0)) return null;
  return [v[0] as number, v[1] as number, v[2] as number];
}

/** Every `Trav_<id>` node under `root` whose extras give a kind (`wdi_traverse`) and a box (`size`: three positive
 * numbers, metres), in scene order. Other `Trav_` nodes are skipped, as findPortals skips a portal without a target. */
export function findZones(root: Object3D): TraverseZone[] {
  root.updateWorldMatrix(true, true);
  const zones: TraverseZone[] = [];
  root.traverse((obj) => {
    if (!obj.name.startsWith(TRAVERSE_PREFIX)) return;
    const id = obj.name.slice(TRAVERSE_PREFIX.length);
    const x = obj.userData as Record<string, unknown>;
    const size = boxSize(x.size);
    if (!id || !isTraverseKind(x.wdi_traverse) || !size) return;
    zones.push(TraverseZone.fromMatrix(id, x.wdi_traverse, size, obj.matrixWorld));
  });
  return zones;
}

/** The mode each spawn asks to arrive in (`wdi_mode` in its extras), by spawn id, the ids read as findSpawns reads
 * them. A spawn without one, or with another value, walks. */
export function spawnModes(root: Object3D): Map<string, TraverseKind> {
  const modes = new Map<string, TraverseKind>();
  const seen = new Set<string>();
  root.traverse((obj) => {
    if (!obj.name.startsWith(SPAWN_PREFIX)) return;
    const id = obj.name.slice(SPAWN_PREFIX.length);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const mode = (obj.userData as Record<string, unknown>).wdi_mode;
    if (isTraverseKind(mode)) modes.set(id, mode);
  });
  return modes;
}

/** An angle brought into (-pi, pi]. */
export function wrapAngle(a: number): number {
  const t = (a + Math.PI) % (2 * Math.PI);
  return (t <= 0 ? t + 2 * Math.PI : t) - Math.PI;
}

/** A sidle's hold on the view: the yaw that faces its wall, and the most the view may turn away from it (radians). */
export interface ViewHold {
  yaw: number;
  max: number;
}

/**
 * The camera's side of a sidle. When a hold starts, the view turns to face its wall at `SIDLE.turnRate`; from then
 * on it is kept within the hold's angle of it; when the hold ends, the view is free. main.ts runs it on the yaw
 * once a frame.
 */
export class ViewTurn {
  private held: number | null = null;
  private turning = false;

  apply(yaw: number, hold: ViewHold | null, dt: number): number {
    if (!hold) {
      this.held = null;
      this.turning = false;
      return yaw;
    }
    if (this.held === null || Math.abs(wrapAngle(hold.yaw - this.held)) > 1e-9) this.turning = true;
    this.held = hold.yaw;
    const off = wrapAngle(hold.yaw - yaw);
    if (this.turning) {
      const step = SIDLE.turnRate * dt;
      if (Math.abs(off) > step) return yaw + Math.sign(off) * step;
      this.turning = false;
      return yaw + off;
    }
    if (off > hold.max) return yaw + off - hold.max;
    if (off < -hold.max) return yaw + off + hold.max;
    return yaw;
  }

  /** Faces the hold's wall at once, as an arrival in a sidle does; with no hold the yaw is left alone. */
  snap(yaw: number, hold: ViewHold | null): number {
    this.held = hold ? hold.yaw : null;
    this.turning = false;
    return hold ? yaw + wrapAngle(hold.yaw - yaw) : yaw;
  }
}
