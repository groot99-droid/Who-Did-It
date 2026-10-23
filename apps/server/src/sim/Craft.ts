import { balance, recipes, scenes } from '@wdi/content';
import { ErrorCode, type PlayerState, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { canExchange, exchange } from './Inventory';
import { type PlayerSim, simOf } from './RoomSim';
import { isVerbPhase, reject, sceneKey, tileCentre } from './World';

/**
 * Crafting (round 6, M5b, GDD 3.14; docs/round6/m5b-data.md 2.1): the `craft` hold at a station prop of the recipe's
 * kind within `doors.reachTiles` (a recipe with no station crafts anywhere); the inputs are taken, and the tool given,
 * as one change when the hold's cast has run (`sim/Inventory.ts`). Tools are role-neutral and leave no mark of
 * who made them.
 */

/** Whether the seat stands within reach of a prop of `kind` in its own scene. */
function atStation(p: PlayerSim, kind: string): boolean {
  const reach = balance.doors.reachTiles * TILE_PX;
  return scenes[sceneKey(p.sceneIdx)].props.some(
    (q) =>
      q.kind === kind && Math.hypot(p.x - tileCentre(q.x, TILE_PX), p.y - tileCentre(q.y, TILE_PX)) <= reach,
  );
}

/** Why a craft hold cannot run this tick, or null (also the check that starts it). */
function craftProblem(
  room: PartyRoom,
  player: PlayerState,
  p: PlayerSim,
  recipeId: string,
): { code: ErrorCode; msg: string } | null {
  if (!isVerbPhase(room.state.phase)) return { code: ErrorCode.wrongPhase, msg: 'not now' };
  if (p.dead || !p.placed) return { code: ErrorCode.cannot, msg: 'not now' };
  if (room.state.tick < p.busyUntilTick) return { code: ErrorCode.busy, msg: 'busy' };
  const recipe = recipes.recipes[recipeId];
  if (!recipe) return { code: ErrorCode.cannot, msg: 'no such recipe' };
  if (recipe.station !== null && !atStation(p, recipe.station)) {
    return { code: ErrorCode.outOfRange, msg: 'needs a station' };
  }
  const takes = recipe.in.map((i) => ({ item: i.item, qty: i.qty }));
  if (!canExchange(player, takes, [{ item: recipe.out, qty: recipe.qty }])) {
    return { code: ErrorCode.cannot, msg: 'missing materials or no room' };
  }
  return null;
}

/** `act.hold {action: 'craft', targetId: recipeId}` (locked call site in `sim/Hold.ts`): starts the hold if it can run. */
export function handleCraft(room: PartyRoom, sessionId: string, recipeId: string): void {
  const player = room.state.players.get(sessionId);
  const p = simOf(room).players.get(sessionId);
  if (!player || !p) return;
  const problem = craftProblem(room, player, p, recipeId);
  if (problem) {
    reject(room, sessionId, problem.code, problem.msg);
    return;
  }
  if (p.hold?.action === 'craft' && p.hold.targetId === recipeId) return;
  p.hold = { action: 'craft', targetId: recipeId, startTick: room.state.tick };
}

/**
 * One tick of a craft hold (called by `runHolds`): moving, leaving the station, a phase change or inputs gone
 * cancel it and take nothing; at the end of the cast the inputs go and the tool arrives.
 */
export function tickCraft(room: PartyRoom, sessionId: string, p: PlayerSim): void {
  const hold = p.hold;
  const player = room.state.players.get(sessionId);
  if (!hold || !player) return;
  if (craftProblem(room, player, p, hold.targetId) || p.vx !== 0 || p.vy !== 0) {
    p.hold = null;
    return;
  }
  const recipe = recipes.recipes[hold.targetId];
  if (!recipe || room.state.tick - hold.startTick < Math.round(recipe.craftS * TICK_RATE)) return;
  p.hold = null;
  exchange(
    player,
    recipe.in.map((i) => ({ item: i.item, qty: i.qty })),
    [{ item: recipe.out, qty: recipe.qty }],
  ); // `craftProblem` just proved it fits
}
