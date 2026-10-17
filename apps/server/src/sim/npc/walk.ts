import { SCENE_IDS, balance, scenes, type Portal, type SceneId } from '@wdi/content';
import { HEADINGS, TICK_RATE, TILE_PX, npcDelayTicks, tilePath } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { PORTAL_REACH_TILES } from '../constants';
import { queuePortal } from '../PortalQueue';
import { type PlayerSim, simOf } from '../RoomSim';
import { isLoft, navGrid, profileOpen, sceneKey, tileCentre } from '../World';
import type { Brain, NpcMemory } from './memory';

/** A path goal tile counts as arrived a little inside the reach, so a rounding step never refuses the act. */
const GOAL_SLACK = 0.8;
/** How long a path is followed before it is rebuilt from where the NPC actually stands. */
const REPLAN_TICKS = TICK_RATE;

/** Writes this tick's input (the NPC never sprints or sneaks, GDD 3.12). */
export function drive(room: PartyRoom, p: PlayerSim, brain: Brain, dx: number, dy: number): void {
  p.input = { seq: ++brain.seq, dx, dy, sprint: false, sneak: false, tick: room.state.tick };
}

/** Stands still: `applyInputs` zeroes the velocity of a seat with no input. */
export function stand(p: PlayerSim): void {
  p.input = null;
}

const unit = (dx: number, dy: number): { dx: number; dy: number } => {
  const d = Math.hypot(dx, dy);
  return d > 1e-6 ? { dx: dx / d, dy: dy / d } : { dx: 0, dy: 0 };
};

/** Portals of the seat's scene a crossing would succeed through (open at this party size, not locked). */
export function openPortals(room: PartyRoom, p: PlayerSim): readonly Portal[] {
  const profile = simOf(room).profile;
  return scenes[sceneKey(p.sceneIdx)].portals.filter(
    (q) => q.to !== null && q.toSpawn !== null && q.lock === null && profileOpen(q.minProfile, profile),
  );
}

const portalCentre = (q: Portal) => ({ x: tileCentre(q.x, TILE_PX), y: tileCentre(q.y, TILE_PX) });

/** The portal in reach of the seat, if any. */
export function portalInReach(p: PlayerSim, portals: readonly Portal[]): Portal | undefined {
  return portals.find((q) => {
    const c = portalCentre(q);
    return Math.hypot(p.x - c.x, p.y - c.y) <= PORTAL_REACH_TILES * TILE_PX;
  });
}

/**
 * The port of `tools/bots/walk.ts`: a new heading every `npc.wander.stepMinS..stepMaxS`, aimed at the
 * nearest portal with chance `portalSteerChance` (and then, in reach, taken with chance `portalChance`).
 * A heading aimed at a portal follows the tile path to it, so a wall between never pins the seat.
 */
export function wander(room: PartyRoom, mem: NpcMemory, brain: Brain, p: PlayerSim, id: string): void {
  const tick = room.state.tick;
  const w = balance.npc.wander;
  const portals = openPortals(room, p);
  if (tick >= brain.nextHeadingTick) {
    brain.nextHeadingTick = tick + npcDelayTicks(mem.rng, w.stepMinS, w.stepMaxS, TICK_RATE);
    brain.heading = HEADINGS[Math.floor(mem.rng() * HEADINGS.length)] as (typeof HEADINGS)[number];
    brain.steerPortal = '';
    if (mem.rng() < w.portalSteerChance) {
      let best = Infinity;
      for (const q of portals) {
        const c = portalCentre(q);
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < best && d > 1) {
          best = d;
          brain.steerPortal = q.id;
        }
      }
    }
    const door = portalInReach(p, portals);
    if (door && mem.rng() < w.portalChance) {
      queuePortal(room, id, { portalId: door.id });
      brain.steerPortal = '';
    }
  }
  const aimed = portals.find((q) => q.id === brain.steerPortal);
  if (aimed) {
    const c = portalCentre(aimed);
    const result = walkTo(room, brain, p, c.x, c.y, PORTAL_REACH_TILES * TILE_PX);
    if (result === 'walking') return;
    // Arrived: the portal in reach is taken with chance `portalChance`; otherwise a fresh heading follows.
    if (result === 'arrived' && mem.rng() < w.portalChance) queuePortal(room, id, { portalId: aimed.id });
    brain.steerPortal = '';
    brain.nextHeadingTick = tick;
  }
  drive(room, p, brain, brain.heading.dx, brain.heading.dy);
}

