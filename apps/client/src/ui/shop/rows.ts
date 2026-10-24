import type { StackSnap } from '../../net/world';
import { stacksOf } from '../Inventory';

/** `shop.open` (private, round 8, GDD 3.23): what the shop sells at its ask and buys at its pay. */
export interface ShopOpen {
  shopId: string;
  stock: Array<{ itemId: string; price: number }>;
  buys: Array<{ itemId: string; price: number }>;
}

export interface ShopRow {
  itemId: string;
  price: number;
  /** How many of the item the pockets hold. */
  have: number;
  /** Buy: the purse covers one. Sell: the pockets hold one. */
  can: boolean;
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
  const row = (i: { itemId: string; price: number }, can: (n: number) => boolean): ShopRow => {
    const n = have.get(i.itemId) ?? 0;
    return { itemId: i.itemId, price: i.price, have: n, can: can(n) };
  };
  return {
    stock: open.stock.map((i) => row(i, () => purse >= i.price)),
    buys: open.buys.map((i) => row(i, (n) => n > 0)),
  };
}
