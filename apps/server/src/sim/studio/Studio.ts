import {
  PROFILE_RANK,
  SCENE_IDS,
  type Profile,
  type Scene,
  type SceneId,
  type LooksFile,
  type QuestsFile,
  type RoutinesFile,
  items,
  looks,
  mobs,
  quests,
  routines,
  scenes,
} from '@wdi/content';
import {
  NavGrid,
  STUDIO_DAY_PHASES,
  TILE_PX,
  moveAabb,
  navFromGrid,
  overlapsSolid,
  type ClockScale,
  type StudioDayPhase,
  type StudioGiver,
  type StudioS2CPayloads,
  type StudioSpawnKind,
} from '@wdi/shared';
import { FOOT_HALF_PX, INPUT_STALE_TICKS, PORTAL_REACH_TILES } from '../constants';
import { parseMove, speedPxPerTick } from '../Movement';
import type { MoveInput } from '../RoomSim';
import { navGrid, profileOpen, tileCentre } from '../World';
import { type SimClock, stepsThisTick } from '../auto/clock';
import { type StandIn, newStandIn, standInRow, stationsOf, stepStandIns } from './standins';

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
  /** Stand-ins by scene, each with its brain (`standins.ts`); ids are `sp1`, `sp2`, ... for the room's life. */
  spawns: Map<SceneId, StandIn[]>;
  nextSpawn: number;
  items: string[];
  /**
   * An unsaved edit of one scene (`studio.draft`, admin-studio.md 3 "Walk it"): checked as a save is, used in place of
   * the committed scene for collision, doors and stand-ins in this room only, and never written anywhere. It lasts
   * until it is cleared or the figure goes to another scene.
   */
  draft: StudioDraft | null;
  /**
   * Edited NPC data (`POST /studio/npc-draft`, admin-studio.md 8): checked as a save is, read by the stand-ins and
   * the givers in place of the committed files until it is cleared or the room closes; never written anywhere.
   */
  npc: StudioNpcData | null;
  commands: StudioCommand[];
  /** Lines not yet sent to the client. */
  log: string[];
}

/** The NPC files a Studio room reads (N1): the routines, the quest NPCs and the looks. */
export interface StudioNpcData {
  routines: RoutinesFile;
  quests: QuestsFile;
  looks: LooksFile;
}

const COMMITTED_NPC: StudioNpcData = { routines, quests, looks };

/** The NPC data the room runs: the draft when one is loaded, else the committed files. */
export const npcOf = (sim: StudioSim): StudioNpcData => sim.npc ?? COMMITTED_NPC;

export interface StudioDraft {
  scene: Scene;
  /** The nav rebuilt from the draft's grid (`navFromGrid`), one grid per profile as it is asked for. */
  grids: Map<Profile, NavGrid>;
}

export type StudioCommand =
  | { kind: 'move'; raw: unknown }
  | { kind: 'noclip'; on: boolean }
  | { kind: 'teleport'; sceneId?: SceneId; spawnId?: string; x?: number; y?: number }
  | { kind: 'portal'; portalId: string }
  | { kind: 'profile'; profile: Profile }
  | { kind: 'time'; phase: StudioDayPhase; t: number }
  | { kind: 'clock'; scale?: ClockScale; paused?: boolean; step?: number }
  | { kind: 'spawn'; spawn: StudioSpawnKind; ref: string; x?: number; y?: number }
  | { kind: 'clearSpawns' }
  | { kind: 'give'; itemId: string }
  /** A scene already checked by `checkScene` (the draft route), or null to drop the draft. */
  | { kind: 'draft'; scene: Scene | null }
  /** NPC data already checked by `checkNpcDraft` (the NPC draft route), or null to drop it. */
  | { kind: 'npcDraft'; npc: StudioNpcData | null };

/** Commands waiting for the step; a flood past this is refused (`busy`). */
export const MAX_STUDIO_COMMANDS = 64;
/** Stand-ins per scene, and items in hand: tooling caps, not game numbers. */
export const MAX_STUDIO_SPAWNS = 64;
export const MAX_STUDIO_ITEMS = 32;
/** One `studio.clock {step}` runs at most this many ticks, as `admin.clock`. */
export const MAX_STUDIO_STEP = 100;

/** The scene the Studio opens on: the first of the frozen id list. */
export const STUDIO_START_SCENE: SceneId = SCENE_IDS[0]!;

const isProfile = (v: unknown): v is Profile => typeof v === 'string' && Object.hasOwn(PROFILE_RANK, v);
const isTileInt = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1024;
export const isStudioScene = (v: unknown): v is SceneId =>
  typeof v === 'string' && (SCENE_IDS as readonly string[]).includes(v);

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
    draft: null,
    npc: null,
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

