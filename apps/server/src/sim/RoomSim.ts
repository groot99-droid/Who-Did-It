import type { Profile } from '@wdi/content';
import type { DeathCause, MeetingReason } from '@wdi/shared';
import type { AutoState } from './auto/Auto';
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
  /**
   * Scene index the sim moves the player in. The public `Player.sceneId` mirrors it only while the
   * player is alive or their death is public, so a ghost's crossings never show on the roster (A30).
   */
  sceneIdx = 0;
  /** Order in which the player was first seen, picks the `square_<n>` spawn. */
  readonly ordinal: number;
  input: MoveInput | null = null;
  lastSeq = -1;
  /** Player cannot act or move before this tick (portal transit). */
  busyUntilTick = 0;
  /** Scene index the player just left while the transit window is open, else -1. */
  transitFrom = -1;
  /**
   * Killed or ejected: walks as a ghost. Set by the kill (L) and the ejection (K); the public `alive`
   * flips only at the next meeting start or the ejection (A30). Room memory, never on the wire.
   */
  dead = false;
  /** Blood shows on the presence until this tick (GDD 3.4; room memory, the bit is on the wire). */
  bloodyUntilTick = 0;
  /** A Bandage protects this player until this tick (GDD 3.2). */
  bandagedUntilTick = 0;
  /** A Bandaged strike blacks this seat's screen out until this tick: its view holds no avatars (GDD 3.2). */
  blindUntilTick = 0;
  /** The `act.hold` in progress, re-validated every tick (ARCHITECTURE 5.6). */
  hold: { action: string; targetId: string; startTick: number } | null = null;
  /** Notebook entries written so far; the next `NotebookEntry.id` is `entry_<n + 1>` (counted per player). */
  entrySeq = 0;
  /** Bell pulls spent this match (room memory; the cap is `roles.roles[role].bellPulls`). */
  bellPulls = 0;
  /** Position ring: the last POSITION_RING_TICKS + 1 positions, newest at `head`. */
  private readonly ring = new Float64Array((POSITION_RING_TICKS + 1) * 2);
  private head = -1;
  private filled = 0;

  constructor(ordinal: number) {
    this.ordinal = ordinal;
  }

  /** Back to a lobby seat after game over (K calls it; L adds every field L adds to this class). */
  resetForLobby(): void {
    this.x = this.y = this.vx = this.vy = 0;
    this.placed = false;
    this.sceneIdx = 0;
    this.input = null;
    this.lastSeq = -1;
    this.busyUntilTick = 0;
    this.transitFrom = -1;
    this.dead = false;
    this.bloodyUntilTick = 0;
    this.bandagedUntilTick = 0;
    this.blindUntilTick = 0;
    this.hold = null;
    this.entrySeq = 0;
    this.bellPulls = 0;
    this.head = -1;
    this.filled = 0;
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
}

export interface PortalRequest {
  sessionId: string;
  portalId: string;
}

/** Pushed by report and bell (sim/Actions), drained by the phase stage (sim/Phases). */
export interface MeetingRequest {
  reason: MeetingReason;
  callerId: string;
  bodyOf?: string;
}

/** Pushed by every death (sim/Kill, the ejection), drained by the phase stage for checkWin and the log. */
export interface DeathEvent {
  playerId: string;
  cause: DeathCause;
  killerId?: string;
  tick: number;
}

/** Server-only facts about one clue in a scene: decay, spawn order, who collected it. */
export interface ClueMeta {
  sceneId: string;
  /** Spawn order within the scene (the `clueSeq` counter); the cap drops the smaller first. */
  seq: number;
  /** Tick the clue disappears, or null when it never decays. */
  expiresTick: number | null;
  collectors: Set<string>;
}

export class RoomSim {
  readonly players = new Map<string, PlayerSim>();
  readonly views = new Map<string, ViewState>();
  portalRequests: PortalRequest[] = [];
  /** Seam L -> K: a meeting is requested here and opened in `runPhases` (ARCHITECTURE 5.7). */
  meetingRequests: MeetingRequest[] = [];
  /** Seam L -> K: deaths to run `checkWin` and the match log against. */
  deaths: DeathEvent[] = [];
  profile: Profile = 'small';
  /** Set by the first placement; `placeNewPlayers` then skips the profile scan (round-3 follow-up 5). */
  profileFixed = false;
  /** Clue id counters per scene (`clue_<sceneId>_<n>`), so an id never counts kills elsewhere (A30). */
  readonly clueSeq = new Map<string, number>();
  /** Server memory of every clue in play, by clue id (the schema carries only what clients may read). */
  readonly clueMeta = new Map<string, ClueMeta>();
  /** Body ids already reported; a body starts one meeting only (A30). */
  readonly reportedBodies = new Set<string>();
  /** The grace teaching clue is spawned once per match, at the first placement. */
  teachingSpawned = false;
  /** Raised by the WDI_DEBUG `debug.play` message, consumed by the step. */
  debugPlay = false;
  /** Set when a view must change before the next 5 Hz pass (a transit just ended). */
  viewsDirty = false;
  /**
   * Round 6 (docs/round6/auto-admin.md 3): set by `enableAuto` (6A) and never by a `party` message; an auto match
   * runs with every seat an NPC. Survives `resetForLobby` (a reset re-applies the options).
   */
  auto: AutoState | null = null;
  private ordinals = 0;

  /** Back to the lobby after game over (K calls it; L adds every field L adds to this class). */
  resetForLobby(): void {
    for (const p of this.players.values()) p.resetForLobby();
    this.portalRequests = [];
    this.meetingRequests = [];
    this.deaths = [];
    this.profile = 'small';
    this.profileFixed = false;
    this.viewsDirty = true;
    this.clueSeq.clear();
    this.clueMeta.clear();
    this.reportedBodies.clear();
    this.teachingSpawned = false;
  }

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
