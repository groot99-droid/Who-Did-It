import { type Portal, type SceneId, balance, scenes } from '@wdi/content';
import { DIRECTIONS, Phase, TICK_RATE, TILE_PX, tilePath } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { PORTAL_REACH_TILES } from '../constants';
import { mapScenesOf } from '../MapSites';
import { tickNeeds } from '../npc/needs';
import { type Station, phaseClassOf, spanTicks } from '../npc/routine';
import { firstPortalToward } from '../npc/walk';
import { simOf } from '../RoomSim';
import { isWorldPhase, navGrid, sceneIndex, sceneKey, tileCentre } from '../World';
import {
  type Figure,
  type FigureAct,
  clearTownsfolk,
  figureRng,
  publishFigure,
  rehandleFigure,
  spawnTownsfolk,
  townsfolkMemory,
} from './figures';
import './invariants';

/**
 * The townsfolk tick (round 8, 8E; the locked `runTownsfolk` line of `sim/Step.ts`, after the NPC brains): each
 * living figure sees the bodies near it, ticks its needs, follows its routine (by day its stations in turn, each
 * worked for `townsfolk.stationDwellS` and followed by an idle with chance `idleChance`; by night its home) along
 * tile paths, crossing portals on the way, and is copied onto its avatar. Outside the world phases the figures hold
 * still where they stand; the lobby clears them.
 */

/** A goal counts as reached within this distance. */
const GOAL_PX = TILE_PX / 4;
/** A path is rebuilt from where the figure stands at least this often. */
const REPLAN_TICKS = TICK_RATE;

export function runTownsfolk(room: PartyRoom): void {
  const phase = room.state.phase;
  const memory = townsfolkMemory(room);
  if (phase === Phase.lobby) {
    if (memory.spawned) clearTownsfolk(room);
    return;
  }
  if (!isWorldPhase(phase) || !simOf(room).profileFixed) return;
  if (!memory.spawned) spawnTownsfolk(room); // a match that skipped the deal's line (an older save) still has them
  for (const f of memory.figures.values()) {
    stepFigure(room, f);
    publishFigure(room, f);
  }
}

/** Bodies within day sight count as seen (Fear, needs.ts), like a seat's `observe`. */
function seeBodies(room: PartyRoom, f: Figure): void {
  const scene = room.state.scenes.get(sceneKey(f.sceneIdx));
  if (!scene) return;
  const sight = balance.vision.dayTiles * TILE_PX;
  scene.bodies.forEach((body) => {
    if (body.hidden || f.brain.seenBodies.has(body.id)) return;
    if (Math.hypot(body.x - f.x, body.y - f.y) <= sight) f.brain.seenBodies.add(body.id);
  });
}

function stepFigure(room: PartyRoom, f: Figure): void {
  const tick = room.state.tick;
  f.moving = false;
  if (tick < f.busyUntilTick) return;
  seeBodies(room, f);
  const here = sceneKey(f.sceneIdx);
  tickNeeds(room, f.brain, {
    id: f.id,
    sceneIdx: f.sceneIdx,
    x: f.x,
    y: f.y,
    home: f.home === here,
    light: false,
  });

  const cls = phaseClassOf(room.state.phase);
  if (cls === 'night') {
    if (f.act?.kind !== 'home') f.act = homeAct(room, f);
  } else if (cls === 'day' && (f.act === null || f.act.kind === 'home' || tick >= f.act.untilTick)) {
    f.act = nextAct(room, f);
  }
  const act = f.act;
  if (!act || act.kind === 'idle') return;

  // Another scene first: the first portal on the way, then through it.
  if (act.goal.scene !== here) {
    const portal = firstPortalToward(
      here,
      simOf(room).profile,
      (s) => s === act.goal.scene,
      mapScenesOf(room),
    );
    if (!portal) {
      f.act = null;
      return;
    }
    const result = walk(
      room,
      f,
      tileCentre(portal.x, TILE_PX),
      tileCentre(portal.y, TILE_PX),
      PORTAL_REACH_TILES * TILE_PX * 0.8,
    );
    if (result === 'arrived') cross(room, f, portal);
    else if (result === 'stuck') f.act = null;
    return;
  }
  const result = walk(room, f, act.goal.x, act.goal.y, GOAL_PX);
  if (result === 'stuck') {
    f.act = null;
    return;
  }
  if (result === 'arrived' && act.kind === 'travel') {
    const t = balance.townsfolk;
    const station = act.station;
    if (station) {
      act.kind = 'work';
      act.untilTick = tick + spanTicks(figureRng(room, f), t.stationDwellS);
      f.yaw = Math.atan2(tileCentre(station.x, TILE_PX) - f.x, -(tileCentre(station.y, TILE_PX) - f.y));
    } else {
      act.kind = 'idle';
      act.untilTick = tick + spanTicks(figureRng(room, f), t.idleS);
    }
  }
}

/** The next station of the route: a fixed figure's one prop, the named loop in order, a villager's favourites. */
function pickStation(room: PartyRoom, f: Figure): Station | null {
  if (f.stations.length === 0) return null;
  if (f.stations.length === 1 || f.row.named || f.row.fixed) {
    const s = f.stations[f.nextStation % f.stations.length] as Station;
    f.nextStation++;
    return s;
  }
  const rng = figureRng(room, f);
  const last = f.act?.station?.propId;
  const pool = f.stations.filter((s) => s.propId !== last);
  const u = rng();
  return pool[Math.min(pool.length - 1, Math.floor(u * pool.length))] ?? null;
}

