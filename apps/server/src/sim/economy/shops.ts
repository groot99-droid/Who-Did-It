import { balance, economy, scenes } from '@wdi/content';
import { S2C, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { addStack, canAdd, count, take } from '../Inventory';
import { simOf } from '../RoomSim';
import { isVerbPhase, reject, sceneKey, tileCentre } from '../World';
import { TOWN, balanceOf, movePurse } from './purse';
import { refusal, type Refusal } from '../refusal';
import { askOf } from './fare';
import { stockLeft, takeStock } from './townWork';

/**
 * Shops (round 8, GDD 3.23; docs/round8/economy.md 2), Session 8C. A shop is one `counter` static named by
 * `economy.json` `shops.<id>.prop`. An `act.hold {action: 'shop'}` on it opens the shop (`shop.open`, private), and
 * `act.buy` and `act.sell` then trade with the shop the seat holds open while its counter stays in reach. Every coin
 * moves through `movePurse`: a purchase burns to the town, a sale mints from it.
 */

export type Problem = Refusal;

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
  if (!isVerbPhase(room.state.phase)) return refusal('PHASE_CLOSED');
  const p = simOf(room).players.get(sessionId);
  if (!p || !p.placed || p.dead) return refusal('NOT_IN_PLAY');
  const prop = scenes[sceneKey(p.sceneIdx)]?.props.find((q) => q.id === propId);
  if (!prop) return refusal('NOTHING_THERE');
  const reach = balance.doors.reachTiles * TILE_PX;
  if (Math.hypot(p.x - tileCentre(prop.x, TILE_PX), p.y - tileCentre(prop.y, TILE_PX)) > reach)
    return refusal('TOO_FAR');
  return null;
}

/**
 * A shop's list with its prices: `ask` from `askOf` (round 10, C2b: a dear stall shows what it asks), `pay` as set.
 * C3: a stall with an `owner` also shows how many of each it has `left` today (seams.md row 15).
 */
const priced = (room: PartyRoom, shopId: string, items: readonly string[], side: 'ask' | 'pay') =>
  items.map((itemId) => {
    const left = side === 'ask' ? stockLeft(room, shopId, itemId) : undefined;
    return {
      itemId,
      price: (side === 'ask' ? askOf(room, shopId, itemId) : economy.prices[itemId]?.pay) ?? 0,
      ...(left !== undefined && { left }),
    };
  });

/** `shop.open` to the seat: what the shop sells and buys now. */
function sendShop(room: PartyRoom, sessionId: string, shopId: string): void {
  const shop = economy.shops[shopId]!;
  room.clients.getById(sessionId)?.send(S2C.shopOpen, {
    shopId,
    stock: priced(room, shopId, shop.sells, 'ask'),
    buys: priced(room, shopId, shop.buys, 'pay'),
  });
}

/** `act.hold {action: 'shop', targetId: propId}` (the one line in `sim/Hold.ts`): opens the counter's shop. */
export function handleShopHold(room: PartyRoom, sessionId: string, propId: string): void {
  const shopId = shopOfProp(propId);
  const problem = shopId ? counterProblem(room, sessionId, propId) : refusal('NO_COUNTER', { kind: 'shop' });
  if (problem || !shopId) {
    reject(room, sessionId, problem ?? refusal('NO_COUNTER', { kind: 'shop' }));
    return;
  }
  openOf(room).set(sessionId, shopId);
  sendShop(room, sessionId, shopId);
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
    return refusal('BAD_REQUEST');
  if (openOf(room).get(sessionId) !== shopId) return refusal('COUNTER_CLOSED', { kind: 'shop' });
  return counterProblem(room, sessionId, economy.shops[shopId]?.prop ?? '');
}

/** `act.buy {shopId, itemId, qty}`: the purse pays `ask` each to the town, and the items go to the inventory. */
export function handleBuy(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const player = room.state.players.get(sessionId);
  const problem = tradeProblem(room, sessionId, payload);
  if (!player || problem) {
    if (problem) reject(room, sessionId, problem);
    return;
  }
  const { shopId, itemId } = payload as { shopId: string; itemId: string };
  const qty = payload.qty as number;
  const ask = askOf(room, shopId, itemId); // round 10, C2b: the price shown is the price paid
  if (!economy.shops[shopId]!.sells.includes(itemId) || ask === undefined) {
    reject(room, sessionId, 'NOT_FOR_SALE', { item: itemId });
    return;
  }
  const left = stockLeft(room, shopId, itemId); // round 10, C3: a stall sells from its day's stock
  if (left !== undefined && left < qty) {
    reject(room, sessionId, 'SPENT', { what: 'stock' });
    return;
  }
  const cost = ask * qty;
  if (balanceOf(room, sessionId) < cost) {
    reject(room, sessionId, 'NEED_SCRIP');
    return;
  }
  if (!canAdd(player, itemId, qty)) {
    reject(room, sessionId, 'PACK_FULL');
    return;
  }
  movePurse(room, sessionId, TOWN, cost, 'buy');
  addStack(player, itemId, qty);
  if (left === undefined) return;
  takeStock(room, shopId, itemId, qty);
  sendShop(room, sessionId, shopId); // the panel shows what is left
}

/** `act.sell {shopId, itemId, qty}`: the items leave the inventory, and the town pays `pay` each into the purse. */
export function handleSell(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const player = room.state.players.get(sessionId);
  const problem = tradeProblem(room, sessionId, payload);
  if (!player || problem) {
    if (problem) reject(room, sessionId, problem);
    return;
  }
  const { shopId, itemId } = payload as { shopId: string; itemId: string };
  const qty = payload.qty as number;
  const pay = economy.prices[itemId]?.pay;
  if (!economy.shops[shopId]!.buys.includes(itemId) || pay === undefined) {
    reject(room, sessionId, 'NOT_BOUGHT_HERE', { item: itemId });
    return;
  }
  if (count(player, itemId) < qty) {
    reject(room, sessionId, 'NEED_ITEM', { need: itemId });
    return;
  }
  take(player, itemId, qty);
  movePurse(room, TOWN, sessionId, pay * qty, 'sale');
}
