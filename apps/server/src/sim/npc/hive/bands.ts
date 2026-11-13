import { abilities, balance, roles, type SceneId } from '@wdi/content';
import { Phase, S2C, TICK_RATE, TILE_PX, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../../rooms/PartyRoom';
import { runAction } from '../../Actions';
import { emitSim } from '../../events/bus';
import { bellOf, hubOf, mapScenesOf } from '../../MapSites';
import { emitNoise } from '../../Noise';
import { type PlayerSim, simOf } from '../../RoomSim';
import { isVerbPhase, sceneIndex, sceneKey, tileCentre } from '../../World';
import { difficultyRow } from '../difficulty';
import type { Brain, NpcMemory } from '../memory';
import { releaseClaims } from '../routine';
import { GOAL_SLACK, firstPortalToward, stand, walkThrough, walkTo } from '../walk';
import { type Fact, hiveOf } from './board';
import { heardBy, seesFact } from './senses';
import { dueReaction, heldReaction, registerTrigger } from './triggers';
import { clientOf } from '../../seatIds';

/**
 * The body bands (round 8, 8R, A174, A176; GDD 3.12): what an NPC does about a body, a shout and a scream.
 * - **Pull** (`npc.body.pullTiles`): it walks to a body of its scene that it sees, or saw, and did not make.
 * - **Shout** (`npc.body.shoutTiles`): the first NPC that comes this near shouts, once per body. The shout is
 *   role-blind, a noise and a heard fact of `{sceneId, x, y}`; the server then calls the nearest living Detective
 *   and Doctor, each through its own private input: `shout` on a human's own client, the seat's private call for
 *   an NPC. Nothing public says who was called.
 * - **Bell** (`npc.body.bellTiles`): the first NPC inside the band stays and reports after `reportDelayS`, waiting
 *   out a phase where no verb works; every other NPC inside the band of the same unreported body runs for the hub's
 *   bell and rings it, at night too (A174).
 * - A heard kill scream or shot draws the NPC to where it rang, so a body it could only hear is still found.
 */

const STRIKE_MARGIN = 0.9;
const tilesPx = (tiles: number): number => tiles * TILE_PX;
const rangePx = (abilityId: string): number => tilesPx(abilities.abilities[abilityId]?.rangeTiles ?? 0);
const DRAWS = new Set(['scream', 'shot']);

interface BandMemory {
  /** Body id -> the NPC seat that stays to report it. */
  reporter: Map<string, string>;
  /** Body ids already shouted for. */
  shouted: Set<string>;
  /** Seat -> the shout it was privately called to (never on the board). */
  calls: Map<string, Fact>;
  /** Seat -> the body it runs to the bell for. */
  bellRun: Map<string, string>;
  /** `seat|fact ref` of the calls and noises a seat already reached. */
  reached: Set<string>;
}

const memories = new WeakMap<PartyRoom, BandMemory>();
function bandsOf(room: PartyRoom): BandMemory {
  let m = memories.get(room);
  if (!m) {
    m = { reporter: new Map(), shouted: new Set(), calls: new Map(), bellRun: new Map(), reached: new Set() };
    memories.set(room, m);
  }
  return m;
}

/** The body the seat runs the bell for, else the nearest unreported body of its scene in the pull band it sees or saw. */
function bodyFor(room: PartyRoom, brain: Brain, p: PlayerSim, seat: string): Fact | null {
  const sim = simOf(room);
  const run = bandsOf(room).bellRun.get(seat);
  if (run === undefined && room.state.tick < brain.bodyRetryTick) return null;
  let best: Fact | null = null;
  let bestD = Infinity;
  for (const fact of hiveOf(room).all('body')) {
    if (sim.reportedBodies.has(fact.ref) || brain.ownBodies.has(fact.ref)) continue;
    if (fact.ref === run) return fact;
    if (sceneIndex(fact.sceneId) !== p.sceneIdx) continue;
    const d = Math.hypot(fact.x - p.x, fact.y - p.y);
    if (d > tilesPx(balance.npc.body.pullTiles) || d >= bestD) continue;
    if (!brain.seenBodies.has(fact.ref) && !seesFact(room, p, fact)) continue;
    best = fact;
    bestD = d;
  }
  return best;
}

registerTrigger({
  id: 'body',
  kind: 'proximity',
  priority: 30,
  fire: ({ room, brain, p, seat }) => {
    const body = bodyFor(room, brain, p, seat);
    return body ? { key: body.ref, fact: body } : null;
  },
});

registerTrigger({
  id: 'shout.answer',
  kind: 'proximity',
  priority: 20,
  fire: ({ room, seat }) => {
    const fact = bandsOf(room).calls.get(seat);
    if (!fact || bandsOf(room).reached.has(`${seat}|${fact.ref}`)) return null;
    return { key: fact.ref, fact };
  },
});

registerTrigger({
  id: 'scream',
  kind: 'proximity',
  priority: 10,
  fire: ({ room, seat }) => {
    const fact = heardBy(room, seat)
      .filter((f) => DRAWS.has(f.what ?? ''))
      .at(-1);
    if (!fact || bandsOf(room).reached.has(`${seat}|${fact.ref}`)) return null;
    return { key: fact.ref, fact };
  },
});

/** The nearest living seat holding `roleId` other than `except`: its own scene by distance, then any other. */
function nearestHolder(room: PartyRoom, roleId: string, except: string, from: PlayerSim): string | null {
  const sim = simOf(room);
  let best: string | null = null;
  let bestD = Infinity;
  for (const [id, player] of room.state.players) {
    const q = sim.players.get(id);
    if (id === except || !q || q.dead || !q.placed || player.priv.role.roleId !== roleId) continue;
    const d = q.sceneIdx === from.sceneIdx ? Math.hypot(q.x - from.x, q.y - from.y) : Number.MAX_VALUE;
    if (best === null || d < bestD) {
      best = id;
      bestD = d;
    }
  }
  return best;
}

/** The shout: a noise, a heard fact and a bus row of `{sceneId, x, y}`, then the private calls. */
function shout(room: PartyRoom, mem: NpcMemory, seat: string, p: PlayerSim, body: Fact): void {
  const bands = bandsOf(room);
  bands.shouted.add(body.ref);
  const sceneId = sceneKey(p.sceneIdx);
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  emitNoise(room, sceneId, x, y, balance.noise.shout, 'shout', seat);
  const fact = hiveOf(room).hear('shout', sceneId, x, y, room.state.tick);
  emitSim(room, { tick: room.state.tick, kind: 'shout', sceneId, data: { sceneId, x, y } });
  for (const roleId of ['detective', 'doctor']) {
    const holder = nearestHolder(room, roleId, seat, p);
    if (holder === null) continue;
    if (mem.ids.has(holder)) bands.calls.set(holder, fact);
    else clientOf(room, holder)?.send(S2C.shout, { sceneId, x, y });
  }
}

/** Whether the seat's own card still has a pull of the rope, and the bell may ring now. */
function canRing(room: PartyRoom, player: PlayerState, p: PlayerSim): boolean {
  const phase = room.state.phase;
  if (!bellOf(room) || phase === Phase.finalNight) return false;
  return p.bellPulls < (roles.roles[player.priv.role.roleId]?.bellPulls ?? 0);
}

/** Walks across the map to the hub's bell and rings it in reach. */
function runForBell(room: PartyRoom, brain: Brain, p: PlayerSim, seat: string): void {
  const bell = bellOf(room)!;
  const here = sceneKey(p.sceneIdx);
  const hub = hubOf(room);
  if (here !== hub) {
    const portal = firstPortalToward(here, simOf(room).profile, (s: SceneId) => s === hub, mapScenesOf(room));
    if (!portal || walkThrough(room, brain, p, seat, portal) === 'stuck') stand(p);
    return;
  }
  const reach = rangePx('bell') * STRIKE_MARGIN;
  const result = walkTo(
    room,
    brain,
    p,
    tileCentre(bell.x, TILE_PX),
    tileCentre(bell.y, TILE_PX),
    reach / GOAL_SLACK,
  );
  if (result === 'arrived' && isVerbPhase(room.state.phase)) runAction(room, seat, 'act.bell', {});
}

/** Walks toward a heard or called point, across scenes; marks it reached on arrival. */
function answer(room: PartyRoom, brain: Brain, p: PlayerSim, seat: string, fact: Fact): void {
  const here = sceneKey(p.sceneIdx);
  const reached = () => bandsOf(room).reached.add(`${seat}|${fact.ref}`);
  if (here !== fact.sceneId) {
    const goal = (s: SceneId) => s === fact.sceneId;
    const portal = firstPortalToward(here, simOf(room).profile, goal, mapScenesOf(room));
    if (!portal || walkThrough(room, brain, p, seat, portal) === 'stuck') reached();
    return;
  }
  if (walkTo(room, brain, p, fact.x, fact.y, TILE_PX) !== 'walking') reached();
}

/**
 * The body bands' slot in `runWorldNpc` (granted by 6Z), after the strike and the creature flee: runs the seat's
 * hive reaction. Returns whether it drove the seat this tick.
 */
export function runBodyBands(
  room: PartyRoom,
  mem: NpcMemory,
  brain: Brain,
  player: PlayerState,
  p: PlayerSim,
): boolean {
  const seat = player.id;
  const bands = bandsOf(room);
  const held = heldReaction(room, seat);
  if (held?.trigger !== 'body') bands.bellRun.delete(seat);
  if (!held?.fact) return false;
  const fact = held.fact;
  const due = dueReaction(room, seat) !== null;
  brain.mode = 'react';
  brain.act = null;
  releaseClaims(mem, seat);
  if (!due) {
    stand(p); // the noticing moment, staggered per seat
    return true;
  }
  if (held.trigger !== 'body') {
    answer(room, brain, p, seat, fact);
    return true;
  }
  if (bands.bellRun.get(seat) === fact.ref) {
    runForBell(room, brain, p, seat);
    return true;
  }
  const tick = room.state.tick;
  const d = Math.hypot(fact.x - p.x, fact.y - p.y);
  if (d <= tilesPx(balance.npc.body.shoutTiles) && !bands.shouted.has(fact.ref))
    shout(room, mem, seat, p, fact);
  if (d <= tilesPx(balance.npc.body.bellTiles)) {
    const reporter = bands.reporter.get(fact.ref);
    const standing = reporter !== undefined && simOf(room).players.get(reporter)?.dead === false;
    if (!standing) bands.reporter.set(fact.ref, seat);
    else if (reporter !== seat && canRing(room, player, p)) {
      bands.bellRun.set(seat, fact.ref);
      runForBell(room, brain, p, seat);
      return true;
    }
  }
  const reach = rangePx('report') * STRIKE_MARGIN;
  if (d > reach) {
    if (walkTo(room, brain, p, fact.x, fact.y, reach / GOAL_SLACK) === 'stuck')
      brain.bodyRetryTick = tick + TICK_RATE;
    return true;
  }
  stand(p);
  const since = brain.reachedBodyTick.get(fact.ref) ?? tick;
  brain.reachedBodyTick.set(fact.ref, since);
  // No verb works in immunity: the reporter waits by the body and reports once one does.
  if (
    isVerbPhase(room.state.phase) &&
    tick - since >= Math.round(difficultyRow(room).reportDelayS * TICK_RATE)
  ) {
    runAction(room, seat, 'act.reportBody', { bodyId: fact.ref });
  }
  return true;
}
