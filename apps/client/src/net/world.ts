import type { Emitter } from 'mitt';

// What the World scene needs from the network. `ColyseusWorldFeed` reads the room state, the mock feed
// (?mock=1) simulates the same data locally; the scene cannot tell them apart. Kept apart from
// NetworkService.ts (lobby) so the two features do not share a file.

export interface PresenceSnap {
  x: number;
  y: number;
  yaw: number;
  animId: number;
  statusBits: number;
  transitUntilTick: number;
}

export interface PlayerSnap {
  id: string;
  name: string;
  /** Trait indices as dealt: height S/M/T, scarf red/green/blue, hat cap/bowler/bare (GDD 3.1). */
  traits: { height: number; scarf: number; hat: number };
  /** Null while the player is outside this client's view: nothing is known about where they are. */
  presence: PresenceSnap | null;
}

export interface DoorSnap {
  id: string;
  state: number;
  swingUntilTick: number;
}

export interface SceneEnter {
  sceneId: string;
  spawn: string;
  facing: string;
}

export interface NoisePulse {
  sceneId: string;
  x: number;
  y: number;
  kind: string;
}

export interface MoveCmd {
  seq: number;
  dx: number;
  dy: number;
  sprint: boolean;
  sneak: boolean;
}

export type WorldFeedEvents = {
  sceneEnter: SceneEnter;
  noise: NoisePulse;
  error: { code: number; msg: string };
  /** Mock only: the mock world's report or bell asks the mock network to open a meeting (round 3, M | N seam). */
  meetingRequest: { reason: 'body' | 'bell'; callerId: string; bodyOf?: string };
};

export interface WorldFeed {
  readonly bus: Emitter<WorldFeedEvents>;
  readonly selfId: string;
  /** Everyone on the roster; `presence` is set only for those in view. Cheap enough to call per frame. */
  snapshot(): PlayerSnap[];
  /** Doors of the scene this client is in. */
  doors(): DoorSnap[];
  clock(): { tick: number; phase: number; phaseEndsTick: number };
  sendMove(cmd: MoveCmd): void;
  enterPortal(portalId: string): void;
  /** Mock only: re-emits `sceneEnter` for the current scene after a mock meeting (round 3, M | N seam). */
  resume?(): void;
  dispose(): void;
}

/** Phaser registry key under which the router publishes the active feed. */
export const REG_WORLD = 'worldFeed';
export const REG_ROLE_CHIP = 'roleChip';
