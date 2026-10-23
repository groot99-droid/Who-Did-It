// UI.md 14.34 Scrip: the shop panel and the purse (Session 8C, round 8, GDD 3.23). Item names come from `items.json`;
// a shop's name is keyed by its `economy.json` id (`shop.<id>`). A screen reads its lines from here, never a literal.
export const SCRIP_COPY = {
  // 14.34.1 The shop panel
  'prompt.shop': 'Hold E: trade at the {shop}',
  'shop.sells': 'For sale',
  'shop.buys': 'Wanted',
  'shop.none': 'Nothing here.',
  'shop.price': '{n} Scrip',
  'shop.buy': 'Buy',
  'shop.sell': 'Sell',
  'shop.have': 'You have {n}',
  'shop.short': 'Not enough Scrip',
  'shop.purse': 'Your purse: {n} Scrip',
  'shop.close': 'Close',

  // 14.34.2 The purse counter
  'purse.label': 'Your purse',
  'purse.amount': '{n} Scrip',
  'purse.gain': '+{n}',
  'purse.loss': '−{n}',

  // 14.34.1 Shop names
  'shop.bakery': 'Bakery',
  'shop.apothecary': 'Apothecary',
  'shop.store': 'General Store',
  'shop.market': 'Market',
  'shop.gamekeeper': "Gamekeeper's Stall",
  'shop.bpStore': 'Lodge Store',
  'shop.bpGamekeeper': "Gamekeeper's Stall",
  'shop.bpMarket': 'Camp Market',
} as const;

/** The name of an `economy.json` shop, or its id when the copy has none. */
export const shopName = (id: string): string => (SCRIP_COPY as Record<string, string>)[`shop.${id}`] ?? id;
