import { balance, items, propStem, recipes, scenes } from '@wdi/content';
import { boxOf, ErrorCode, matchGrid, type PlayerState, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { canExchange, count, exchange } from './Inventory';
import { refusal, sendRefusal } from './refusal';
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

/** Whether the seat stands within reach of a workbench (a `dressing` or `decor` prop of the stem `workbench`). */
function atBench(p: PlayerSim): boolean {
  const reach = balance.doors.reachTiles * TILE_PX;
  return scenes[sceneKey(p.sceneIdx)].props.some(
    (q) =>
      propStem(q.id) === 'workbench' &&
      Math.hypot(p.x - tileCentre(q.x, TILE_PX), p.y - tileCentre(q.y, TILE_PX)) <= reach,
  );
}

/**
 * `craft.grid {size, cells}` (round 10, A13, GDD 3.30): the crafting grid. The cells name items the seat holds, one
 * unit each; the hand recipes (no station) match shapeless or by `shape`. A 3 by 3 grid works only within reach of a
 * workbench, and a pattern wider than the pocket square needs one too. The inputs go and the product arrives as one
 * change inside `step()`; a role-bound item is refused whatever the recipes say (logic-table 10.1).
 */
export function handleCraftGrid(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const player = room.state.players.get(sessionId);
  const p = simOf(room).players.get(sessionId);
  if (!player || !p) return;
  const fail = (r: ReturnType<typeof refusal>) => sendRefusal(room, sessionId, r.reason, r.args as never);
  const { size, cells } = payload;
  if (
    (size !== 2 && size !== 3) ||
    !Array.isArray(cells) ||
    cells.length !== size * size ||
    cells.some((c) => c !== null && (typeof c !== 'string' || !items.items[c]))
  )
    return fail(refusal('BAD_REQUEST'));
  const grid = cells as Array<string | null>;
  if (!isVerbPhase(room.state.phase)) return fail(refusal('PHASE_CLOSED'));
  if (p.dead || !p.placed) return fail(refusal('NOT_IN_PLAY'));
  if (room.state.tick < p.busyUntilTick) return fail(refusal('BUSY'));
  const bound = grid.find((c) => c !== null && items.items[c]?.roleBound);
  if (bound) return fail(refusal('GRID_BOUND', { item: bound }));
  const box = boxOf(size, grid);
  if ((size === 3 || box.h > 2 || box.w > 2) && !atBench(p))
    return fail(refusal('NEED_STATION', { need: 'workbench' }));
  const hand = Object.values(recipes.recipes).filter((r) => r.station === null);
  const id = matchGrid(hand, size, grid);
  if (id === null) return fail(refusal('GRID_NO_RECIPE'));
  const missing = [...new Set(grid.filter((c): c is string => c !== null))].filter(
    (item) => count(player, item) < grid.filter((c) => c === item).length,
  );
  if (missing.length > 0) return fail(refusal('NEED_MATERIALS', { missing }));
  const recipe = recipes.recipes[id]!;
  const takes = recipe.in.map((i) => ({ item: i.item, qty: i.qty }));
  if (!exchange(player, takes, [{ item: recipe.out, qty: recipe.qty }])) return fail(refusal('PACK_FULL'));
}
