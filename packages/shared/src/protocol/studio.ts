// Round 9: the Studio wire of docs/round9/admin-studio.md 2 (creative mode). Only the `studio` room
// (apps/server/src/rooms/StudioRoom.ts, registered beside `admin` when the admin gate is configured) accepts these; it
// is never a `party` room, deals no cards and runs no match. Every command is queued and applied inside the room's
// step (CLAUDE.md). A refused command answers the usual `error` message with code 422 and a short `msg`.
import type { ClockScale } from './admin';

export const STUDIO_C2S = {
  move: 'studio.move',
  noclip: 'studio.noclip',
  teleport: 'studio.teleport',
  portal: 'studio.portal',
  profile: 'studio.profile',
  time: 'studio.time',
  clock: 'studio.clock',
  spawn: 'studio.spawn',
  clearSpawns: 'studio.clearSpawns',
  give: 'studio.give',
  draft: 'studio.draft',
} as const;

export const STUDIO_S2C = {
  snapshot: 'studio.snapshot',
  log: 'studio.log',
} as const;

export type StudioC2SType = (typeof STUDIO_C2S)[keyof typeof STUDIO_C2S];
export type StudioS2CType = (typeof STUDIO_S2C)[keyof typeof STUDIO_S2C];

/** The four times of day the Studio scrubs through; `t` in [0, 1] is how far into it. */
export type StudioDayPhase = 'dawn' | 'day' | 'dusk' | 'night';
export const STUDIO_DAY_PHASES: readonly StudioDayPhase[] = ['dawn', 'day', 'dusk', 'night'];

/** What a stand-in figure is: a `mobs.json` mob, a `routines.json` townsfolk figure, or a `looks.json` look. */
export type StudioSpawnKind = 'mob' | 'townsfolk' | 'look';

/**
 * What a stand-in is doing: a mob idles, roams, chases the admin figure or flees a flame; a townsfolk figure walks
 * its stations and works at each; a look, and a fixed townsfolk figure, stands.
 */
export type StudioStandInState = 'stand' | 'idle' | 'walk' | 'chase' | 'flee' | 'work';

/** A stand-in placed by the owner, live since S4: it runs its kind's brain on the Studio clock. */
export interface StudioSpawn {
  id: string;
  kind: StudioSpawnKind;
  /** The mob, townsfolk or look id. */
  ref: string;
  /** The tile it stands on now. */
  x: number;
  y: number;
  /** Its feet in world pixels, its facing (world frame, as the admin figure's `yaw`) and whether it moved. */
  px: number;
  py: number;
  yaw: number;
  moving: boolean;
  state: StudioStandInState;
}

export interface StudioC2SPayloads {
  /** Walk, as `input.move`: `seq` grows, the vector is normalised on the server, `sprint` runs. */
  'studio.move': { seq: number; dx: number; dy: number; sprint?: boolean };
  /** Walk through walls (only the scene's edge stops the figure). */
  'studio.noclip': { on: boolean };
  /** To a spawn of a scene, or to a tile (`x`, `y`) of a scene (the current one when `sceneId` is absent). */
  'studio.teleport': { sceneId?: string; spawnId?: string; x?: number; y?: number };
  /** Go through a door in reach, as in the game: the next scene loads at the door's `toSpawn`. */
  'studio.portal': { portalId: string };
  /** The scene profile the collision and the door gating use (GDD 3.13); the Studio starts at `large`. */
  'studio.profile': { profile: 'small' | 'medium' | 'large' };
  'studio.time': { phase: StudioDayPhase; t?: number };
  /** The round-6 clock: speed, pause, or `step` ticks (1 to 100) while paused. */
  'studio.clock': { scale?: ClockScale; paused?: boolean; step?: number };
  /** A stand-in on a tile of the current scene, at the figure's feet when `x`, `y` are absent. */
  'studio.spawn': { kind: StudioSpawnKind; ref: string; x?: number; y?: number };
  'studio.clearSpawns': Record<string, never>;
  /** Put an `items.json` item in the admin figure's hands. */
  'studio.give': { itemId: string };
  /**
   * Drop the draft (admin-studio.md 3 "Walk it"). A draft scene itself is posted to `POST /studio/draft` with this
   * room's id, since a scene is larger than one socket message; a teleport or a door to another scene drops it too.
   */
  'studio.draft': { scene: null };
}

export interface StudioS2CPayloads {
  /** Every tick to the one Studio client: the whole Studio state (it is small). */
  'studio.snapshot': {
    tick: number;
    sceneId: string;
    profile: 'small' | 'medium' | 'large';
    /** The admin figure's feet in world pixels, and the tile under them. */
    x: number;
    y: number;
    tx: number;
    ty: number;
    /** World-frame facing in radians, as `Presence.yaw`. */
    yaw: number;
    moving: boolean;
    noclip: boolean;
    scale: ClockScale;
    paused: boolean;
    time: { phase: StudioDayPhase; t: number };
    /** The stand-ins of the current scene. */
    spawns: StudioSpawn[];
    /** Item ids the admin figure holds, in the order given. */
    items: string[];
    /** True when the current scene is an unsaved draft (`studio.draft`); false or absent, the committed scene. */
    draft?: boolean;
  };
  /** New lines of the Studio room's log (applied and refused commands, scene loads); the client keeps the last 50. */
  'studio.log': { lines: string[] };
}

/** Options a Studio client passes to `create("studio", ...)`: the same build and admin token as `admin`. */
export interface StudioJoinOptions {
  build: string;
  token: string;
}
