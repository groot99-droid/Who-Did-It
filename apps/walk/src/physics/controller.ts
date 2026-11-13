import { Line3, Vector3 } from 'three';
import { WALK } from '../config';
import type { Collider } from './collider';

export type WalkParams = { -readonly [K in keyof typeof WALK]: number };

/** What the player wants this frame: a horizontal direction in world space (length 0 to 1) and run. */
export interface Wish {
  x: number;
  z: number;
  run: boolean;
}

/** Forward and right unit vectors for a yaw (radians, 0 looks along -Z, positive turns left). */
export function wishFromInput(forward: number, strafe: number, yaw: number, run: boolean): Wish {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  let x = fx * forward + -fz * strafe;
  let z = fz * forward + fx * strafe;
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  return { x, z, run };
}

/**
 * A first-person walker: a capsule floating `stepHeight` above the feet, held up by downward rays.
 * Walls and anything taller than a step stop the capsule; anything lower is under it, and the rays lift the feet
 * onto it, which is the step-up. Off the ground, gravity pulls the feet down until the rays find ground again.
 */
export class Controller {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  onGround = false;
  private readonly segment = new Line3();
  private readonly p: WalkParams;

  constructor(
    private readonly collider: Collider,
    params: Partial<WalkParams> = {},
  ) {
    this.p = { ...WALK, ...params };
  }

  get params(): Readonly<WalkParams> {
    return this.p;
  }

  /** Puts the feet at `at`, dropped onto the ground right under it when there is ground within reach. */
  place(at: Vector3): void {
    this.position.copy(at);
    this.velocity.set(0, 0, 0);
    const ground = this.collider.groundBelow(at.x, at.y + 1, at.z, 3);
    this.onGround = ground !== null;
    if (ground !== null) this.position.y = ground;
  }

  /** Advances by `dt` seconds in fixed sub-steps. Returns true when the player fell out of the world. */
  update(dt: number, wish: Wish): boolean {
    const total = Math.min(dt, this.p.maxFrame);
    const n = Math.max(1, Math.ceil(total / this.p.subStep - 1e-9));
    for (let i = 0; i < n; i++) this.step(total / n, wish);
    return this.position.y < this.collider.bounds.min.y - this.p.killDepth;
  }

  step(dt: number, wish: Wish): void {
    const p = this.p;
    const speed = wish.run ? p.runSpeed : p.walkSpeed;
    const k = 1 - Math.exp(-(this.onGround ? p.accelGround : p.accelAir) * dt);
    this.velocity.x += (wish.x * speed - this.velocity.x) * k;
    this.velocity.z += (wish.z * speed - this.velocity.z) * k;
    if (!this.onGround) this.velocity.y = Math.max(this.velocity.y - p.gravity * dt, -p.maxFall);

    this.position.addScaledVector(this.velocity, dt);
    this.resolveCapsule();
    this.settle(dt);
  }

  private resolveCapsule(): void {
    const p = this.p;
    const pos = this.position;
    this.segment.start.set(pos.x, pos.y + p.stepHeight + p.radius, pos.z);
    this.segment.end.set(pos.x, pos.y + Math.max(p.bodyHeight - p.radius, p.stepHeight + p.radius), pos.z);
    const push = this.collider.pushOut(this.segment, p.radius);
    pos.add(push);
    const flat = Math.hypot(push.x, push.z);
    if (flat > 1e-6) {
      // Slide along the wall: drop the part of the velocity that points into it.
      const nx = push.x / flat;
      const nz = push.z / flat;
      const into = this.velocity.x * nx + this.velocity.z * nz;
      if (into < 0) {
        this.velocity.x -= nx * into;
        this.velocity.z -= nz * into;
      }
    }
    if (push.y < -1e-6 && this.velocity.y > 0) this.velocity.y = 0;
  }

  /** Finds the ground under the capsule's footprint and stands on it, steps up onto it, or lets the feet fall. */
  private settle(dt: number): void {
    const p = this.p;
    const pos = this.position;
    if (this.velocity.y > 0) {
      this.onGround = false;
      return;
    }
    const top = pos.y + p.stepHeight;
    const reach = p.stepHeight + (this.onGround ? p.snapDown : -this.velocity.y * dt + 0.02);
    const r = p.radius * 0.7;
    let ground: number | null = null;
    for (const [dx, dz] of PROBES) {
      const hit = this.collider.groundBelow(pos.x + dx * r, top, pos.z + dz * r, reach);
      if (hit !== null && (ground === null || hit > ground)) ground = hit;
    }
    if (ground === null) {
      this.onGround = false;
      return;
    }
    pos.y = ground;
    this.velocity.y = 0;
    this.onGround = true;
  }
}

const PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
