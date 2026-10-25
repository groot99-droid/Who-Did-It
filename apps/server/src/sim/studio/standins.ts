import {
  type DayPart,
  type MobDef,
  type RoutinesFile,
  type Scene,
  balance,
  mobs,
  routines,
} from '@wdi/content';
import {
  type Rng,
  type StudioDayPhase,
  type StudioSpawn,
  type StudioSpawnKind,
  type StudioStandInState,
  TICK_RATE,
  TILE_PX,
  mulberry32,
  npcDelayTicks,
  segmentBlocked,
  tilePath,
} from '@wdi/shared';
import { type MobMind, MobState, newMind, think } from '../mobs/ai';
import { burningLights } from '../mobs/light';
import { navGrid, tileCentre } from '../World';

/**
 * The stand-ins' brains (round 9, S4; docs/round9/admin-studio.md 2). A mob runs the creature FSM of `mobs/ai.ts`
 * with the admin figure as its only prey: it idles, roams inside a leash round the tile it was placed on, chases the
 * figure it senses and sees, and flees the scene's flames by the Studio's time of day. It never bites: the admin
 * figure has no health. A townsfolk figure walks its kind's stations of the scene in route order and works at each
 * for `townsfolk.stationDwellS`; a fixed one (a stallholder), and a look, stands. Every draw is from the stand-in's
 * own stream, seeded by its id, so a Studio replay is the same; nothing here is a `party` room's.
 */

/** A mob stand-in's leash, as a spawner's `leashTiles` (tooling, not a game number). */
export const STANDIN_LEASH_TILES = 6;
/** A roam goal counts as reached within this distance; a path is rebuilt at least this often (as `Mobs.ts`). */
const GOAL_PX = TILE_PX / 4;
const REPLAN_TICKS = TICK_RATE;
const ROAM_TRIES = 4;

type Grid = ReturnType<typeof navGrid>;
type Point = { x: number; y: number };

/** A stand-in in room memory: the wire row and its brain. */
export interface StandIn {
  id: string;
  kind: StudioSpawnKind;
  ref: string;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  yaw: number;
  moving: boolean;
  state: StudioStandInState;
  rng: Rng;
  goal: Point | null;
  path: { key: string; bornTick: number; tiles: Point[] } | null;
  /** A mob's FSM and row. */
  mind: MobMind | null;
  def: MobDef | null;
  /** A townsfolk figure's stations (tile centres, route order), the next one, and the end of its work there. */
  stations: Point[];
  station: number;
  workUntilTick: number;
}

/** What a stand-in senses of the Studio this tick. */
export interface StandInWorld {
  tick: number;
  /** The scene the stand-ins stand in: the committed one, or the Studio's draft of it. */
  scene: Scene;
  grid: Grid;
  phase: StudioDayPhase;
  /** The admin figure's feet. */
  admin: Point;
}

/** A stream per stand-in from its id (FNV-1a), so the same placements replay the same. */
function rngFor(id: string): Rng {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return mulberry32(h >>> 0);
}

/**
 * A townsfolk kind's stations in the scene: its prop kinds in route order, or any station prop when it lists none.
 * `table` is the committed routines, or the Studio's NPC draft of them (admin-studio.md 8).
 */
export function stationsOf(scene: Scene, ref: string, table: RoutinesFile = routines): Point[] {
  const row = table.townsfolk[ref];
  if (!row || row.fixed) return [];
  const props = scene.props;
  const picked =
    row.stations.length > 0
      ? row.stations.flatMap((kind) => props.filter((p) => p.kind === kind))
      : props.filter((p) => !table.ignore.includes(p.kind));
  return picked.map((p) => ({ x: tileCentre(p.x, TILE_PX), y: tileCentre(p.y, TILE_PX) }));
}

export function newStandIn(
  id: string,
  kind: StudioSpawnKind,
  ref: string,
  scene: Scene,
  tx: number,
  ty: number,
  table: RoutinesFile = routines,
) {
  const x = tileCentre(tx, TILE_PX);
  const y = tileCentre(ty, TILE_PX);
  const def = kind === 'mob' ? (mobs.mobs[ref] ?? null) : null;
  const b: StandIn = {
    id,
    kind,
    ref,
    x,
    y,
    homeX: x,
    homeY: y,
    yaw: 0,
    moving: false,
    state: kind === 'mob' ? 'idle' : 'stand',
    rng: rngFor(id),
    goal: null,
    path: null,
    mind: def ? newMind() : null,
    def,
    stations: kind === 'townsfolk' ? stationsOf(scene, ref, table) : [],
    station: 0,
    workUntilTick: 0,
  };
  return b;
}