export type WalkResult = 'arrived' | 'walking' | 'stuck';

/**
 * Walks the seat to within `reachPx` of a point of its own scene along a tile path (the sim collides it
 * like a human). Writes the input; returns `arrived` (input cleared) or `stuck` when no path exists.
 */
export function walkTo(
  room: PartyRoom,
  brain: Brain,
  p: PlayerSim,
  tx: number,
  ty: number,
  reachPx: number,
): WalkResult {
  if (Math.hypot(p.x - tx, p.y - ty) <= reachPx * GOAL_SLACK) {
    stand(p);
    return 'arrived';
  }
  const tick = room.state.tick;
  const grid = navGrid(sceneKey(p.sceneIdx), simOf(room).profile);
  const key = `${p.sceneIdx}:${Math.round(tx)}:${Math.round(ty)}`;
  const here = { x: Math.floor(p.x / TILE_PX), y: Math.floor(p.y / TILE_PX) };
  let plan = brain.path;
  const onPlan = plan?.tiles.some((t) => t.x === here.x && t.y === here.y) ?? false;
  if (!plan || plan.key !== key || !onPlan || tick - plan.bornTick >= REPLAN_TICKS) {
    const tiles = tilePath(
      grid.w,
      grid.h,
      (x, y) => grid.solidAt(x, y),
      here,
      (x, y) =>
        !grid.solidAt(x, y) &&
        Math.hypot(tileCentre(x, TILE_PX) - tx, tileCentre(y, TILE_PX) - ty) <= reachPx * GOAL_SLACK,
    );
    plan = tiles ? { key, scene: p.sceneIdx, bornTick: tick, tiles } : null;
    brain.path = plan;
  }
  if (!plan) {
    stand(p);
    return 'stuck';
  }
  let at = plan.tiles.findIndex((t) => t.x === here.x && t.y === here.y);
  if (at < 0) at = 0;
  const next = plan.tiles[at + 1];
  const aim = next ? { x: tileCentre(next.x, TILE_PX), y: tileCentre(next.y, TILE_PX) } : { x: tx, y: ty };
  const v = unit(aim.x - p.x, aim.y - p.y);
  drive(room, p, brain, v.dx, v.dy);
  return 'walking';
}

/** Walks to a portal of the seat's scene and, in reach, queues the crossing. */
export function walkThrough(
  room: PartyRoom,
  brain: Brain,
  p: PlayerSim,
  id: string,
  portal: Portal,
): WalkResult {
  const c = portalCentre(portal);
  const result = walkTo(room, brain, p, c.x, c.y, PORTAL_REACH_TILES * TILE_PX);
  if (result === 'arrived') {
    queuePortal(room, id, { portalId: portal.id });
    brain.path = null;
  }
  return result;
}

/** The first portal on a shortest route from `from` to any scene `goal` accepts; null when already there. */
export function firstPortalToward(
  from: SceneId,
  profile: ReturnType<typeof simOf>['profile'],
  goal: (scene: SceneId) => boolean,
): Portal | null {
  if (goal(from)) return null;
  const seen = new Set<SceneId>([from]);
  const queue: { scene: SceneId; first: Portal }[] = [];
  const expand = (scene: SceneId, first: Portal | null): Portal | null => {
    for (const q of scenes[scene].portals) {
      if (q.to === null || q.toSpawn === null || q.lock !== null || !profileOpen(q.minProfile, profile))
        continue;
      const to = q.to as SceneId;
      if (seen.has(to) || !SCENE_IDS.includes(to)) continue;
      seen.add(to);
      if (goal(to)) return first ?? q;
      queue.push({ scene: to, first: first ?? q });
    }
    return null;
  };
  const direct = expand(from, null);
  if (direct) return direct;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head] as (typeof queue)[number];
    const hit = expand(cur.scene, cur.first);
    if (hit) return hit;
  }
  return null;
}

export const inLoft = (p: PlayerSim): boolean => isLoft(p.sceneIdx);
