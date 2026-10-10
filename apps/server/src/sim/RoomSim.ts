import type { Profile } from '@wdi/content';
import type { PartyRoom } from '../rooms/PartyRoom';
import { POSITION_RING_TICKS } from './constants';

/** The last accepted `input.move` of a client, normalised on arrival. */
export interface MoveInput {
  seq: number;
  /** Unit vector (or zero) in screen space, x right, y down. */
  dx: number;
  dy: number;
  sprint: boolean;
  sneak: boolean;
  /** Tick the input was accepted on; an input older than the stale window stops the player. */
  tick: number;
}

/** Server-only movement state of one player. Never in a schema. */
export class PlayerSim {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  placed = false;
  /** Order in which the player was first seen, picks the `square_<n>` spawn. */
  readonly ordinal: number;
  input: MoveInput | null = null;
  lastSeq = -1;
  /** Player cannot act or move before this tick (portal transit). */
  busyUntilTick = 0;
  /** Scene index the player just left while the transit window is open, else -1. */
  transitFrom = -1;
  /** Position ring: the last POSITION_RING_TICKS + 1 positions, newest at `head`. */
  private readonly ring = new Float64Array((POSITION_RING_TICKS + 1) * 2);
  private head = -1;
  private filled = 0;

  constructor(ordinal: number) {
    this.ordinal = ordinal;
  }

  /** Forgets history and records a fresh position (spawn, portal arrival). */
  resetRing(): void {
    this.head = -1;
    this.filled = 0;
    this.pushRing();
  }

  pushRing(): void {
    this.head = (this.head + 1) % (POSITION_RING_TICKS + 1);
    this.ring[this.head * 2] = this.x;
    this.ring[this.head * 2 + 1] = this.y;
    this.filled = Math.min(this.filled + 1, POSITION_RING_TICKS + 1);
  }

  /** Position `ticksAgo` steps back (0 = now), clamped to the oldest sample; null before any sample. */
  positionAt(ticksAgo: number): { x: number; y: number } | null {
    if (this.filled === 0) return null;
    const back = Math.min(Math.max(0, Math.floor(ticksAgo)), this.filled - 1);
    const i = (this.head - back + (POSITION_RING_TICKS + 1)) % (POSITION_RING_TICKS + 1);
    return { x: this.ring[i * 2] as number, y: this.ring[i * 2 + 1] as number };
  }

  get historyLength(): number {
    return this.filled;
  }
}

/** What a client's view currently holds, so reconcile can diff instead of re-adding. */
export interface ViewState {
  scene: string | null;
  presences: Set<string>;
}

export interface PortalRequest {
  sessionId: string;
  portalId: string;
}

export class RoomSim {
  readonly players = new Map<string, PlayerSim>();
  readonly views = new Map<string, ViewState>();
  portalRequests: PortalRequest[] = [];
  profile: Profile = 'small';
  /** Raised by the WDI_DEBUG `debug.play` message, consumed by the step. */
  debugPlay = false;
  private ordinals = 0;

  ensure(sessionId: string): PlayerSim {
    let sim = this.players.get(sessionId);
    if (!sim) {
      sim = new PlayerSim(this.ordinals++);
      this.players.set(sessionId, sim);
    }
    return sim;
  }
}

const sims = new WeakMap<PartyRoom, RoomSim>();

export function simOf(room: PartyRoom): RoomSim {
  let sim = sims.get(room);
  if (!sim) {
    sim = new RoomSim();
    sims.set(room, sim);
  }
  return sim;
}