/** The wire row; `look` is the look it wears (`lookOfStandIn`), absent for a mob. */
export const standInRow = (b: StandIn, look?: string): StudioSpawn => ({
  id: b.id,
  kind: b.kind,
  ref: b.ref,
  x: Math.floor(b.x / TILE_PX),
  y: Math.floor(b.y / TILE_PX),
  px: Math.round(b.x),
  py: Math.round(b.y),
  yaw: b.yaw,
  moving: b.moving,
  state: b.state,
  ...(look !== undefined ? { look } : {}),
});

/** The Studio's time of day as a light's part of the day (dawn burns as dusk, as `mobs/spawn.ts` `dayPartOf`). */
const partOf = (phase: StudioDayPhase): DayPart => (phase === 'dawn' ? 'dusk' : phase);

const leashed = (b: StandIn, x: number, y: number): boolean =>
  b.mind === null || Math.hypot(x - b.homeX, y - b.homeY) <= STANDIN_LEASH_TILES * TILE_PX;

function clampToLeash(b: StandIn, p: Point): Point {
  const leash = STANDIN_LEASH_TILES * TILE_PX;
  const d = Math.hypot(p.x - b.homeX, p.y - b.homeY);
  if (d <= leash) return p;
  return { x: b.homeX + ((p.x - b.homeX) * leash) / d, y: b.homeY + ((p.y - b.homeY) * leash) / d };
}

/**
 * One tick toward `goal` along a tile path (inside the leash, for a mob) at `speedPx` a tick; stops within `stopPx`.
 * A stand-in is never collided: it is not a seat, as a townsfolk figure is not.
 */
function walkTo(b: StandIn, grid: Grid, tick: number, goal: Point, speedPx: number, stopPx: number) {
  if (Math.hypot(goal.x - b.x, goal.y - b.y) <= Math.max(stopPx, 1)) return 'arrived';
  const here = { x: Math.floor(b.x / TILE_PX), y: Math.floor(b.y / TILE_PX) };
  const gx = Math.floor(goal.x / TILE_PX);
  const gy = Math.floor(goal.y / TILE_PX);
  const key = `${gx}:${gy}`;
  let at = b.path?.tiles.findIndex((t) => t.x === here.x && t.y === here.y) ?? -1;
  if (!b.path || b.path.key !== key || at < 0 || tick - b.path.bornTick >= REPLAN_TICKS) {
    const blocked = (x: number, y: number) =>
      grid.solidAt(x, y) || !leashed(b, tileCentre(x, TILE_PX), tileCentre(y, TILE_PX));
    const tiles = tilePath(
      grid.w,
      grid.h,
      blocked,
      here,
      (x, y) => !blocked(x, y) && Math.abs(x - gx) <= 1 && Math.abs(y - gy) <= 1,
    );
    b.path = tiles ? { key, bornTick: tick, tiles } : null;
    at = 0;
  }
  if (!b.path) return 'stuck';
  const next = b.path.tiles[at + 1];
  let aim = next ? { x: tileCentre(next.x, TILE_PX), y: tileCentre(next.y, TILE_PX) } : goal;
  // A goal in a wall (a station prop) or behind a corner: the walk ends at the centre of the last open tile.
  if (!next && (grid.solidAt(gx, gy) || segmentBlocked(grid, b.x, b.y, goal.x, goal.y))) {
    aim = { x: tileCentre(here.x, TILE_PX), y: tileCentre(here.y, TILE_PX) };
    if (Math.hypot(aim.x - b.x, aim.y - b.y) < 1) return 'arrived';
  }
  const dx = aim.x - b.x;
  const dy = aim.y - b.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return 'arrived';
  const step = Math.min(len, speedPx);
  b.x += (dx / len) * step;
  b.y += (dy / len) * step;
  b.yaw = Math.atan2(dx, -dy);
  b.moving = true;
  return 'walking';
}

