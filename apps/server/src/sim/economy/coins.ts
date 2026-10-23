import { balance } from '@wdi/content';
import { ErrorCode, Node, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { type PlayerSim, simOf } from '../RoomSim';
import { isVerbPhase, sceneKey } from '../World';
import { balanceOf, movePurse } from './purse';

/**
 * Coins on the ground (round 8, GDD 3.23; docs/round8/economy.md 2), Session 8C. A knockout (8A's `body.ko`) or a
 * mugging (8E) calls `dropCoins`: the Scrip leaves the purse for an `@coins:<node>` account and lies as a `coins`
 * node of `SceneState.nodes` where the seat stands. Anyone alive picks it up with the usual `gather` hold
 * (`sim/Resources.ts` routes a `coins` node here, two locked lines); the pickup takes everything on the node, which
 * then goes for good: coins never respawn.
 */

export const COINS = 'coins';

type NodeState = InstanceType<typeof Node>;

/** The next coins node's number, per match (keyed by its `MatchSeeds`, like the purse ledger). */
const dropped = new WeakMap<object, number>();

const accountOf = (nodeId: string): string => `@coins:${nodeId}`;

function coinsNode(room: PartyRoom, p: PlayerSim, nodeId: string): NodeState | undefined {
  const node = room.state.scenes.get(sceneKey(p.sceneIdx))?.nodes.get(nodeId);
  return node?.resource === COINS ? node : undefined;
}

/** Whether `nodeId` in the seat's scene is a coins node: the route `sim/Resources.ts` takes. */
export const isCoins = (room: PartyRoom, p: PlayerSim, nodeId: string): boolean =>
  coinsNode(room, p, nodeId) !== undefined;

/**
 * Drops up to `amount` of `seat`'s purse where it stands, as a new coins node, and returns the node's id; null when
 * nothing moved (an empty purse, an unplaced seat).
 */
export function dropCoins(room: PartyRoom, seat: string, amount: number): string | null {
  const p = simOf(room).players.get(seat);
  const scene = p?.placed ? room.state.scenes.get(sceneKey(p.sceneIdx)) : undefined;
  if (!p || !scene || balanceOf(room, seat) <= 0) return null;
  const n = dropped.get(room.seeds) ?? 0;
  dropped.set(room.seeds, n + 1);
  const id = `coins.${n}`;
  if (movePurse(room, seat, accountOf(id), amount, 'drop') === 0) return null;
  const node = new Node();
  node.id = id;
  node.resource = COINS;
  node.x = Math.round(p.x);
  node.y = Math.round(p.y);
  node.active = true;
  node.respawnTick = 0;
  scene.nodes.set(id, node);
  return id;
}

/** Why a pickup cannot run this tick, or null: the gather checks without a tool or a pocket. */
export function coinsProblem(
  room: PartyRoom,
  p: PlayerSim,
  nodeId: string,
): { code: ErrorCode; msg: string } | null {
  if (!isVerbPhase(room.state.phase)) return { code: ErrorCode.wrongPhase, msg: 'not now' };
  if (p.dead || !p.placed) return { code: ErrorCode.cannot, msg: 'not now' };
  if (room.state.tick < p.busyUntilTick) return { code: ErrorCode.busy, msg: 'busy' };
  const node = coinsNode(room, p, nodeId);
  if (!node || !node.active) return { code: ErrorCode.cannot, msg: 'nothing there' };
  if (Math.hypot(p.x - node.x, p.y - node.y) > balance.doors.reachTiles * TILE_PX) {
    return { code: ErrorCode.outOfRange, msg: 'too far' };
  }
  return null;
}

/** One tick of a pickup hold: at the end of `economy.coinPickupS` the whole drop goes to the purse and the node goes. */
export function tickCoins(room: PartyRoom, sessionId: string, p: PlayerSim): void {
  const hold = p.hold;
  if (!hold) return;
  if (coinsProblem(room, p, hold.targetId) || p.vx !== 0 || p.vy !== 0) {
    p.hold = null;
    return;
  }
  if (room.state.tick - hold.startTick < Math.round(balance.economy.coinPickupS * TICK_RATE)) return;
  p.hold = null;
  const account = accountOf(hold.targetId);
  movePurse(room, account, sessionId, balanceOf(room, account), 'pickup');
  room.state.scenes.get(sceneKey(p.sceneIdx))?.nodes.delete(hold.targetId);
}
