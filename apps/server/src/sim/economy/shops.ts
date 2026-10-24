import { balance, economy, scenes } from '@wdi/content';
import { ErrorCode, S2C, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { addStack, canAdd, count, take } from '../Inventory';
import { simOf } from '../RoomSim';
import { isVerbPhase, reject, sceneKey, tileCentre } from '../World';
import { TOWN, balanceOf, movePurse } from './purse';

/**
 * Shops (round 8, GDD 3.23; docs/round8/economy.md 2), Session 8C. A shop is one `counter` static named by
 * `economy.json` `shops.<id>.prop`. An `act.hold {action: 'shop'}` on it opens the shop (`shop.open`, private), and
 * `act.buy` and `act.sell` then trade with the shop the seat holds open while its counter stays in reach. Every coin
 * moves through `movePurse`: a purchase burns to the town, a sale mints from it.
 */

export type Problem = { code: ErrorCode; msg: string };

/** The shop each seat holds open, keyed by the match's `MatchSeeds` like the purse ledger. */
const opened = new WeakMap<object, Map<string, string>>();

function openOf(room: PartyRoom): Map<string, string> {
  let m = opened.get(room.seeds);
  if (!m) {
    m = new Map();
    opened.set(room.seeds, m);
  }
  return m;
}

const shopOfProp = (propId: string): string | undefined =>
  Object.keys(economy.shops).find((id) => economy.shops[id]!.prop === propId);

/**
 * Why `sessionId` cannot use the economy static `propId` now: a living seat, a verb phase, the prop in its scene and
 * in reach (the bank's counter shares it).
 */
export function counterProblem(room: PartyRoom, sessionId: string, propId: string): Problem | null {
  if (!isVerbPhase(room.state.phase)) return { code: ErrorCode.wrongPhase, msg: 'not now' };
  const p = simOf(room).players.get(sessionId);
  if (!p || !p.placed || p.dead) return { code: ErrorCode.cannot, msg: 'not now' };
  const prop = scenes[sceneKey(p.sceneIdx)]?.props.find((q) => q.id === propId);
  if (!prop) return { code: ErrorCode.cannot, msg: 'nothing here' };
  const reach = balance.doors.reachTiles * TILE_PX;
  if (Math.hypot(p.x - tileCentre(prop.x, TILE_PX), p.y - tileCentre(prop.y, TILE_PX)) > reach)
    return { code: ErrorCode.outOfRange, msg: 'too far' };
  return null;
}

const priced = (items: readonly string[], side: 'ask' | 'pay') =>
  items.map((itemId) => ({ itemId, price: economy.prices[itemId]?.[side] ?? 0 }));

/** `act.hold {action: 'shop', targetId: propId}` (the one line in `sim/Hold.ts`): opens the counter's shop. */
export function handleShopHold(room: PartyRoom, sessionId: string, propId: string): void {
  const shopId = shopOfProp(propId);
  const problem = shopId
    ? counterProblem(room, sessionId, propId)
    : { code: ErrorCode.cannot, msg: 'no shop here' };
  if (problem || !shopId) {
    reject(room, sessionId, problem?.code ?? ErrorCode.cannot, problem?.msg ?? 'no shop here');
    return;
  }
  const shop = economy.shops[shopId]!;
  openOf(room).set(sessionId, shopId);
  room.clients.getById(sessionId)?.send(S2C.shopOpen, {
    shopId,
    stock: priced(shop.sells, 'ask'),
    buys: priced(shop.buys, 'pay'),
  });
}

/** The checks `act.buy` and `act.sell` share: the shop is the one held open, still in reach, and `qty` is a count. */
function tradeProblem(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): Problem | null {
  const { shopId, itemId, qty } = payload;
  if (
    typeof shopId !== 'string' ||
    typeof itemId !== 'string' ||
    !Number.isSafeInteger(qty) ||
    (qty as number) < 1
  )
    return { code: ErrorCode.cannot, msg: 'cannot do that' };
  if (openOf(room).get(sessionId) !== shopId) return { code: ErrorCode.cannot, msg: 'no shop open' };
  return counterProblem(room, sessionId, economy.shops[shopId]?.prop ?? '');
}

/** `act.buy {shopId, itemId, qty}`: the purse pays `ask` each to the town, and the items go to the inventory. */
export function handleBuy(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const player = room.state.players.get(sessionId);
  const problem = tradeProblem(room, sessionId, payload);
  if (!player || problem) {
    if (problem) reject(room, sessionId, problem.code, problem.msg);
    return;
  }
  const { shopId, itemId } = payload as { shopId: string; itemId: string };
  const qty = payload.qty as number;
  const ask = economy.prices[itemId]?.ask;
  if (!economy.shops[shopId]!.sells.includes(itemId) || ask === undefined) {
    reject(room, sessionId, ErrorCode.cannot, 'not for sale');
    return;
  }
  const cost = ask * qty;
  if (balanceOf(room, sessionId) < cost) {
    reject(room, sessionId, ErrorCode.cannot, 'not enough Scrip');
    return;
  }
  if (!canAdd(player, itemId, qty)) {
    reject(room, sessionId, ErrorCode.cannot, 'no room');
    return;
  }
  movePurse(room, sessionId, TOWN, cost, 'buy');
  addStack(player, itemId, qty);
}

/** `act.sell {shopId, itemId, qty}`: the items leave the inventory, and the town pays `pay` each into the purse. */
export function handleSell(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const player = room.state.players.get(sessionId);
  const problem = tradeProblem(room, sessionId, payload);
  if (!player || problem) {
    if (problem) reject(room, sessionId, problem.code, problem.msg);
    return;
  }
  const { shopId, itemId } = payload as { shopId: string; itemId: string };
  const qty = payload.qty as number;
  const pay = economy.prices[itemId]?.pay;
  if (!economy.shops[shopId]!.buys.includes(itemId) || pay === undefined) {
    reject(room, sessionId, ErrorCode.cannot, 'not bought here');
    return;
  }
  if (count(player, itemId) < qty) {
    reject(room, sessionId, ErrorCode.cannot, 'not enough');
    return;
  }
  take(player, itemId, qty);
  movePurse(room, TOWN, sessionId, pay * qty, 'sale');
}