/** Whether a stand-in's id exists in the NPC data the room runs (the draft's, when one is loaded). */
const ref = (npc: StudioNpcData, kind: StudioSpawnKind, id: string): boolean =>
  kind === 'mob'
    ? Object.hasOwn(mobs.mobs, id)
    : kind === 'townsfolk'
      ? Object.hasOwn(npc.routines.townsfolk, id)
      : id === 'villager' || Object.hasOwn(npc.looks.looks, id);

/** The look a stand-in wears: a townsfolk figure's routines look, a look's own id; none for a mob. */
const lookOf = (npc: StudioNpcData, kind: StudioSpawnKind, id: string): string | undefined =>
  kind === 'townsfolk' ? npc.routines.townsfolk[id]?.look : kind === 'look' ? id : undefined;

/**
 * The command of an untrusted `studio.*` payload, or a refusal reason. Shapes and ids only; whether a tile is free
 * or a door is in reach is the step's question, since only the step knows where the figure stands.
 */
export function parseStudio(type: string, raw: unknown): StudioCommand | string {
  const p =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (type === 'studio.move') return { kind: 'move', raw };
  if (p === null) return 'bad payload';
  switch (type) {
    case 'studio.noclip':
      return typeof p.on === 'boolean' ? { kind: 'noclip', on: p.on } : 'bad noclip';
    case 'studio.teleport': {
      const sceneId = p.sceneId;
      if (sceneId !== undefined && !isStudioScene(sceneId)) return 'no such scene';
      const hasTile = p.x !== undefined || p.y !== undefined;
      if (hasTile && (!isTileInt(p.x) || !isTileInt(p.y) || p.spawnId !== undefined)) return 'bad tile';
      if (!hasTile && typeof p.spawnId !== 'string') return 'bad teleport';
      return {
        kind: 'teleport',
        ...(sceneId !== undefined ? { sceneId } : {}),
        ...(hasTile ? { x: p.x as number, y: p.y as number } : { spawnId: p.spawnId as string }),
      };
    }
    case 'studio.portal':
      return typeof p.portalId === 'string' ? { kind: 'portal', portalId: p.portalId } : 'bad portal';
    case 'studio.profile':
      return isProfile(p.profile) ? { kind: 'profile', profile: p.profile } : 'bad profile';
    case 'studio.time': {
      if (!(STUDIO_DAY_PHASES as readonly unknown[]).includes(p.phase)) return 'bad time';
      const t = p.t === undefined ? 0.5 : p.t;
      if (typeof t !== 'number' || !(t >= 0 && t <= 1)) return 'bad time';
      return { kind: 'time', phase: p.phase as StudioDayPhase, t };
    }
    case 'studio.clock': {
      const { scale, paused, step } = p;
      if (scale !== undefined && ![1, 2, 5, 10].includes(scale as number)) return 'bad clock';
      if (paused !== undefined && typeof paused !== 'boolean') return 'bad clock';
      const okStep = Number.isInteger(step) && (step as number) >= 1 && (step as number) <= MAX_STUDIO_STEP;
      if (step !== undefined && !okStep) return 'bad clock';
      if (scale === undefined && paused === undefined && step === undefined) return 'bad clock';
      return {
        kind: 'clock',
        ...(scale !== undefined ? { scale: scale as ClockScale } : {}),
        ...(paused !== undefined ? { paused: paused as boolean } : {}),
        ...(step !== undefined ? { step: step as number } : {}),
      };
    }
    case 'studio.spawn': {
      const kind = p.kind;
      if (kind !== 'mob' && kind !== 'townsfolk' && kind !== 'look') return 'bad spawn';
      // A townsfolk or look id is checked in the step, against the NPC draft when one is loaded.
      if (typeof p.ref !== 'string' || !/^[\w.-]{1,64}$/.test(p.ref)) return 'no such figure';
      if (kind === 'mob' && !ref(COMMITTED_NPC, kind, p.ref)) return 'no such figure';
      const hasTile = p.x !== undefined || p.y !== undefined;
      if (hasTile && (!isTileInt(p.x) || !isTileInt(p.y))) return 'bad tile';
      return {
        kind: 'spawn',
        spawn: kind,
        ref: p.ref,
        ...(hasTile ? { x: p.x as number, y: p.y as number } : {}),
      };
    }
    case 'studio.clearSpawns':
      return { kind: 'clearSpawns' };
    case 'studio.draft':
      // A scene is too big for one socket message (4 KB): it comes through `POST /studio/draft`, which checks it.
      return p.scene === null ? { kind: 'draft', scene: null } : 'send a draft scene by POST /studio/draft';
    case 'studio.npcDraft':
      return p.npc === null ? { kind: 'npcDraft', npc: null } : 'send NPC data by POST /studio/npc-draft';
    case 'studio.give':
      return typeof p.itemId === 'string' && Object.hasOwn(items.items, p.itemId)
        ? { kind: 'give', itemId: p.itemId }
        : 'no such item';
    default:
      return 'unknown command';
  }
}