/** By day: after a station an idle in place with chance `idleChance`, else the walk to the next station. */
function nextAct(room: PartyRoom, f: Figure): FigureAct | null {
  const tick = room.state.tick;
  const t = balance.townsfolk;
  const rng = figureRng(room, f);
  const here = sceneKey(f.sceneIdx);
  const idle = (): FigureAct => ({
    kind: 'idle',
    untilTick: tick + spanTicks(rng, t.idleS),
    station: null,
    goal: { scene: here, x: f.x, y: f.y },
  });
  if (f.act?.kind === 'work' && rng() < t.idleChance) return idle();
  const station = pickStation(room, f);
  if (!station) return idle();
  const stand = station.stands[
    Math.min(station.stands.length - 1, Math.floor(rng() * station.stands.length))
  ] as {
    x: number;
    y: number;
  };
  return {
    kind: 'travel',
    // A walk that takes longer than a seat's longest leg is given up (GDD 3.12 `maxWalkS`).
    untilTick: tick + Math.round(balance.npc.routine.maxWalkS * TICK_RATE),
    station,
    goal: { scene: station.scene, x: tileCentre(stand.x, TILE_PX), y: tileCentre(stand.y, TILE_PX) },
  };
}

/** By night: home, to a prop's stand there if the scene has one, else its first spawn; a figure with no home stays. */
function homeAct(room: PartyRoom, f: Figure): FigureAct | null {
  const home = f.home;
  if (home === null) return null;
  const grid = navGrid(home, simOf(room).profile);
  let at: { x: number; y: number } | null = null;
  for (const prop of scenes[home].props) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (!grid.solidAt(prop.x + dx, prop.y + dy)) at = { x: prop.x + dx, y: prop.y + dy };
      if (at) break;
    }
    if (at) break;
  }
  const spawn = scenes[home].spawns[0];
  at ??= spawn ? { x: spawn.x, y: spawn.y } : null;
  if (!at) return null;
  return {
    kind: 'home',
    untilTick: Number.POSITIVE_INFINITY,
    station: null,
    goal: { scene: home, x: tileCentre(at.x, TILE_PX), y: tileCentre(at.y, TILE_PX) },
  };
}

/** Through a portal: the figure stands on the target spawn at once, still for the door's transit, under a new handle. */
function cross(room: PartyRoom, f: Figure, portal: Portal): void {
  const to = portal.to as SceneId;
  const spawn = scenes[to].spawns.find((s) => s.id === portal.toSpawn);
  if (!spawn) {
    f.act = null;
    return;
  }
  f.sceneIdx = sceneIndex(to);
  f.x = tileCentre(spawn.x, TILE_PX);
  f.y = tileCentre(spawn.y, TILE_PX);
  f.yaw = (Math.max(0, DIRECTIONS.indexOf(spawn.facing)) * Math.PI) / 4;
  f.brain.path = null;
  f.busyUntilTick = room.state.tick + Math.round(balance.doors.transitS * TICK_RATE);
  rehandleFigure(room, f);
}

type WalkResult = 'arrived' | 'walking' | 'stuck';

/**
 * One tick of walking toward a point of the figure's scene along a tile path (the creature walker's rule without
 * the leash): the figure moves `townsfolk.walkTilesPerS` and is never collided, it is not a seat.
 */
function walk(room: PartyRoom, f: Figure, tx: number, ty: number, reachPx: number): WalkResult {
  if (Math.hypot(f.x - tx, f.y - ty) <= reachPx) return 'arrived';
  const tick = room.state.tick;
  const grid = navGrid(sceneKey(f.sceneIdx), simOf(room).profile);
  const here = { x: Math.floor(f.x / TILE_PX), y: Math.floor(f.y / TILE_PX) };
  const key = `${f.sceneIdx}:${Math.round(tx)}:${Math.round(ty)}`;
  let plan = f.brain.path;
  const onPlan = plan?.tiles.some((t) => t.x === here.x && t.y === here.y) ?? false;
  if (!plan || plan.key !== key || !onPlan || tick - plan.bornTick >= REPLAN_TICKS) {
    const tiles = tilePath(
      grid.w,
      grid.h,
      (x, y) => grid.solidAt(x, y),
      here,
      (x, y) =>
        !grid.solidAt(x, y) &&
        Math.hypot(tileCentre(x, TILE_PX) - tx, tileCentre(y, TILE_PX) - ty) <= reachPx,
    );
    plan = tiles ? { key, scene: f.sceneIdx, bornTick: tick, tiles } : null;
    f.brain.path = plan;
  }
  if (!plan) return 'stuck';
  let at = plan.tiles.findIndex((t) => t.x === here.x && t.y === here.y);
  if (at < 0) at = 0;
  const next = plan.tiles[at + 1];
  const aim = next ? { x: tileCentre(next.x, TILE_PX), y: tileCentre(next.y, TILE_PX) } : { x: tx, y: ty };
  const dx = aim.x - f.x;
  const dy = aim.y - f.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return 'arrived';
  const step = Math.min(len, (balance.townsfolk.walkTilesPerS * TILE_PX) / TICK_RATE);
  f.x += (dx / len) * step;
  f.y += (dy / len) * step;
  f.yaw = Math.atan2(dx, -dy);
  f.moving = true;
  return 'walking';
}
