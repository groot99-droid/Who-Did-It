import { type DayPart, type MobDef, balance, mobs, scenes } from '@wdi/content';
import { Mob, Phase, TICK_RATE, TILE_PX, npcDelayTicks, segmentBlocked, tilePath } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { AnimId } from './constants';
import { type MobMind, MobState, newMind, think } from './mobs/ai';
import { hurtByCreature, resetHurts } from './mobs/hurt';
import { burningLights, lightBurns, resetLights } from './mobs/light';
import { type SpawnSite, awake, dayPartOf, spawnSites } from './mobs/spawn';
import { simOf } from './RoomSim';
import { navGrid, tileCentre } from './World';

/**
 * Mobs (round 6, M5b, GDD 3.15; docs/round6/m5b-data.md 2.2): one creature per spawner of the room's map, awake in
 * the spawner's parts of the day, driven by the FSM of `mobs/ai.ts` and walked along tile paths that never leave its
 * leash. Every draw is from `seeds.get('mobs', spawnerId)`. The body lives here in room memory; the wire is
 * `SceneState.mobs` (`Mob { id, kind, x, y, yaw, animId, state }`, no seat, no handle). An attack lands through
 * `mobs/hurt.ts`, and a wolf's last one through `creatureKill` (Kill.ts) and `markDead(..., 'wolf')`.
 */

/** A creature's attack swing shows this long on the wire (presentation, like the knife's swing). */
const SWING_TICKS = TICK_RATE / 2;
/** A roam goal counts as reached within this distance. */
const GOAL_PX = TILE_PX / 4;
/** A path is rebuilt from where the creature stands at least this often. */
const REPLAN_TICKS = TICK_RATE;
/** Tries at a random roam point inside the leash before the creature heads home instead. */
const ROAM_TRIES = 4;

/** One creature in room memory. */
export interface MobBody {
  id: string;
  site: SpawnSite;
  def: MobDef;
  mind: MobMind;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  leashPx: number;
  yaw: number;
  moving: boolean;
  /** The next point of the spawner's loop. */
  waypoint: number;
  goal: { x: number; y: number } | null;
  path: { key: string; bornTick: number; tiles: { x: number; y: number }[] } | null;
  /** The tick its prey came into reach, -1 when out of reach. */
  reachSinceTick: number;
  swingUntilTick: number;
}

interface MobMemory {
  sites: SpawnSite[] | null;
  bodies: Map<string, MobBody>;
}

const memories = new WeakMap<PartyRoom, MobMemory>();
function memoryOf(room: PartyRoom): MobMemory {
  let memory = memories.get(room);
  if (!memory) memories.set(room, (memory = { sites: null, bodies: new Map() }));
  return memory;
}

/** The creatures awake now, by id (tests and the NPC flee read them). */
export const mobBodies = (room: PartyRoom): ReadonlyMap<string, MobBody> => memoryOf(room).bodies;

/** Every creature leaves the world and the wire (the lobby, the card). */
function clearMobs(room: PartyRoom): void {
  const memory = memoryOf(room);
  for (const body of memory.bodies.values()) room.state.scenes.get(body.site.scene)?.mobs.delete(body.id);
  memory.bodies.clear();
  memory.sites = null;
  resetHurts(room);
  resetLights(room);
}

/** Step stage after `runResources` (locked call site in `sim/Step.ts`): spawn, think, move, attack. */
export function runMobs(room: PartyRoom): void {
  const phase = room.state.phase;
  if (phase === Phase.lobby || phase === Phase.roleReveal) {
    clearMobs(room);
    return;
  }
  const part = dayPartOf(phase);
  // Outside the world phases (a meeting, the reveal, game over) the creatures hold still.
  if (part === null || !simOf(room).profileFixed) return;
  const memory = memoryOf(room);
  memory.sites ??= spawnSites(room);
  for (const site of memory.sites) {
    const id = site.spawner.id;
    const body = memory.bodies.get(id);
    if (awake(site.spawner, part)) {
      if (!body) spawn(room, memory, site);
    } else if (body) {
      room.state.scenes.get(site.scene)?.mobs.delete(id);
      memory.bodies.delete(id);
    }
  }
  for (const body of memory.bodies.values()) {
    stepBody(room, body, part);
    publish(room, body);
  }
}

function spawn(room: PartyRoom, memory: MobMemory, site: SpawnSite): void {
  const def = mobs.mobs[site.spawner.mob];
  const scene = room.state.scenes.get(site.scene);
  if (!def || !scene) return;
  const x = tileCentre(site.spawner.x, TILE_PX);
  const y = tileCentre(site.spawner.y, TILE_PX);
  const body: MobBody = {
    id: site.spawner.id,
    site,
    def,
    mind: newMind(),
    x,
    y,
    homeX: x,
    homeY: y,
    leashPx: site.spawner.leashTiles * TILE_PX,
    yaw: 0,
    moving: false,
    waypoint: 0,
    goal: null,
    path: null,
    reachSinceTick: -1,
    swingUntilTick: 0,
  };
  memory.bodies.set(body.id, body);
  const mob = new Mob();
  mob.id = body.id;
  mob.kind = def.id;
  scene.mobs.set(body.id, mob);
}

