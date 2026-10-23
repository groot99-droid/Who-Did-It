import { balance, resources, scenes } from '@wdi/content';
import type { Resource, SceneId } from '@wdi/content';
import { ErrorCode, Node, Phase, TICK_RATE, TILE_PX, type PlayerState, type Rng } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { mapScenesOf } from './MapSites';
import { addStack, canAdd, count } from './Inventory';
import { isVerbPhase, profileOpen, reject, sceneKey, tileCentre } from './World';
import { type PlayerSim, simOf } from './RoomSim';
import type { MatchSeeds } from './seeds';

/**
 * Resource nodes and gathering (round 6, M5b, GDD 3.14; docs/round6/m5b-data.md 2.1): the node pool per match from
 * `seeds.get('nodes')`, the respawn timers and the `gather` hold. Room memory, never on the wire beyond
 * `SceneState.nodes`; nothing secret shares this stream, which only picks which spots of a forest bear.
 */

/** A wire `Node` instance; `Node` alone is the DOM type wherever the DOM lib is on (tools/auto). */
type NodeState = InstanceType<typeof Node>;

interface Spot {
  sceneId: SceneId;
  id: string;
  node: NodeState;
}

interface NodeMemory {
  /** The match this pool was drawn for; a new `MatchSeeds` (every Start) draws a new pool. */
  seeds: MatchSeeds;
  spots: Map<string, Spot>;
}

const MEMORY = new WeakMap<PartyRoom, NodeMemory>();

/** Fisher-Yates over a copy, so the pool's content order stays the input of the draw. */
function shuffled<T>(list: readonly T[], rng: Rng): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** How many of a pool's `n` spots are active: `poolActiveFrac` of them, rounded up so a pool is never empty. */
export const activeInPool = (n: number): number =>
  Math.min(n, Math.max(1, Math.ceil(n * balance.resources.poolActiveFrac)));

interface Candidate {
  sceneId: SceneId;
  id: string;
  resource: string;
  x: number;
  y: number;
}

/** Draws the match's nodes: pooled spots activate in part, unpooled ones always; the rest never appear. */
function drawPool(room: PartyRoom): NodeMemory {
  const mem: NodeMemory = { seeds: room.seeds, spots: new Map() };
  const rng = room.seeds.get('nodes');
  const profile = simOf(room).profile;
  const pools = new Map<string, Candidate[]>();
  const chosen: Candidate[] = [];
  for (const sceneId of mapScenesOf(room)) {
    const scene = scenes[sceneId];
    if (!profileOpen(scene.profile, profile)) continue;
    for (const spot of scene.nodes ?? []) {
      const c: Candidate = { sceneId, id: spot.id, resource: spot.resource, x: spot.x, y: spot.y };
      if (spot.pool === undefined) chosen.push(c);
      else pools.set(spot.pool, [...(pools.get(spot.pool) ?? []), c]);
    }
  }
  // Pools draw in id order so the stream is consumed the same way whatever order the scenes list them in.
  for (const pool of [...pools.keys()].sort()) {
    const list = pools.get(pool) ?? [];
    chosen.push(...shuffled(list, rng).slice(0, activeInPool(list.length)));
  }
  for (const c of chosen) {
    const node = new Node();
    node.id = c.id;
    node.resource = c.resource;
    node.x = Math.round(tileCentre(c.x, TILE_PX));
    node.y = Math.round(tileCentre(c.y, TILE_PX));
    node.active = true;
    node.respawnTick = 0;
    room.state.scenes.get(c.sceneId)?.nodes.set(c.id, node);
    mem.spots.set(c.id, { sceneId: c.sceneId, id: c.id, node });
  }
  return mem;
}

/** Empties every scene's nodes; the lobby and a new draw start from nothing. */
function clearNodes(room: PartyRoom): void {
  room.state.scenes.forEach((scene) => scene.nodes.clear());
  MEMORY.delete(room);
}

/** Whether a main-mode match is on and placed: from grace to the final night. */
function matchOn(room: PartyRoom): boolean {
  const { phase } = room.state;
  return phase >= Phase.grace && phase <= Phase.finalNight && simOf(room).profileFixed;
}

