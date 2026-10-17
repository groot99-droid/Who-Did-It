import type { Emitter } from 'mitt';
import type { HoldAction, NightRevealEntry } from '@wdi/shared/protocol';

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

/** A bakery prop the server lists (quick mode, A39): `of` is the owner's seat id of a plate, empty otherwise. */
export interface PropSnap {
  id: string;
  kind: string;
  turned: boolean;
  of: string;
}

/** Quick mode: the night window this seat is awake in (the private `nightWake`). */
export interface NightWindow {
  windowRole: string;
  endsTick: number;
  spawn: string;
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
  /** Private, quick mode: this seat's window opened; the World starts in the bakery. */
  nightWake: NightWindow;
  /** Private, quick mode: what the act showed. */
  nightReveal: { entries: NightRevealEntry[] };
  /** Private, quick mode: back to the loft (the window ended, or the night began). */
  nightSleep: Record<string, never>;
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
  /** `main` or `onub` (quick mode, GDD 3.11), from the lobby setting. */
  mode(): 'main' | 'onub';
  /** Quick mode: the props the server lists for the bakery (plates, dead loaves, ledger). Empty in the main mode. */
  props(): PropSnap[];
  /** Quick mode: the Poisoner partner's id for a Poisoner, empty for everyone else. */
  mates(): string[];
  /** Quick mode: what this seat's night act showed, oldest first. */
  nightReveal(): NightRevealEntry[];
  /** Quick mode: the open window of this seat, or null while it sleeps or outside the night. */
  wake(): NightWindow | null;
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
  /** `targetId2` is the second pick of a `picks: 2` act (quick mode). */
  ability(id: string, targetId?: string, targetId2?: string): void;
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
/** Phaser registry key of the World's `InputController`; the router stops it between screens. */
export const REG_INPUT = 'worldInput';