/** The scene the Studio runs for an id: the draft when it is that scene's, else the committed one. */
export const sceneOf = (sim: StudioSim, sceneId: SceneId = sim.sceneId): Scene =>
  sim.draft?.scene.id === sceneId ? sim.draft.scene : scenes[sceneId];

function grid(sim: StudioSim, sceneId: SceneId = sim.sceneId): NavGrid {
  const draft = sim.draft;
  if (draft?.scene.id !== sceneId) return navGrid(sceneId, sim.profile);
  let g = draft.grids.get(sim.profile);
  if (!g) {
    g = new NavGrid(navFromGrid(draft.scene), sim.profile);
    draft.grids.set(sim.profile, g);
  }
  return g;
}

/** A figure fits here: inside the scene, and off the walls unless noclip. */
function fits(sim: StudioSim, sceneId: SceneId, x: number, y: number): boolean {
  const g = grid(sim, sceneId);
  if (x < 0 || y < 0 || x >= g.w * g.tile || y >= g.h * g.tile) return false;
  return sim.noclip || !overlapsSolid(g, x, y, FOOT_HALF_PX, FOOT_HALF_PX);
}

/** Loads a scene at a spawn (or a tile); false, and nothing changes, when the target does not exist or is a wall. */
function enter(
  sim: StudioSim,
  sceneId: SceneId,
  at: { spawnId: string } | { x: number; y: number },
): boolean {
  let tx: number;
  let ty: number;
  if ('spawnId' in at) {
    const spawn = sceneOf(sim, sceneId).spawns.find((s) => s.id === at.spawnId);
    if (!spawn) return false;
    tx = spawn.x;
    ty = spawn.y;
  } else {
    tx = at.x;
    ty = at.y;
  }
  const x = tileCentre(tx, TILE_PX);
  const y = tileCentre(ty, TILE_PX);
  if (!fits(sim, sceneId, x, y)) return false;
  if (sceneId !== sim.sceneId) say(sim, `scene ${sceneId}`);
  if (sim.draft !== null && sim.draft.scene.id !== sceneId) dropDraft(sim);
  sim.sceneId = sceneId;
  place(sim, x, y);
  return true;
}

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
    case 'noclip':
      sim.noclip = cmd.on;
      say(sim, `noclip ${cmd.on ? 'on' : 'off'}`);
      return null;
    case 'teleport': {
      const sceneId = cmd.sceneId ?? sim.sceneId;
      const at = cmd.spawnId !== undefined ? { spawnId: cmd.spawnId } : { x: cmd.x!, y: cmd.y! };
      if (!enter(sim, sceneId, at)) return 'cannot stand there';
      say(sim, `teleport ${sceneId} ${'spawnId' in at ? at.spawnId : `${at.x},${at.y}`}`);
      return null;
    }
    case 'portal': {
      const portal = sceneOf(sim).portals.find((p) => p.id === cmd.portalId);
      if (!portal) return 'no such door';
      const d = Math.hypot(sim.x - tileCentre(portal.x, TILE_PX), sim.y - tileCentre(portal.y, TILE_PX));
      if (d > PORTAL_REACH_TILES * TILE_PX) return 'too far';
      if (!profileOpen(portal.minProfile, sim.profile) || portal.to === null || portal.toSpawn === null) {
        return 'door shut';
      }
      if (!isStudioScene(portal.to) || !enter(sim, portal.to, { spawnId: portal.toSpawn }))
        return 'door shut';
      say(sim, `door ${portal.id}`);
      return null;
    }
    case 'profile':
      sim.profile = cmd.profile;
      say(sim, `profile ${cmd.profile}`);
      return null;
    case 'time':
      sim.time = { phase: cmd.phase, t: cmd.t };
      say(sim, `time ${cmd.phase} ${cmd.t}`);
      return null;
    case 'clock':
      if (cmd.scale !== undefined) sim.clock.scale = cmd.scale;
      if (cmd.paused !== undefined) sim.clock.paused = cmd.paused;
      if (cmd.step !== undefined) sim.clock.pendingSteps += cmd.step;
      say(sim, `clock ${sim.clock.scale}x${sim.clock.paused ? ' paused' : ''}`);
      return null;
    case 'spawn': {
      if (!ref(npcOf(sim), cmd.spawn, cmd.ref)) return 'no such figure';
      const list = sim.spawns.get(sim.sceneId) ?? [];
      if (list.length >= MAX_STUDIO_SPAWNS) return 'too many spawns';
      const tx = cmd.x ?? Math.floor(sim.x / TILE_PX);
      const ty = cmd.y ?? Math.floor(sim.y / TILE_PX);
      const g = grid(sim);
      if (tx >= g.w || ty >= g.h) return 'bad tile';
      const spawn = newStandIn(
        `sp${sim.nextSpawn++}`,
        cmd.spawn,
        cmd.ref,
        sceneOf(sim),
        tx,
        ty,
        npcOf(sim).routines,
      );
      list.push(spawn);
      sim.spawns.set(sim.sceneId, list);
      say(sim, `spawn ${spawn.id} ${cmd.spawn} ${cmd.ref} ${tx},${ty}`);
      return null;
    }
    case 'clearSpawns':
      sim.spawns.clear();
      say(sim, 'clear spawns');
      return null;
    case 'give':
      if (sim.items.length >= MAX_STUDIO_ITEMS) return 'hands full';
      sim.items.push(cmd.itemId);
      say(sim, `give ${cmd.itemId}`);
      return null;
    case 'draft':
      return cmd.scene === null ? (dropDraft(sim), null) : loadDraft(sim, cmd.scene);
    case 'npcDraft':
      if (cmd.npc === null && sim.npc === null) return null;
      sim.npc = cmd.npc;
      restation(sim);
      say(sim, cmd.npc === null ? 'NPC draft dropped' : 'NPC draft (unsaved)');
      return null;
  }
}

