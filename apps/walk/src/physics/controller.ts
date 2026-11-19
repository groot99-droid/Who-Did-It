import { Line3, Vector3 } from 'three';
import { CLIMB, CRAWL, SIDLE, TRAVERSE, WALK } from '../config';
import { yawFromDirection } from '../spawn';
import type { Mode, TraverseKind, TraverseZone, ViewHold } from '../traverse';
import type { Collider } from './collider';

export type WalkParams = { -readonly [K in keyof typeof WALK]: number };

/** What the player wants this frame: a horizontal direction in world space (length 0 to 1) and run, with the camera's
 * yaw when it is known (a sidle turns the view to the wall nearer it). */
export interface Wish {
  x: number;
  z: number;
  run: boolean;
  yaw?: number;
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
  return { x, z, run, yaw };
}

/** How a spawn delivers the walker: the mode it asks for (its `wdi_mode`) and the yaw it faces. */
export interface Arrival {
  mode?: TraverseKind | undefined;
  yaw?: number | undefined;
}

interface Mantle {
  t: number;
  from: Vector3;
  /** On the ground found on the ledge. */
  to: Vector3;
  /** The walker lands crawling: the ledge lies in a crawl zone, or there is no room to stand on it. */
  crawl: boolean;
  /** The crawl zone the ledge lies in, if any. */
  zone: TraverseZone | null;
}

const LOCAL = new Vector3();
/** A body pushed out of the world by less than this, metres, touches nothing (it only grazes rock). */
const BODY_FITS = 1e-3;

const clamp = (v: number, h: number) => Math.max(-h, Math.min(h, v));

/**
 * A first-person walker: a capsule floating `stepHeight` above the feet, held up by downward rays.
 * Walls and anything taller than a step stop the capsule; anything lower is under it, and the rays lift the feet
 * onto it, which is the step-up. Off the ground, gravity pulls the feet down until the rays find ground again.
 *
 * Traversal zones (src/traverse.ts) change the body by themselves. In a crawl zone it is low and slow, and it stands
 * up again only out of every crawl zone and with room above. In a sidle zone it is thin and moves along the
 * passage. At the foot of a climb face, pushing at it, it hangs on the face: it climbs, mantles onto the ledge at the
 * top and lets go at the foot; stepping off the ledge, the face catches it. Without zones it only walks.
 */
export class Controller {
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  onGround = false;
  /** Walking, or the traversal mode a zone put the walker in. */
  mode: Mode = 'walk';
  /** The zone of the current mode; while crawling on under a low roof past a crawl zone, the last one. */
  zone: TraverseZone | null = null;
  /** Camera height above the feet, metres. It moves to the crawling height and back over `TRAVERSE.eyeSeconds`. */
  eyeHeight: number;
  private readonly segment = new Line3();
  private readonly standing = new Line3();
  private readonly p: WalkParams;
  /** The camera yaw last given with a wish or an arrival, or null. */
  private heading: number | null = null;
  /** Sidling: the wall the view faces, 1 for the zone's +Z wall, -1 for its -Z wall. */
  private facing: 1 | -1 = -1;
  /** Crawling with the feet also in a sidle zone: the crawling body is as thin as the sidling one, so a crawl that
   * opens straight into a fissure is crawled into until there is room to stand up sideways. */
  private narrow = false;
  /** Climbing after a catch at the top of a face: forward input is ignored until it is let go once. */
  private caught = false;
  /** Climbing: the feet in the face's frame; z eases to `CLIMB.hold`. */
  private readonly face = new Vector3();
  private mantle: Mantle | null = null;
  /** Hanging at the top of a face whose ledge had no room: the face x where the mantle was last tried, else null. */
  private topBlocked: number | null = null;
  /** Sidling after walking into the box through one of its sides (a Z face), not through an X end: only then does
   * input across the passage move the walker, outwards, so that it can back out the way it came. */
  private sideEntry = false;

  constructor(
    private readonly collider: Collider,
    params: Partial<WalkParams> = {},
    readonly zones: readonly TraverseZone[] = [],
  ) {
    this.p = { ...WALK, ...params };
    this.eyeHeight = this.p.eyeHeight;
  }

  get params(): Readonly<WalkParams> {
    return this.p;
  }

  /** The capsule's radius now, metres: crawling it fits the band from the step height to the crawling top. */
  get bodyRadius(): number {
    if (this.mode === 'crawl')
      return Math.min(this.narrow ? SIDLE.radius : this.p.radius, (CRAWL.bodyHeight - this.p.stepHeight) / 2);
    return this.mode === 'sidle' ? SIDLE.radius : this.p.radius;
  }