/** The room's node memory, drawn on the first placed tick of a match; null in the lobby. */
function memoryOf(room: PartyRoom): NodeMemory | null {
  const mem = MEMORY.get(room);
  if (!matchOn(room)) {
    const { phase } = room.state;
    if (mem && (phase === Phase.lobby || phase === Phase.roleReveal)) clearNodes(room);
    return mem ?? null; // game over keeps the last nodes in view; the lobby has cleared them
  }
  if (mem && mem.seeds === room.seeds) return mem;
  clearNodes(room);
  const fresh = drawPool(room);
  MEMORY.set(room, fresh);
  return fresh;
}

/** Step stage after `runDecay` (locked call site in `sim/Step.ts`): draws the pool once, then ticks the respawns. */
export function runResources(room: PartyRoom): void {
  const mem = memoryOf(room);
  if (!mem) return;
  const tick = room.state.tick;
  for (const { node } of mem.spots.values()) {
    if (!node.active && tick >= node.respawnTick) {
      node.active = true;
      node.respawnTick = 0;
    }
  }
}

/** Ticks a resource takes to respawn after a gather. */
export const respawnTicks = (resourceId: string): number =>
  Math.round((resources.resources[resourceId]?.respawnS ?? 0) * TICK_RATE);

function nodeFor(room: PartyRoom, p: PlayerSim, nodeId: string): NodeState | undefined {
  return room.state.scenes.get(sceneKey(p.sceneIdx))?.nodes.get(nodeId);
}

/** Why a gather hold cannot run this tick, or null (also the check that starts it). */
function gatherProblem(
  room: PartyRoom,
  player: PlayerState,
  p: PlayerSim,
  nodeId: string,
): { code: ErrorCode; msg: string } | null {
  if (!isVerbPhase(room.state.phase)) return { code: ErrorCode.wrongPhase, msg: 'not now' };
  if (p.dead || !p.placed) return { code: ErrorCode.cannot, msg: 'not now' };
  if (room.state.tick < p.busyUntilTick) return { code: ErrorCode.busy, msg: 'busy' };
  const node = nodeFor(room, p, nodeId);
  const resource = node ? resources.resources[node.resource] : undefined;
  if (!node || !resource) return { code: ErrorCode.cannot, msg: 'nothing there' };
  if (!node.active) return { code: ErrorCode.cannot, msg: 'nothing left' };
  if (Math.hypot(p.x - node.x, p.y - node.y) > balance.doors.reachTiles * TILE_PX) {
    return { code: ErrorCode.outOfRange, msg: 'too far' };
  }
  if (resource.tool !== undefined && count(player, resource.tool) === 0) {
    return { code: ErrorCode.cannot, msg: 'needs a tool' };
  }
  if (!canAdd(player, resource.id, resource.yield)) return { code: ErrorCode.cannot, msg: 'no room' };
  return null;
}

/** `act.hold {action: 'gather', targetId}` (locked call site in `sim/Hold.ts`): starts the hold if it can run. */
export function handleGather(room: PartyRoom, sessionId: string, nodeId: string): void {
  const player = room.state.players.get(sessionId);
  const p = simOf(room).players.get(sessionId);
  if (!player || !p) return;
  const problem = gatherProblem(room, player, p, nodeId);
  if (problem) {
    reject(room, sessionId, problem.code, problem.msg);
    return;
  }
  // Pressing again on the same node keeps the original start; another target restarts.
  if (p.hold?.action === 'gather' && p.hold.targetId === nodeId) return;
  p.hold = { action: 'gather', targetId: nodeId, startTick: room.state.tick };
}

/**
 * One tick of a gather hold (called by `runHolds`): moving, a crossing, a phase change, a node another seat emptied or
 * a full inventory cancel it and yield nothing; at the end of the cast the yield goes in and the node empties.
 */
export function tickGather(room: PartyRoom, sessionId: string, p: PlayerSim): void {
  const hold = p.hold;
  const player = room.state.players.get(sessionId);
  if (!hold || !player) return;
  if (gatherProblem(room, player, p, hold.targetId) || p.vx !== 0 || p.vy !== 0) {
    p.hold = null;
    return;
  }
  const node = nodeFor(room, p, hold.targetId) as NodeState;
  const resource = resources.resources[node.resource] as Resource;
  if (room.state.tick - hold.startTick < Math.round(resource.gatherS * TICK_RATE)) return;
  p.hold = null;
  addStack(player, resource.id, resource.yield); // `gatherProblem` just proved it fits
  node.active = false;
  node.respawnTick = room.state.tick + respawnTicks(resource.id);
}