const rngOf = (room: PartyRoom, body: MobBody) => room.seeds.get('mobs', body.id);
const inLeash = (body: MobBody, x: number, y: number): boolean =>
  Math.hypot(x - body.homeX, y - body.homeY) <= body.leashPx;

/** A point pulled back inside the leash along the line to the spawner. */
function clampToLeash(body: MobBody, x: number, y: number): { x: number; y: number } {
  const d = Math.hypot(x - body.homeX, y - body.homeY);
  if (d <= body.leashPx) return { x, y };
  const f = body.leashPx / d;
  return { x: body.homeX + (x - body.homeX) * f, y: body.homeY + (y - body.homeY) * f };
}

/** The nearest burning flame within the creature's flee radius: a seat's carried light or a scene flame. */
function nearestFlame(room: PartyRoom, body: MobBody, part: DayPart): { x: number; y: number } | null {
  const reach = body.def.fleeLightTiles * TILE_PX;
  let best: { x: number; y: number; d: number } | null = null;
  const consider = (x: number, y: number): void => {
    const d = Math.hypot(x - body.x, y - body.y);
    if (d <= reach && (best === null || d < best.d)) best = { x, y, d };
  };
  for (const l of burningLights(scenes[body.site.scene], part, TILE_PX, true)) consider(l.x, l.y);
  for (const [seat, p] of simOf(room).players) {
    if (!p.placed || p.sceneIdx !== body.site.sceneIdx) continue;
    if (lightBurns(room, seat)) consider(p.x, p.y);
  }
  return best;
}

/** The nearest living seat of its scene within its senses and in sight; ghosts and seats in transit are never sensed. */
function sensePrey(room: PartyRoom, body: MobBody): string | null {
  const sim = simOf(room);
  const grid = navGrid(body.site.scene, sim.profile);
  const reach = body.def.senseTiles * TILE_PX;
  let best: { seat: string; d: number } | null = null;
  for (const [seat, p] of sim.players) {
    if (!p.placed || p.dead || p.sceneIdx !== body.site.sceneIdx) continue;
    if (room.state.tick < p.busyUntilTick) continue;
    const d = Math.hypot(p.x - body.x, p.y - body.y);
    if (d > reach || (best !== null && d >= best.d)) continue;
    if (segmentBlocked(grid, body.x, body.y, p.x, p.y)) continue;
    best = { seat, d };
  }
  return best?.seat ?? null;
}

/** A roam goal: the next loop point (pulled inside the leash), or a random walkable point inside it. */
function roamGoal(room: PartyRoom, body: MobBody): { x: number; y: number } {
  const home = { x: body.homeX, y: body.homeY };
  if (body.mind.homing) return home;
  const scene = scenes[body.site.scene];
  const loop = scene.paths.find((q) => q.id === body.site.spawner.pathId)?.points;
  if (loop && loop.length > 0) {
    const point = loop[body.waypoint % loop.length] as { x: number; y: number };
    return clampToLeash(body, tileCentre(point.x, TILE_PX), tileCentre(point.y, TILE_PX));
  }
  const rng = rngOf(room, body);
  const grid = navGrid(body.site.scene, simOf(room).profile);
  for (let i = 0; i < ROAM_TRIES; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * body.leashPx;
    const x = body.homeX + Math.cos(a) * r;
    const y = body.homeY + Math.sin(a) * r;
    if (!grid.solidAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX))) return { x, y };
  }
  return home;
}

function stepBody(room: PartyRoom, body: MobBody, part: DayPart): void {
  const tick = room.state.tick;
  const sim = simOf(room);
  const mind = body.mind;
  const flame = nearestFlame(room, body, part);
  const before = mind.state;
  const atGoal =
    mind.state === MobState.roam &&
    (body.goal === null || Math.hypot(body.goal.x - body.x, body.goal.y - body.y) <= GOAL_PX);
  const chaseTicks = Math.round(balance.mobs.chaseS * TICK_RATE);
  const pause = () => {
    const w = balance.npc.wander;
    return npcDelayTicks(rngOf(room, body), w.stepMinS, w.stepMaxS, TICK_RATE);
  };
  think(mind, { light: flame !== null, prey: sensePrey(room, body), atGoal }, tick, chaseTicks, pause);
  if (before === MobState.roam && mind.state === MobState.idle) body.waypoint++;

  // Where it goes this tick.
  const reachPx = balance.doors.reachTiles * TILE_PX;
  const prey = mind.prey === null ? undefined : sim.players.get(mind.prey);
  let goal: { x: number; y: number } | null = null;
  let stopPx = 0;
  if (mind.state === MobState.chase && prey) {
    goal = clampToLeash(body, prey.x, prey.y);
    stopPx = reachPx * 0.8;
  } else if (mind.state === MobState.flee && flame) {
    const dx = body.x - flame.x;
    const dy = body.y - flame.y;
    const d = Math.hypot(dx, dy) || 1;
    const away = body.def.fleeLightTiles * TILE_PX;
    goal = clampToLeash(body, flame.x + (dx / d) * away, flame.y + (dy / d) * away);
  } else if (mind.state === MobState.roam) {
    if (before !== MobState.roam || body.goal === null) body.goal = roamGoal(room, body);
    goal = body.goal;
  }
  if (mind.state !== MobState.roam) body.goal = null;
  body.moving = goal !== null && walk(room, body, goal, stopPx);

  // The attack: in reach and in sight for the creature's attack time.
  if (mind.state === MobState.chase && prey && mind.prey !== null) {
    const grid = navGrid(body.site.scene, sim.profile);
    const inReach =
      Math.hypot(prey.x - body.x, prey.y - body.y) <= reachPx &&
      !segmentBlocked(grid, body.x, body.y, prey.x, prey.y);
    if (!inReach) body.reachSinceTick = -1;
    else if (body.reachSinceTick < 0) body.reachSinceTick = tick;
    else if (tick - body.reachSinceTick >= Math.round(body.def.attackS * TICK_RATE)) {
      body.reachSinceTick = tick;
      body.swingUntilTick = tick + SWING_TICKS;
      body.yaw = Math.atan2(prey.x - body.x, -(prey.y - body.y));
      hurtByCreature(room, mind.prey, body.def); // round 8, 8A: the bite carries its row (GDD 3.22)
    }
  } else body.reachSinceTick = -1;
}