  /** The top of the capsule above the feet now, metres. */
  get bodyTop(): number {
    return this.mode === 'crawl' ? CRAWL.bodyHeight : this.p.bodyHeight;
  }

  /** True during the mantle at the top of a climb. */
  get mantling(): boolean {
    return this.mantle !== null;
  }

  /** While sidling, the yaw that faces the chosen wall and how far the view may turn from it; null otherwise. */
  get viewHold(): ViewHold | null {
    if (this.mode !== 'sidle' || !this.zone) return null;
    const z = this.zone.flatZ;
    return { yaw: yawFromDirection(z.x * this.facing, z.z * this.facing), max: SIDLE.viewHold };
  }

  /**
   * Puts the feet at `at`, dropped onto the ground right under it when there is ground within reach. An arrival in a
   * mode starts it when `at` is in a zone of that kind (on a climb face the walker hangs there, undropped). Feet in a
   * crawl zone always start crawling, with the eye already low, whatever the arrival asks (a crawl wins over a sidle
   * where they overlap, and the camera never starts above a low roof); otherwise the walker walks. Returns the mode it
   * starts in.
   */
  place(at: Vector3, arrival: Arrival = {}): Mode {
    this.mode = 'walk';
    this.zone = null;
    this.mantle = null;
    this.topBlocked = null;
    this.narrow = false;
    this.caught = false;
    this.sideEntry = false;
    this.eyeHeight = this.p.eyeHeight;
    if (arrival.yaw !== undefined) this.heading = arrival.yaw;
    this.position.copy(at);
    this.velocity.set(0, 0, 0);
    if (arrival.mode === 'climb') {
      const face = this.faceAt(at);
      if (face) {
        this.attach(face);
        return 'climb';
      }
    }
    // In a crawl zone the floor is looked for from just above the feet: a ray from 1 m up would start in the roof.
    const up = this.zoneAt('crawl', at) ? this.p.stepHeight : 1;
    const ground = this.collider.groundBelow(at.x, at.y + up, at.z, 2 + up);
    this.onGround = ground !== null;
    if (ground !== null) this.position.y = ground;
    const crawl = this.zoneAt('crawl', this.position);
    const sidle = this.zoneAt('sidle', this.position);
    if (crawl) {
      this.enter('crawl', crawl);
      this.narrow = sidle !== null;
      this.eyeHeight = CRAWL.eyeHeight;
      return 'crawl';
    }
    if (arrival.mode === 'sidle' && sidle) {
      this.enter('sidle', sidle);
      this.sideEntry = false;
      return 'sidle';
    }
    return 'walk';
  }

  /** Advances by `dt` seconds in fixed sub-steps. Returns true when the player fell out of the world. */
  update(dt: number, wish: Wish): boolean {
    const total = Math.min(dt, this.p.maxFrame);
    const n = Math.max(1, Math.ceil(total / this.p.subStep - 1e-9));
    for (let i = 0; i < n; i++) this.step(total / n, wish);
    return this.position.y < this.collider.bounds.min.y - this.p.killDepth;
  }

  step(dt: number, wish: Wish): void {
    if (wish.yaw !== undefined) this.heading = wish.yaw;
    if (this.zones.length > 0 && this.mode !== 'climb') this.chooseMode(wish);
    if (this.mode === 'climb') this.climb(dt, wish);
    else {
      this.move(dt, wish);
      if (this.zones.length > 0 && this.mode === 'walk' && !this.onGround) this.catchFalling();
    }
    this.easeEye(dt);
  }

