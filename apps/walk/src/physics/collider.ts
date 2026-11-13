import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Line3,
  Mesh,
  Object3D,
  Ray,
  Vector3,
} from 'three';
import { MeshBVH } from 'three-mesh-bvh';

/** A static world the controller collides with: ground rays and capsule push-out, in world space. */
export interface Collider {
  /** Height of the first surface hit straight down from (x, fromY, z) within `maxDist`, or null. */
  groundBelow(x: number, fromY: number, z: number, maxDist: number): number | null;
  /** Moves the capsule (axis `segment`, radius `radius`) out of the world and returns the push it needs. The
   * push is never upward: the ground rays hold the player up, so a ledge the capsule grazes only blocks it. */
  pushOut(segment: Line3, radius: number, iterations?: number): Vector3;
  readonly bounds: Box3;
}

/** One position-only geometry with every mesh under `roots` baked into world space. */
export function mergeWorldGeometry(roots: Object3D[]): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const v = new Vector3();
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    root.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const pos = mesh.geometry.getAttribute('position');
      if (!pos) return;
      const base = positions.length / 3;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        positions.push(v.x, v.y, v.z);
      }
      const index = mesh.geometry.getIndex();
      if (index) for (let i = 0; i < index.count; i++) indices.push(base + index.getX(i));
      else for (let i = 0; i < pos.count; i++) indices.push(base + i);
    });
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  const big = positions.length / 3 > 65535;
  geometry.setIndex(new BufferAttribute(big ? new Uint32Array(indices) : new Uint16Array(indices), 1));
  return geometry;
}

const DOWN = new Vector3(0, -1, 0);

/** A Collider over a world-space geometry, with three-mesh-bvh for the queries. */
export class BvhCollider implements Collider {
  readonly bvh: MeshBVH;
  readonly bounds = new Box3();
  private readonly ray = new Ray();
  private readonly seg = new Line3();
  private readonly box = new Box3();
  private readonly triPoint = new Vector3();
  private readonly capPoint = new Vector3();
  private readonly dir = new Vector3();
  private readonly normal = new Vector3();

  constructor(readonly geometry: BufferGeometry) {
    this.bvh = new MeshBVH(geometry);
    geometry.computeBoundingBox();
    if (geometry.boundingBox) this.bounds.copy(geometry.boundingBox);
  }

  static fromObjects(roots: Object3D[]): BvhCollider {
    return new BvhCollider(mergeWorldGeometry(roots));
  }

  groundBelow(x: number, fromY: number, z: number, maxDist: number): number | null {
    this.ray.origin.set(x, fromY, z);
    this.ray.direction.copy(DOWN);
    const hit = this.bvh.raycastFirst(this.ray, DoubleSide, 0, maxDist);
    return hit ? hit.point.y : null;
  }

  pushOut(segment: Line3, radius: number, iterations = 3): Vector3 {
    const seg = this.seg.copy(segment);
    const start = segment.start.clone();
    for (let pass = 0; pass < iterations; pass++) {
      let moved = false;
      this.box.makeEmpty().expandByPoint(seg.start).expandByPoint(seg.end);
      this.box.min.addScalar(-radius);
      this.box.max.addScalar(radius);
      this.bvh.shapecast({
        intersectsBounds: (b) => b.intersectsBox(this.box),
        intersectsTriangle: (tri) => {
          const dist = tri.closestPointToSegment(seg, this.triPoint, this.capPoint);
          if (dist >= radius) return false;
          const depth = radius - dist;
          if (dist > 1e-6) this.dir.subVectors(this.capPoint, this.triPoint).divideScalar(dist);
          else {
            // The axis touches the triangle: push along its normal, toward the side the axis came from.
            tri.getNormal(this.normal);
            this.dir.copy(this.normal);
          }
          if (this.dir.y > 0) {
            this.dir.y = 0;
            const flat = this.dir.length();
            if (flat < 1e-4) return false;
            this.dir.divideScalar(flat);
          }
          seg.start.addScaledVector(this.dir, depth);
          seg.end.addScaledVector(this.dir, depth);
          moved = true;
          return false;
        },
      });
      if (!moved) break;
    }
    return new Vector3().subVectors(seg.start, start);
  }
}
