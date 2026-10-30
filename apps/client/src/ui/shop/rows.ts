import type { StackSnap } from '../../net/world';
import { stacksOf } from '../Inventory';

/** `shop.open` (private, round 8, GDD 3.23): what the shop sells at its ask and buys at its pay. */
export interface ShopOpen {
  shopId: string;
  stock: Array<{ itemId: string; price: number; left?: number }>;
  buys: Array<{ itemId: string; price: number }>;
}

export interface ShopRow {
  itemId: string;
  price: number;
  /** How many of the item the pockets hold. */
  have: number;
  /** Buy: the purse covers one and the stall has one left. Sell: the pockets hold one. */
  can: boolean;
  /** Round 10, C3: how many a stall has left today; absent for a shop that never runs out. */
  left?: number;
}

/**
 * The panel's two lists from a `shop.open`, the purse and the pockets. The server decides every trade; this only
 * greys the buttons it would refuse (a purse short of one, nothing to sell).
 */
export function shopRows(
  open: ShopOpen,
  purse: number,
  inventory: readonly StackSnap[],
): { stock: ShopRow[]; buys: ShopRow[] } {
  const have = new Map<string, number>();
  for (const s of stacksOf(inventory)) have.set(s.defId, (have.get(s.defId) ?? 0) + s.qty);
  const row = (i: ShopOpen['stock'][number], can: (n: number) => boolean): ShopRow => {
    const n = have.get(i.itemId) ?? 0;
    return {
      itemId: i.itemId,
      price: i.price,
      have: n,
      can: can(n),
      ...(i.left !== undefined && { left: i.left }),
    };
  };
  return {
    stock: open.stock.map((i) => row(i, () => purse >= i.price && i.left !== 0)),
    buys: open.buys.map((i) => row(i, (n) => n > 0)),
  };
}