/**
 * After the NPC data changes, every stand-in reads it again: a townsfolk figure takes its kind's new stations from
 * the first, and one whose kind or look the data no longer holds is removed.
 */
function restation(sim: StudioSim): void {
  const npc = npcOf(sim);
  for (const [sceneId, list] of sim.spawns) {
    const kept = list.filter((b) => ref(npc, b.kind, b.ref));
    for (const b of kept)
      if (b.kind === 'townsfolk') {
        b.stations = stationsOf(sceneOf(sim, sceneId), b.ref, npc.routines);
        b.station = 0;
        b.workUntilTick = 0;
        b.path = null;
      }
    if (kept.length < list.length) say(sim, `${list.length - kept.length} stand-ins left the NPC data`);
    sim.spawns.set(sceneId, kept);
  }
}

/** The current scene's quest givers, with the names and looks of the NPC data the room runs. */
function giversOf(sim: StudioSim): StudioGiver[] {
  const npcs = npcOf(sim).quests.npcs;
  return (sceneOf(sim).givers ?? []).flatMap((g) => {
    const n = npcs[g.npc];
    return n ? [{ id: g.id, npc: g.npc, name: n.name, look: n.look, x: g.x, y: g.y, facing: g.facing }] : [];
  });
}

/**
 * Walks a draft: the figure goes to its scene, on the tile it stands on when that is the draft's scene and still open,
 * else at the draft's first spawn. The scene's stand-ins are dropped, since their stations may have moved.
 */
function loadDraft(sim: StudioSim, scene: Scene): string | null {
  const sceneId = scene.id as SceneId;
  const before = sim.draft;
  sim.draft = { scene, grids: new Map() };
  const here = { x: Math.floor(sim.x / TILE_PX), y: Math.floor(sim.y / TILE_PX) };
  const first = scene.spawns[0];
  const ok =
    (sceneId === sim.sceneId && enter(sim, sceneId, here)) ||
    (first !== undefined && enter(sim, sceneId, { spawnId: first.id }));
  if (!ok) {
    sim.draft = before;
    return 'cannot stand there';
  }
  sim.spawns.delete(sceneId);
  if (before !== null && before.scene.id !== sceneId) sim.spawns.delete(before.scene.id as SceneId);
  say(sim, `draft ${sceneId} (unsaved)`);
  return null;
}

function dropDraft(sim: StudioSim): void {
  const draft = sim.draft;
  if (draft === null) return;
  sim.draft = null;
  sim.spawns.delete(draft.scene.id as SceneId);
  say(sim, `draft ${draft.scene.id} dropped`);
  // The committed scene may wall the tile the draft left open.
  if (draft.scene.id === sim.sceneId && !fits(sim, sim.sceneId, sim.x, sim.y)) {
    const spawn = scenes[sim.sceneId].spawns[0];
    if (spawn) place(sim, tileCentre(spawn.x, TILE_PX), tileCentre(spawn.y, TILE_PX));
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
 * ticks of the figure and its scene's stand-ins as the round-6 clock says (`stepsThisTick`: the scale under the budget, or the single steps
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
    stepStandIns(sim.spawns.get(sim.sceneId) ?? [], {
      tick: sim.tick,
      scene: sceneOf(sim),
      grid: grid(sim),
      phase: sim.time.phase,
      admin: { x: sim.x, y: sim.y },
    });
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
    spawns: (sim.spawns.get(sim.sceneId) ?? []).map((b) => standInRow(b, lookOf(npcOf(sim), b.kind, b.ref))),
    items: [...sim.items],
    draft: sim.draft !== null,
    npcDraft: sim.npc !== null,
    givers: giversOf(sim),
  };
}