  private move(dt: number, wish: Wish): void {
    const p = this.p;
    let { x, z } = wish;
    let speed = wish.run ? p.runSpeed : p.walkSpeed;
    if (this.mode === 'crawl') speed = CRAWL.speed;
    else if (this.mode === 'sidle' && this.zone) {
      // Along the passage: the input's share along the zone's X axis, with its sign. Across it nothing, except after
      // a side entry: then only outwards, away from the box's middle plane, so that the walker can back out the way
      // it came (in a fissure the rock stops that at once).
      const zone = this.zone;
      const ax = zone.flatX;
      const az = zone.flatZ;
      const along = clamp(x * ax.x + z * ax.z, 1);
      let across = 0;
      if (this.sideEntry) {
        across = x * az.x + z * az.z;
        const side = zone.toLocal(this.position, LOCAL).z;
        if (Math.abs(side) < SIDLE.sideOut || across * side <= 0) across = 0;
      }
      x = ax.x * along + az.x * across;
      z = ax.z * along + az.z * across;
      speed = SIDLE.speed;
    }
    const k = 1 - Math.exp(-(this.onGround ? p.accelGround : p.accelAir) * dt);
    this.velocity.x += (x * speed - this.velocity.x) * k;
    this.velocity.z += (z * speed - this.velocity.z) * k;
    if (!this.onGround) this.velocity.y = Math.max(this.velocity.y - p.gravity * dt, -p.maxFall);

    this.position.addScaledVector(this.velocity, dt);
    const radius = this.bodyRadius;
    this.resolveCapsule(radius, this.bodyTop);
    this.settle(dt, radius);
  }

