import type { Rng } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import type { Persona } from './routine';

/** This seat's choices stream (`npcPlay:<seatId>`, GDD 3.12): persona, activities, durations, strikes, votes. */
export const playRng = (room: PartyRoom, id: string): Rng => room.seeds.get('npcPlay', id);
/** This seat's timing stream (`npcTiming:<seatId>`): the ready, vote and night-power ticks, the Last Shot delay. */
export const timingRng = (room: PartyRoom, id: string): Rng => room.seeds.get('npcTiming', id);

/** A path over one scene's tiles toward a goal, followed for about a second before it is rebuilt. */
export interface PathPlan {
  key: string;
  scene: number;
  bornTick: number;
  tiles: { x: number; y: number }[];
}

/** What one NPC seat remembers. Room memory only; cleared at every role card and at the lobby reset. */
export class Brain {
  seq = 0;
  /** The tick the next wander heading is drawn on. */
  nextHeadingTick = 0;
  heading = { dx: 0, dy: -1 };
  /** The portal the current heading is aimed at (empty when it is a plain compass heading). */
  steerPortal = '';
  /**
   * The role card ready tick (`npc.ready.delayS`) and the meeting vote tick (`npc.vote.windowFrac`), -1 until
   * drawn.
   */
  readyAtTick = -1;
  voteAtTick = -1;
  nextRevoteTick = 0;
  /** Bodies this seat has taken in already, and the tick each first came within report reach. */
  readonly seenBodies = new Set<string>();
  readonly reachedBodyTick = new Map<string, number>();
  /** Per seat: how often it was in sight when this NPC came across a body (the A41 suspicion stand-in). */
  readonly suspicion = new Map<string, number>();
  /** A Killer's run after a strike: first to a scene with a basin, then back to the overworld square. */
  flee: 'basin' | 'square' | null = null;
  /** A Killer that rolled its strike chance (or whose kill-opportunity timer ran out) and is closing on its prey. */
  striking = false;
  /**
   * The kill-opportunity timer (GDD 3.12, A100): the one seat this Killer has been alone with in its room, and the
   * tick that started; null and -1 when none. Kept for every NPC that holds the Knife, no draw.
   */
  aloneWith: string | null = null;
  aloneSinceTick = -1;
  path: PathPlan | null = null;
  /**
   * Card-blind draws made for every NPC (npc.md 6; Session 5H draws them, 5G reads them): the night-power tick
   * (drawn on the first tick of each dusk and each Final Night hunt) and pick (a uniform in [0, 1)), and the Last
   * Shot tick (the first tick the seat is seen dead plus a `lastShotS` delay, so `lastShotS` after its aim starts);
   * -1 when none.
   */
  nightPowerAtTick = -1;
  nightPowerPick = 0;
  lastShotAtTick = -1;

