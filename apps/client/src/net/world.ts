import type { Emitter } from 'mitt';
import type { HoldAction } from '@wdi/shared/protocol';

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
  /** Public roster flag; it flips for a victim only when the next meeting opens (A30). */
  alive: boolean;
  /** Null while the player is outside this client's view: nothing is known about where they are. */
  presence: PresenceSnap | null;
}

/** A body in the scene this client stands in. `x`/`y` are pixel centres, used unscaled. */
export interface BodySnap {
  id: string;
  /** The dead player's id: the body wears their public traits. */
  of: string;
  x: number;
  y: number;
  hidden: boolean;
}

/** A clue in the scene this client stands in. `kind` is a `ClueKind`, `dir` an index of `DIRECTIONS`. */
export interface ClueSnap {
  id: string;
  kind: number;
  value: number;
  dir: number;
  x: number;
  y: number;
  claimed: boolean;
}

/** One of this player's own Notebook entries; `sceneId` is an index into the frozen scene id list. */
export interface NotebookSnap {
  id: string;
  clueKind: number;
  value: number;
  sceneId: number;
  tick: number;
  status: number;
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
  /** Private: this player was killed and is now a ghost. */
  killed: { sceneId: string; cause: string; roles: Record<string, string> };
  /** Private: a collect finished; the entry is in `notebook()`. */
  clueFound: { entryId: string };
  phaseChange: { phase: number; endsTick: number };
  /** Mock only: the mock world's report or bell asks the mock network to open a meeting (round 3, M | N seam). */
  meetingRequest: { reason: 'body' | 'bell' | 'dawn'; callerId: string; bodyOf?: string };
};

export interface WorldFeed {
  readonly bus: Emitter<WorldFeedEvents>;
  readonly selfId: string;
  /** Everyone on the roster; `presence` is set only for those in view. Cheap enough to call per frame. */
  snapshot(): PlayerSnap[];
  /** Doors of the scene this client is in. */
  doors(): DoorSnap[];
  clock(): { tick: number; phase: number; phaseEndsTick: number; startTick: number };
  /** Bodies of the scene this client is in. */
  bodies(): BodySnap[];
  /** Clues of the scene this client is in. */
  clues(): ClueSnap[];
  /** This player's own Notebook entries, oldest first. */
  notebook(): NotebookSnap[];
  /**
   * True once this player has been killed or their roster `alive` is false. Held here, never in the
   * scene, so it survives World restarts; resets when the phase returns to the lobby.
   */
  dead(): boolean;
  sendMove(cmd: MoveCmd): void;
  enterPortal(portalId: string): void;
  kill(targetId: string): void;
  ability(id: string, targetId?: string): void;
  /** Starts (`on`) or ends a hold; the server re-validates it every tick. */
  hold(action: HoldAction, targetId: string, on: boolean): void;
  reportBody(bodyId: string): void;
  bell(): void;
  /** Mock only: re-emits `sceneEnter` for the current scene after a mock meeting (round 3, M | N seam). */
  resume?(): void;
  dispose(): void;
}

/** Phaser registry key under which the router publishes the active feed. */
export const REG_WORLD = 'worldFeed';
export const REG_ROLE_CHIP = 'roleChip';