  private resolveCapsule(radius: number, top: number): void {
    const p = this.p;
    const pos = this.position;
    this.segment.start.set(pos.x, pos.y + p.stepHeight + radius, pos.z);
    this.segment.end.set(pos.x, pos.y + Math.max(top - radius, p.stepHeight + radius), pos.z);
    const push = this.collider.pushOut(this.segment, radius);
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
  private settle(dt: number, radius: number): void {
    const p = this.p;
    const pos = this.position;
    if (this.velocity.y > 0) {
      this.onGround = false;
      return;
    }
    const top = pos.y + p.stepHeight;
    const reach = p.stepHeight + (this.onGround ? p.snapDown : -this.velocity.y * dt + 0.02);
    const r = radius * 0.7;
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

  /** Starts, keeps or ends a mode from where the feet are; runs before each step's move while not climbing. */
  private chooseMode(wish: Wish): void {
    const at = this.position;
    // Crawling or sidling up to the foot of a face attaches too: a crawl or a fissure that ends at a chimney.
    if (this.onGround) {
      const face = this.faceToClimb(wish);
      if (face) return this.attach(face);
    }
    const own = this.mode === 'sidle' && this.zone && this.keepsSidle(this.zone, at) ? this.zone : null;
    const sidle = own ?? this.zoneAt('sidle', at);
    const crawl = this.zoneAt('crawl', at);
    if (crawl || this.mode === 'crawl') {
      // A crawl with the feet also in a sidle zone (a low passage opening straight into a fissure) crawls thin.
      this.narrow = sidle !== null;
      if (crawl) return this.enter('crawl', crawl);
      // Out of every crawl zone the walker crawls on until there is room to stand: for the sidling body when the feet
      // are in a sidle zone, else for the walking one.
      if (!this.roomToStand(at, sidle ? SIDLE.radius : this.p.radius)) return;
    }
    this.enter(sidle ? 'sidle' : 'walk', sidle);
  }

  private enter(mode: Mode, zone: TraverseZone | null): void {
    if (mode === 'sidle' && zone && (this.mode !== 'sidle' || zone !== this.zone)) {
      this.facing = this.wallFacing(zone);
      // Walked in between the box's X ends: it came through a side.
      this.sideEntry = this.mode === 'walk' && Math.abs(zone.toLocal(this.position, LOCAL).x) < zone.half.x;
    }
    if (mode !== 'sidle') this.sideEntry = false;
    if (mode !== 'crawl') this.narrow = false;
    this.mode = mode;
    this.zone = zone;
  }

  /** The sidle goes on in `zone`: the feet are in it, or they left it through one of its sides (a Z face) between
   * its X ends, by no more than the walking radius, to where the walking body does not fit yet. Beside a mouth (in
   * the end margins) the walker walks again, to line up with the opening. */
  private keepsSidle(zone: TraverseZone, at: Vector3): boolean {
    if (zone.contains(at, TRAVERSE.endMargin)) return true;
    const l = zone.toLocal(at, LOCAL);
    const h = zone.half;
    if (Math.abs(l.x) > h.x || Math.abs(l.y) > h.y + TRAVERSE.edge || Math.abs(l.z) > h.z + this.p.radius)
      return false;
    return !this.bodyFits(at, this.p.radius, this.p.bodyHeight);
  }

  /** A body of `radius` up to `top` above the feet at `at` touches no rock. */
  private bodyFits(at: Vector3, radius: number, top: number): boolean {
    const p = this.p;
    this.standing.start.set(at.x, at.y + p.stepHeight + radius, at.z);
    this.standing.end.set(at.x, at.y + Math.max(top - radius, p.stepHeight + radius), at.z);
    return this.collider.pushOut(this.standing, radius).lengthSq() < BODY_FITS * BODY_FITS;
  }

  /** The first crawl or sidle zone holding `at`, each counted `TRAVERSE.endMargin` longer at both ends. */
  private zoneAt(kind: 'crawl' | 'sidle', at: Vector3): TraverseZone | null {
    for (const zone of this.zones)
      if (zone.kind === kind && zone.contains(at, TRAVERSE.endMargin)) return zone;
    return null;
  }

  /** The wall of a sidle zone nearer the heading (the camera's, else the way the walker moves): 1 for its +Z wall,
   * -1 for its -Z wall, which also takes a heading straight along the passage. */
  private wallFacing(zone: TraverseZone): 1 | -1 {
    let hx = this.velocity.x;
    let hz = this.velocity.z;
    if (this.heading !== null) {
      hx = -Math.sin(this.heading);
      hz = -Math.cos(this.heading);
    }
    return hx * zone.flatZ.x + hz * zone.flatZ.z > 1e-6 ? 1 : -1;
  }

  /** Nothing within `CRAWL.standRoom` above the feet at `pos` over a footprint of `radius`, and nothing a standing
   * body of that radius would meet from above. A wall beside the walker does not count: standing up only moves it off
   * the wall. */
  private roomToStand(pos: Vector3, radius: number): boolean {
    const p = this.p;
    const r = radius * 0.7;
    const span = CRAWL.standRoom - p.stepHeight;
    for (const [dx, dz] of PROBES)
      if (this.collider.groundBelow(pos.x + dx * r, pos.y + CRAWL.standRoom, pos.z + dz * r, span) !== null)
        return false;
    this.standing.start.set(pos.x, pos.y + p.stepHeight + radius, pos.z);
    this.standing.end.set(pos.x, pos.y + Math.max(p.bodyHeight - radius, p.stepHeight + radius), pos.z);
    return this.collider.pushOut(this.standing, radius).y > -1e-4;
  }

  /** Within a climb face's width and in front of its plane, no further out than `CLIMB.reach`. */
  private nearFace(zone: TraverseZone, l: Vector3): boolean {
    const e = TRAVERSE.edge;
    return Math.abs(l.x) <= zone.half.x + e && l.z >= -e && l.z <= CLIMB.reach;
  }

  /** The climb face whose foot the walker stands at, pushing at it (input within `CLIMB.attachAngle` of its -Z) with
   * input that is not back input (climbInput). */
  private faceToClimb(wish: Wish): TraverseZone | null {
    const len = Math.hypot(wish.x, wish.z);
    if (len < 1e-3) return null;
    for (const zone of this.zones) {
      if (zone.kind !== 'climb') continue;
      const l = zone.toLocal(this.position, LOCAL);
      if (!this.nearFace(zone, l) || Math.abs(l.y + zone.half.y) > CLIMB.footBand) continue;
      const into = -(wish.x * zone.flatZ.x + wish.z * zone.flatZ.z) / len;
      // Back input (it goes down on the face) does not attach: it would let go at once, every step.
      if (into >= Math.cos(CLIMB.attachAngle) - 1e-9 && climbInput(wish, zone).up >= -1e-9) return zone;
    }
    return null;
  }

  /** The climb face `at` hangs on (an arrival): in front of it within reach, between its foot and its top. */
  private faceAt(at: Vector3): TraverseZone | null {
    for (const zone of this.zones) {
      if (zone.kind !== 'climb') continue;
      const l = zone.toLocal(at, LOCAL);
      if (this.nearFace(zone, l) && Math.abs(l.y) <= zone.half.y + TRAVERSE.edge) return zone;
    }
    return null;
  }

  /** Walking off the top of a climb face: the face catches the falling walker within `CLIMB.catchBand` of its top. */
  private catchFalling(): void {
    if (this.velocity.y > 0) return;
    for (const zone of this.zones) {
      if (zone.kind !== 'climb') continue;
      const l = zone.toLocal(this.position, LOCAL);
      if (!this.nearFace(zone, l)) continue;
      if (l.y <= zone.half.y + TRAVERSE.edge && l.y >= zone.half.y - CLIMB.catchBand)
        return this.attach(zone, true);
    }
  }

  private attach(zone: TraverseZone, caught = false): void {
    this.caught = caught;
    const l = zone.toLocal(this.position, LOCAL);
    // The feet are not lifted onto a box whose bottom lies above the floor: climbing takes them there at its speed.
    this.face.set(clamp(l.x, zone.half.x), Math.min(l.y, zone.half.y), l.z);
    this.mode = 'climb';
    this.zone = zone;
    this.mantle = null;
    this.topBlocked = null;
    this.narrow = false;
    this.onGround = false;
    this.velocity.set(0, 0, 0);
    zone.toWorld(this.face.x, this.face.y, this.face.z, this.position);
  }

  /**
   * Hanging on a climb face: no gravity, the feet held `CLIMB.hold` out from its plane (eased there from where they
   * attached). Forward input climbs and back input goes down, wherever the camera looks; sideways input moves along
   * the face within the box (climbInput). At the top the walker mantles onto the ledge; below the foot it lets go
   * onto the floor.
   */
  private climb(dt: number, wish: Wish): void {
    const zone = this.zone;
    if (!zone) {
      this.mode = 'walk';
      return;
    }
    if (this.mantle) return this.mantleStep(dt);
    const input = climbInput(wish, zone);
    const { side } = input;
    let { up } = input;
    // Caught stepping off the ledge, the walker hangs until the forward input is let go: holding W off the edge does
    // not climb straight back up and walk off again.
    if (this.caught) {
      if (up > 0) up = 0;
      else this.caught = false;
    }
    const p = this.p;
    const f = this.face;
    const stepBy = CLIMB.speed * dt;
    f.x = clamp(f.x + side * stepBy, zone.half.x);
    f.y += up * stepBy;
    f.z += clamp(CLIMB.hold - f.z, 2 * CLIMB.speed * dt);
    if (up > 0 && f.y >= zone.half.y) {
      f.y = zone.half.y;
      zone.toWorld(f.x, f.y, f.z, this.position);
      // A ledge with no room for the body even crawling is not mantled onto: the walker hangs at the top (it can
      // climb down or along). It looks again once it has moved along the face.
      if (this.topBlocked === null || Math.abs(f.x - this.topBlocked) >= CLIMB.mantleStep) {
        if (this.startMantle(zone)) return;
        this.topBlocked = f.x;
      }
      this.velocity.set(0, 0, 0);
      return;
    }
    if (f.y < zone.half.y) this.topBlocked = null;
    f.y = Math.min(f.y, zone.half.y);
    const before = LOCAL.copy(this.position);
    const pos = zone.toWorld(f.x, f.y, f.z, this.position);
    if (up < 0 && f.y <= -zone.half.y + CLIMB.footBand) {
      // Down at the floor near the foot (at the foot of the box, or above a box drawn into the floor): let go, standing
      // on it. Higher up the face, rock under the feet is not a floor: the walker climbs on down past it.
      const ground = this.collider.groundBelow(pos.x, pos.y + p.stepHeight, pos.z, p.stepHeight);
      if (ground !== null) return this.letGo(ground);
      // Past the foot with no floor there (further than a walker attaching from the floor can start below it): let
      // go and fall.
      if (f.y <= -zone.half.y - CLIMB.footBand) return this.letGo(null);
    }
    if (dt > 0) this.velocity.subVectors(pos, before).divideScalar(dt);
  }

  /**
   * Starts the mantle onto the ledge at the top of `zone`: the feet go `CLIMB.mantleReach` beyond the face plane, or
   * less where rock on the ledge leaves less room or the ledge ends in a drop, for the walking body or else the
   * crawling one. Returns false, with nothing started, when neither body has `CLIMB.mantleMinReach` of room with
   * ground under it on the ledge.
   */
  private startMantle(zone: TraverseZone): boolean {
    const p = this.p;
    const crawlRadius = Math.min(p.radius, (CRAWL.bodyHeight - p.stepHeight) / 2);
    let standing = true;
    let to = this.ledgeRoom(zone, p.radius, p.bodyHeight);
    if (!to) {
      standing = false;
      to = this.ledgeRoom(zone, crawlRadius, CRAWL.bodyHeight);
    }
    if (!to) return false;
    const crawl = this.zoneAt('crawl', to);
    this.mantle = {
      t: 0,
      from: this.position.clone(),
      to,
      // A ledge under a low roof lands the walker crawling even without a crawl zone: never standing in rock.
      crawl: crawl !== null || !standing || !this.roomToStand(to, p.radius),
      zone: crawl,
    };
    this.velocity.set(0, 0, 0);
    return true;
  }

  /**
   * Where the feet land on the ledge for a body of `radius` up to `top`: tried every `CLIMB.mantleStep` from just
   * over the edge out to `CLIMB.mantleReach` beyond the face plane, each on the ground found there, as far out as the
   * body fits all the way (the steps are short enough that it meets any rock between them). Null when it fits less
   * than `CLIMB.mantleMinReach` out. A ray or a body test from inside closed rock would see no rock, so the whole
   * path out from the edge is tested. Only a step with ground under the feet and under the body's far side is
   * landed on, so a ridge with a drop behind it is mantled onto, not over; with no such step, null too.
   */
  private ledgeRoom(zone: TraverseZone, radius: number, top: number): Vector3 | null {
    const p = this.p;
    const steps = Math.round(CLIMB.mantleReach / CLIMB.mantleStep);
    let best: Vector3 | null = null;
    for (let i = 1; i <= steps; i++) {
      const d = (CLIMB.mantleReach * i) / steps;
      const at = zone.toWorld(this.face.x, zone.half.y, -d);
      const ground = this.collider.groundBelow(
        at.x,
        at.y + p.stepHeight,
        at.z,
        p.stepHeight + CLIMB.ledgeDrop,
      );
      if (ground !== null) at.y = ground;
      if (!this.bodyFits(at, radius, top)) break;
      if (ground === null || d < CLIMB.mantleMinReach - 1e-9) continue;
      // Ground under the body's far side too, so that it does not land on the very lip of a ridge.
      const far = zone.toWorld(this.face.x, zone.half.y, -d - radius, LOCAL);
      if (
        this.collider.groundBelow(far.x, far.y + p.stepHeight, far.z, p.stepHeight + CLIMB.ledgeDrop) !== null
      )
        best = at;
    }
    return best;
  }

  private mantleStep(dt: number): void {
    const m = this.mantle;
    if (!m) return;
    m.t += dt;
    const u = Math.min(1, m.t / CLIMB.mantleSeconds);
    this.position.lerpVectors(m.from, m.to, u * u * (3 - 2 * u));
    if (u < 1) return;
    this.mantle = null;
    this.onGround = true;
    this.velocity.set(0, 0, 0);
    this.enter(m.crawl ? 'crawl' : 'walk', m.zone);
  }

  /** Off the face, walking: on the floor at `ground`, or falling when there is none. */
  private letGo(ground: number | null): void {
    this.velocity.set(0, 0, 0);
    this.enter('walk', null);
    this.onGround = ground !== null;
    if (ground !== null) this.position.y = ground;
  }

  /** Moves the eye towards the crawling or the walking height, the whole way in `TRAVERSE.eyeSeconds`. */
  private easeEye(dt: number): void {
    const p = this.p;
    const crawling = this.mode === 'crawl' || this.mantle?.crawl === true;
    const target = crawling ? CRAWL.eyeHeight : p.eyeHeight;
    const d = target - this.eyeHeight;
    if (d === 0) return;
    const stepBy = (Math.abs(p.eyeHeight - CRAWL.eyeHeight) / TRAVERSE.eyeSeconds) * dt;
    this.eyeHeight = Math.abs(d) <= stepBy ? target : this.eyeHeight + Math.sign(d) * stepBy;
  }
}

/**
 * Up and sideways on a climb face from a wish, each -1 to 1. With the camera's yaw (as every input device gives it):
 * up is the input's forward share and sideways its strafe share, signed so that strafing right moves right as the
 * camera sees the face (the climber's right when the camera looks along it). Without a yaw, from the wish's direction:
 * towards the face is up, along its X axis sideways.
 */
export function climbInput(wish: Wish, zone: TraverseZone): { up: number; side: number } {
  if (wish.yaw === undefined)
    return {
      up: clamp(-(wish.x * zone.flatZ.x + wish.z * zone.flatZ.z), 1),
      side: clamp(wish.x * zone.flatX.x + wish.z * zone.flatX.z, 1),
    };
  const fx = -Math.sin(wish.yaw);
  const fz = -Math.cos(wish.yaw);
  // The camera's right is (-fz, fx), as in wishFromInput.
  const forward = wish.x * fx + wish.z * fz;
  const strafe = wish.x * -fz + wish.z * fx;
  const rightAlongX = -fz * zone.flatX.x + fx * zone.flatX.z;
  return { up: clamp(forward, 1), side: clamp(rightAlongX < -1e-6 ? -strafe : strafe, 1) };
}

const PROBES: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
