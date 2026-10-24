/**
 * Round 8, 8C (UI.md 14.34.1): which shop trade is waiting on the server. The panel answers the press with 8H's
 * motion: `flash` on the button once the purse has moved the trade's way, `refused` on it if an error line comes
 * first. The server sends no trade result of its own, so the purse is the answer.
 */
export interface PendingTrade {
  side: 'buy' | 'sell';
  itemId: string;
  /** The purse when the button was pressed. */
  coins: number;
}

/** True once `coins` shows the trade landed: a buy took Scrip out, a sale put Scrip in. */
export const tradeLanded = (p: PendingTrade, coins: number): boolean =>
  p.side === 'buy' ? coins < p.coins : coins > p.coins;