/** A roam goal: home after a chase or a flight, else a random open point inside the leash. */
function roamGoal(b: StandIn, grid: Grid): Point {
  if (b.mind!.homing) return { x: b.homeX, y: b.homeY };
  for (let i = 0; i < ROAM_TRIES; i++) {
    const a = b.rng() * Math.PI * 2;
    const r = Math.sqrt(b.rng()) * STANDIN_LEASH_TILES * TILE_PX;
    const x = b.homeX + Math.cos(a) * r;
    const y = b.homeY + Math.sin(a) * r;
    if (!grid.solidAt(Math.floor(x / TILE_PX), Math.floor(y / TILE_PX))) return { x, y };
  }
  return { x: b.homeX, y: b.homeY };
}

const MOB_WIRE: Record<number, StudioStandInState> = {
  [MobState.idle]: 'idle',
  [MobState.roam]: 'walk',
  [MobState.chase]: 'chase',
  [MobState.flee]: 'flee',
  [MobState.dead]: 'idle',
};

function stepMob(b: StandIn, w: StandInWorld): void {
  const def = b.def!;
  const mind = b.mind!;
  let flame: Point | null = null;
  let best = def.fleeLightTiles * TILE_PX;
  for (const l of burningLights(w.scene, partOf(w.phase), TILE_PX, true)) {
    const d = Math.hypot(l.x - b.x, l.y - b.y);
    if (d <= best) [flame, best] = [l, d];
  }
  const d = Math.hypot(w.admin.x - b.x, w.admin.y - b.y);
  const sees = d <= def.senseTiles * TILE_PX && !segmentBlocked(w.grid, b.x, b.y, w.admin.x, w.admin.y);
  const before = mind.state;
  const atGoal =
    mind.state === MobState.roam &&
    (b.goal === null || Math.hypot(b.goal.x - b.x, b.goal.y - b.y) <= GOAL_PX);
  const wander = balance.npc.wander;
  think(
    mind,
    { light: flame !== null, prey: sees ? 'admin' : null, atGoal },
    w.tick,
    Math.round(balance.mobs.chaseS * TICK_RATE),
    () => npcDelayTicks(b.rng, wander.stepMinS, wander.stepMaxS, TICK_RATE),
  );
  let goal: Point | null = null;
  let stopPx = 0;
  if (mind.state === MobState.chase) {
    goal = clampToLeash(b, w.admin);
    stopPx = balance.doors.reachTiles * TILE_PX * 0.8;
  } else if (mind.state === MobState.flee && flame) {
    const f: Point = flame;
    const away = def.fleeLightTiles * TILE_PX;
    const dd = Math.hypot(b.x - f.x, b.y - f.y) || 1;
    goal = clampToLeash(b, { x: f.x + ((b.x - f.x) / dd) * away, y: f.y + ((b.y - f.y) / dd) * away });
  } else if (mind.state === MobState.roam) {
    if (before !== MobState.roam || b.goal === null) b.goal = roamGoal(b, w.grid);
    goal = b.goal;
  }
  if (mind.state !== MobState.roam) b.goal = null;
  if (goal !== null) {
    const r = walkTo(b, w.grid, w.tick, goal, (def.speedTilesPerS * TILE_PX) / TICK_RATE, stopPx);
    if (r !== 'walking' && mind.state === MobState.roam) b.goal = null; // reached or unreachable: pick again
  }
  b.state = MOB_WIRE[mind.state]!;
}

function stepFolk(b: StandIn, w: StandInWorld): void {
  if (b.stations.length === 0) return;
  if (w.tick < b.workUntilTick) {
    b.state = 'work';
    return;
  }
  const goal = b.stations[b.station % b.stations.length]!;
  const speed = (balance.townsfolk.walkTilesPerS * TILE_PX) / TICK_RATE;
  const r = walkTo(b, w.grid, w.tick, goal, speed, GOAL_PX);
  if (r === 'walking') {
    b.state = 'walk';
    return;
  }
  b.station++;
  if (r === 'arrived') {
    const dwell = balance.townsfolk.stationDwellS;
    b.workUntilTick = w.tick + npcDelayTicks(b.rng, dwell.min, dwell.max, TICK_RATE);
    b.state = 'work';
  }
}

/** One tick of every stand-in of the admin figure's scene; the stand-ins of other scenes wait where they are. */
export function stepStandIns(list: readonly StandIn[], w: StandInWorld): void {
  for (const b of list) {
    b.moving = false;
    if (b.kind === 'mob' && b.mind !== null) stepMob(b, w);
    else if (b.kind === 'townsfolk') stepFolk(b, w);
  }
}
