import { randomInt } from 'node:crypto';
import { type Rng, mulberry32 } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';

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
  /** The role card ready tick and the meeting vote tick (`npc.vote` delays), -1 until drawn. */
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
  /** A Killer that rolled its strike chance and is closing on its prey. */
  striking = false;
  path: PathPlan | null = null;
  /** Quick mode: sends of the dusk plate act, and the night act already sent for this plan key. */
  plateSends = 0;
  lastPlateSendTick = -1;
  sentPlan = '';
}

/** A `debug.npc` payload waiting for the step (WDI_DEBUG only). */
export interface NpcDebugCommand {
  walk?: boolean;
}

/** Room memory of the NPC stage; lives as long as the room (A39). */
export class NpcMemory {
  /** The seats that are NPCs, and the order they were added in (`lobby.removeNpc` drops the newest). */
  readonly ids = new Set<string>();
  readonly order: string[] = [];
  readonly brains = new Map<string, Brain>();
  readonly rng: Rng = mulberry32(randomInt(2 ** 32));
  /** False parks every NPC on its spawn (`debug.npc`). */
  walk = true;
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