/**
 * One tick of walking toward `goal` along a tile path whose tiles all lie inside the leash; returns whether it
 * moved. Every point it aims at is inside the leash circle, so the straight step between two of them is too.
 */
function walk(room: PartyRoom, body: MobBody, goal: { x: number; y: number }, stopPx: number): boolean {
  const d = Math.hypot(goal.x - body.x, goal.y - body.y);
  if (d <= Math.max(stopPx, 1)) return false;
  const tick = room.state.tick;
  const grid = navGrid(body.site.scene, simOf(room).profile);
  const here = { x: Math.floor(body.x / TILE_PX), y: Math.floor(body.y / TILE_PX) };
  const gx = Math.floor(goal.x / TILE_PX);
  const gy = Math.floor(goal.y / TILE_PX);
  const key = `${gx}:${gy}`;
  let plan = body.path;
  const onPlan = plan?.tiles.some((t) => t.x === here.x && t.y === here.y) ?? false;
  if (!plan || plan.key !== key || !onPlan || tick - plan.bornTick >= REPLAN_TICKS) {
    const blocked = (x: number, y: number): boolean =>
      grid.solidAt(x, y) || !inLeash(body, tileCentre(x, TILE_PX), tileCentre(y, TILE_PX));
    const near = (x: number, y: number): boolean =>
      !blocked(x, y) && Math.abs(x - gx) <= 1 && Math.abs(y - gy) <= 1;
    const tiles = tilePath(grid.w, grid.h, blocked, here, near);
    plan = tiles ? { key, bornTick: tick, tiles } : null;
    body.path = plan;
  }
  if (!plan) {
    body.goal = null; // unreachable: a roam takes it as reached and picks again
    return false;
  }
  const at = Math.max(
    0,
    plan.tiles.findIndex((t) => t.x === here.x && t.y === here.y),
  );
  const next = plan.tiles[at + 1];
  // Past the last tile it closes on the goal itself, unless the goal stands in a wall or the straight line to it cuts
  // a wall's corner: it would step into that wall, be routed back to the last tile and pace between the two for good.
  if (!next && (grid.solidAt(gx, gy) || segmentBlocked(grid, body.x, body.y, goal.x, goal.y))) {
    if (goal === body.goal) body.goal = null; // a roam takes it as reached and picks again
    return false;
  }
  const aim = next ? { x: tileCentre(next.x, TILE_PX), y: tileCentre(next.y, TILE_PX) } : goal;
  const dx = aim.x - body.x;
  const dy = aim.y - body.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return false;
  const step = Math.min(len, (body.def.speedTilesPerS * TILE_PX) / TICK_RATE);
  const nx = body.x + (dx / len) * step;
  const ny = body.y + (dy / len) * step;
  if (!inLeash(body, nx, ny)) return false;
  body.x = nx;
  body.y = ny;
  body.yaw = Math.atan2(dx, -dy);
  return true;
}

/** Copies the body onto its `Mob`; unchanged values cost no bytes. */
function publish(room: PartyRoom, body: MobBody): void {
  const mob = room.state.scenes.get(body.site.scene)?.mobs.get(body.id);
  if (!mob) return;
  const x = Math.round(body.x);
  const y = Math.round(body.y);
  const animId =
    room.state.tick < body.swingUntilTick ? AnimId.swing : body.moving ? AnimId.walk : AnimId.idle;
  if (mob.x !== x) mob.x = x;
  if (mob.y !== y) mob.y = y;
  if (mob.yaw !== body.yaw) mob.yaw = body.yaw;
  if (mob.animId !== animId) mob.animId = animId;
  if (mob.state !== body.mind.state) mob.state = body.mind.state;
}
