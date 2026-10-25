import { SCENE_IDS, type Profile, type SceneId, scenes } from '@wdi/content';
import {
  TILE_PX,
  moveAabb,
  type StudioDayPhase,
  type StudioS2CPayloads,
  type StudioSpawn,
} from '@wdi/shared';
import { FOOT_HALF_PX, INPUT_STALE_TICKS } from '../constants';
import { parseMove, speedPxPerTick } from '../Movement';
import type { MoveInput } from '../RoomSim';
import { navGrid, tileCentre } from '../World';
import { type SimClock, stepsThisTick } from '../auto/clock';

/**
 * Creative mode (round 9, docs/round9/admin-studio.md 2): one scene of `@wdi/content`, one admin figure, the stand-ins
 * the owner places. Pure: `StudioRoom` queues the parsed commands and `stepStudio` applies them, then runs the ticks
 * the clock asks for. Nothing here reads or writes a `party` room.
 */
export interface StudioSim {
  tick: number;
  sceneId: SceneId;
  profile: Profile;
  x: number;
  y: number;
  yaw: number;
  moving: boolean;
  noclip: boolean;
  input: MoveInput | null;
  lastSeq: number;
  time: { phase: StudioDayPhase; t: number };
  clock: SimClock;
  /** Stand-ins by scene; ids are `sp1`, `sp2`, ... for the room's life. */
  spawns: Map<SceneId, StudioSpawn[]>;
  nextSpawn: number;
  items: string[];
  commands: StudioCommand[];
  /** Lines not yet sent to the client. */
  log: string[];
}

export type StudioCommand = { kind: 'move'; raw: unknown };

/** Commands waiting for the step; a flood past this is refused (`busy`). */
export const MAX_STUDIO_COMMANDS = 64;

/** The scene the Studio opens on: the first of the frozen id list. */
export const STUDIO_START_SCENE: SceneId = SCENE_IDS[0]!;

export function createStudio(sceneId: SceneId = STUDIO_START_SCENE): StudioSim {
  const sim: StudioSim = {
    tick: 0,
    sceneId,
    profile: 'large',
    x: 0,
    y: 0,
    yaw: 0,
    moving: false,
    noclip: false,
    input: null,
    lastSeq: -1,
    time: { phase: 'day', t: 0.5 },
    clock: { scale: 1, paused: false, pendingSteps: 0, carry: 0 },
    spawns: new Map(),
    nextSpawn: 1,
    items: [],
    commands: [],
    log: [],
  };
  const spawn = scenes[sceneId].spawns[0];
  if (spawn) place(sim, tileCentre(spawn.x, TILE_PX), tileCentre(spawn.y, TILE_PX));
  else place(sim, tileCentre(0, TILE_PX), tileCentre(0, TILE_PX));
  return sim;
}

function place(sim: StudioSim, x: number, y: number): void {
  sim.x = x;
  sim.y = y;
  sim.input = null;
}

const say = (sim: StudioSim, line: string): void => {
  sim.log.push(`t${sim.tick} ${line}`);
};

/**
 * The command of an untrusted `studio.*` payload, or a refusal reason. Shapes and ids only; whether a tile is free
 * or a door is in reach is the step's question, since only the step knows where the figure stands.
 */
export function parseStudio(type: string, raw: unknown): StudioCommand | string {
  const p =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (type === 'studio.move') return { kind: 'move', raw };
  if (p === null) return 'bad payload';
  return 'unknown command';
}

const grid = (sim: StudioSim) => navGrid(sim.sceneId, sim.profile);

/** Applies one queued command; a refusal is returned for the room to send, and changes nothing. */
export function applyStudio(sim: StudioSim, cmd: StudioCommand): string | null {
  switch (cmd.kind) {
    case 'move': {
      const input = parseMove(cmd.raw, sim.tick);
      if (input !== null && input.seq > sim.lastSeq) {
        sim.lastSeq = input.seq;
        sim.input = input;
      }
      return null;
    }
  }
}

/** One tick of the figure: the newest input, the walk speed, the swept box (or only the edge, under noclip). */
function walk(sim: StudioSim): void {
  const input = sim.input;
  sim.moving = false;
  if (input !== null && sim.tick - input.tick > INPUT_STALE_TICKS) sim.input = null;
  if (sim.input === null || (input!.dx === 0 && input!.dy === 0)) return;
  const speed = speedPxPerTick(input!.sprint, false);
  const vx = input!.dx * speed;
  const vy = input!.dy * speed;
  const g = grid(sim);
  const x0 = sim.x;
  const y0 = sim.y;
  if (sim.noclip) {
    sim.x = Math.min(Math.max(sim.x + vx, 0), g.w * g.tile - 1);
    sim.y = Math.min(Math.max(sim.y + vy, 0), g.h * g.tile - 1);
  } else {
    const r = moveAabb(g, sim.x, sim.y, vx, vy, FOOT_HALF_PX, FOOT_HALF_PX);
    sim.x = r.x;
    sim.y = r.y;
  }
  sim.yaw = Math.atan2(input!.dx, -input!.dy);
  sim.moving = sim.x !== x0 || sim.y !== y0;
}

/**
 * The room's step: every queued command first (paused or not, so a teleport works on a frozen world), then as many
 * ticks of the figure as the round-6 clock says (`stepsThisTick`: the scale under the budget, or the single steps
 * asked while paused). Returns the refusals, each to send to the client.
 */
export function stepStudio(sim: StudioSim, lastStepMs = 0): string[] {
  const refusals: string[] = [];
  for (const cmd of sim.commands.splice(0)) {
    const why = applyStudio(sim, cmd);
    if (why !== null) {
      refusals.push(why);
      say(sim, `refused ${cmd.kind}: ${why}`);
    }
  }
  const ticks = stepsThisTick(sim.clock, lastStepMs);
  for (let i = 0; i < ticks; i++) {
    sim.tick++;
    walk(sim);
  }
  return refusals;
}

export function studioSnapshot(sim: StudioSim): StudioS2CPayloads['studio.snapshot'] {
  return {
    tick: sim.tick,
    sceneId: sim.sceneId,
    profile: sim.profile,
    x: Math.round(sim.x),
    y: Math.round(sim.y),
    tx: Math.floor(sim.x / TILE_PX),
    ty: Math.floor(sim.y / TILE_PX),
    yaw: sim.yaw,
    moving: sim.moving,
    noclip: sim.noclip,
    scale: sim.clock.scale,
    paused: sim.clock.paused,
    time: { ...sim.time },
    spawns: (sim.spawns.get(sim.sceneId) ?? []).map((s) => ({ ...s })),
    items: [...sim.items],
  };
}