  /** What drives the seat now; tests read it to exempt reactions and the fallback (the walk home is not exempt). */
  mode: 'routine' | 'react' | 'home' | 'fallback' = 'routine';
  /** Night class in an unlit scene: the tick the walk home starts (`npc.night.leaveDelayS`); -1 when none. */
  leaveAtTick = -1;
  /** A home and favourite stations, drawn at the role card (GDD 3.12 "Persona"). */
  persona: Persona | null = null;
  /** The current activity; null when the next must be chosen. */
  act: Act | null = null;
  /** Scene bookkeeping: the scene seen last tick, when it was entered, when its dwell runs out. */
  sceneIdx = -1;
  sceneEnteredTick = 0;
  sceneDwellUntilTick = 0;
  /** The station left last, never picked straight again. */
  lastStationId = '';
  /** Moving ticks since the last still stretch of `idleS.min`, and the current still run. */
  walkTicks = 0;
  stillTicks = 0;
  lastX = 0;
  lastY = 0;
  /** A forced or leg pause: the seat stands until this tick and then resumes its activity. */
  pauseUntilTick = -1;
  /** Progress watch for `stuckS`: where the seat last gained a quarter tile, and when. */
  anchorX = 0;
  anchorY = 0;
  anchorTick = 0;
  goalKey = '';
  /** A portal walk of this seat ended in a crossing queued until this tick (a leg that may be followed by a pause). */
  crossingUntil = -1;
  /** The M3c wander runs until this tick when no station and no stroll tile qualified. */
  fallbackUntilTick = -1;
  /** The uniforms of the vote tick (suspect roll, suspect tie, fallback seat), drawn once per meeting. */
  voteRolls: readonly [number, number, number] | null = null;
  /** Clues sighted (and rolled for), and the one chosen for collecting with the scene it lies in. */
  readonly seenClues = new Set<string>();
  pendingClue = '';
  pendingClueScene = -1;
  /** Bodies this seat made with its own strikes: never startled at, never reported. */
  readonly ownBodies = new Set<string>();
  startleUntilTick = -1;
  /** A grace or immunity placement happened and has not been handled yet. */
  placementPending = false;
  placementIdleUntilTick = -1;
  /** Hold attempts at the current station visit (a refusal ends the visit; tests count them). */
  holdTries = 0;
  /** The seat last stood still between actions (an idle, a stop, a leg pause): its next choice is an action (D1). */
  rested = false;
  /** The next lobby ready (after Add NPC and after the return to the lobby); -1 when none. */
  lobbyReadyAtTick = -1;
  /** A body approach that found no path is retried after this tick. */
  bodyRetryTick = -1;
}

/** One activity of a routine (GDD 3.12 "Choosing"). */
export interface Act {
  kind: 'work' | 'stroll' | 'idle' | 'collect' | 'travel';
  untilTick: number;
  /** The station prop id (travel, work) or the clue id (collect). */
  stationId: string;
  /** Where the walk ends: a point of `scene` in pixels. */
  goal: { scene: number; x: number; y: number } | null;
  /** Travel: a Killer NPC's hunt for a lone human, which may cross several scenes (GDD 3.12 "Night"). */
  hunt?: boolean;
  /** Work: the step toward the prop was made. */
  faced?: boolean;
  /** Work with a hold: a hold of ours is running, the next cycle starts after `holdAgainTick`, the server refused. */
  holding?: boolean;
  holdAgainTick?: number;
  refused?: boolean;
  /** Work at a counter: the sale was made; work with a hold: another seat holds the prop, so the visit ends (D1). */
  traded?: boolean;
  yielding?: boolean;
}

/** A `debug.npc` payload waiting for the step (WDI_DEBUG only). */
export interface NpcDebugCommand {
  walk?: boolean;
  routine?: boolean;
}

/** Room memory of the NPC stage; lives as long as the room (A39). */
export class NpcMemory {
  /** The seats that are NPCs, and the order they were added in (`lobby.removeNpc` drops the newest). */
  readonly ids = new Set<string>();
  readonly order: string[] = [];
  readonly brains = new Map<string, Brain>();
  /** Station prop id -> the NPC at it or heading for it; released when the visit ends (GDD 3.12 "Work"). */
  readonly claims = new Map<string, string>();
  /** False parks every NPC on its spawn (`debug.npc`). */
  walk = true;
  /** False sends every NPC back to the M3c wander (`debug.npc`, the detector self-check). */
  routine = true;
  /** The phase last seen, so a brain resets when a new one begins. */
  phase = -1;
  readonly debug: NpcDebugCommand[] = [];

  brain(id: string): Brain {
    let brain = this.brains.get(id);
    if (!brain) {
      brain = new Brain();
      this.brains.set(id, brain);
    }
    return brain;
  }
}

const memories = new WeakMap<PartyRoom, NpcMemory>();
export function npcMemory(room: PartyRoom): NpcMemory {
  let mem = memories.get(room);
  if (!mem) {
    mem = new NpcMemory();
    memories.set(room, mem);
  }
  return mem;
}

/** Keeps `Settings.npcSeats` (a count, never a marker) equal to the set. */
export function syncNpcCount(room: PartyRoom): void {
  const count = npcMemory(room).ids.size;
  if (room.state.settings.npcSeats !== count) room.state.settings.npcSeats = count;
}
