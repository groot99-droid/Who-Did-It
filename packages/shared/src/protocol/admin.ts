// Round 6: the admin wire of docs/round6/auto-admin.md 6. Only the `admin` room (apps/server/src/rooms/AdminRoom.ts,
// registered under WDI_ADMIN=1, Session 6C) accepts these; a `party` room's message gate accepts the `C2S` union of
// ./index.ts only, so an `admin.*` message to it is dropped. Every admin command is queued into the auto command
// list and applied inside the step (CLAUDE.md). Rendered into docs/PROTOCOL.md's "Admin" section.
import type { FixedSeeds } from './seeds';

export const ADMIN_C2S = {
  setup: 'admin.setup',
  start: 'admin.start',
  reset: 'admin.reset',
  clock: 'admin.clock',
} as const;

export const ADMIN_S2C = {
  snapshot: 'admin.snapshot',
  event: 'admin.event',
  invariant: 'admin.invariant',
} as const;

export type AdminC2SType = (typeof ADMIN_C2S)[keyof typeof ADMIN_C2S];
export type AdminS2CType = (typeof ADMIN_S2C)[keyof typeof ADMIN_S2C];

/** Sim speeds the clock accepts (`sim/auto/clock.ts`); a `party` room never leaves 1. */
export type ClockScale = 1 | 2 | 5 | 10;

/** Everything the god view knows about a seat, roles and covers included: the admin page is the owner's. */
export interface AdminSeat {
  id: string;
  name: string;
  roleId: string;
  /** The public look; `coverOf` the card's own look when the seat wears a cover, absent otherwise. */
  look: string;
  coverOf?: string;
  sceneId: string;
  x: number;
  y: number;
  dead: boolean;
  /** The NPC brain's fields, absent for a human seat. */
  brain?: { mode: string; goal: string; striking: boolean; flee: boolean };
}

/** A creature as the god view lists it (round 6, M5b). */
export interface AdminMob {
  id: string;
  kind: string;
  sceneId: string;
  x: number;
  y: number;
  state: string;
}

/** One invariant failure (`sim/auto/invariants.ts`); `detail` is free text for the log pane. */
export interface InvariantFailure {
  name: string;
  tick: number;
  detail: string;
}

/** One event of the sim bus (`sim/events/bus.ts`), as the log pane and the match log record it: seats, never handles. */
export interface SimEventWire {
  tick: number;
  kind: string;
  seat?: string;
  sceneId?: string;
  data?: Record<string, unknown>;
}

export interface AdminC2SPayloads {
  /** Configure the next match: a `MAP_IDS` id, the mode, the seat count (all NPCs), the difficulty, an optional deck and seed words. Applied at the next `admin.start`. */
  'admin.setup': {
    map: string;
    mode: 'main' | 'onub';
    seats: number;
    difficulty: 'easy' | 'normal' | 'hard';
    deck?: string[];
    seeds?: FixedSeeds;
  };
  /** Start the configured match inside the step (`runAuto` calls `startMatch`); no leader is needed. */
  'admin.start': Record<string, never>;
  /** Back to the lobby with the same setup, the clock paused. */
  'admin.reset': Record<string, never>;
  /** Set the speed, pause or resume, or run `step` ticks while paused. */
  'admin.clock': { scale?: ClockScale; paused?: boolean; step?: number };
}

export interface AdminS2CPayloads {
  /** Every tick, to the admin client only: the sim's state beyond the schema. `effectiveScale` is the speed actually reached under the tick budget. */
  'admin.snapshot': {
    tick: number;
    phase: number;
    scale: ClockScale;
    paused: boolean;
    effectiveScale: number;
    seats: AdminSeat[];
    mobs?: AdminMob[];
    invariants: InvariantFailure[];
  };
  /** The tick's sim events. */
  'admin.event': { events: SimEventWire[] };
  /** Once per new invariant failure. */
  'admin.invariant': InvariantFailure;
}

/** Options an admin client passes to `create("admin", ...)`: the build and the GitHub-login token (auto-admin.md 7). */
export interface AdminJoinOptions {
  build: string;
  token: string;
}
