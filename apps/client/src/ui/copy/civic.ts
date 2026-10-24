// UI.md 14.35 Rent, Faith, rumours and HQ (Session 8D, round 8, GDD 3.23). Item and look names come from `items.json`
// and `looks.json`; a station's name is keyed by its `economy.json` id (`hq.<id>`). A screen reads its lines from here,
// never a literal.
export const CIVIC_COPY = {
  // 14.35.1 The prompts
  'prompt.altar': 'Press E: the altar',
  'prompt.mailbag': 'Hold E: collect the mailbag',
  'prompt.rack': 'Hold E: hand in your quota',
  'prompt.market': 'Press E: the back-room buyer',
  'prompt.hq': 'Press E: the {station}',
  'prompt.bank': 'Press E: pay what you owe',

  // 14.35.2 The altar
  'altar.title': 'The altar',
  'altar.faith': 'Your Faith: {n} of {max}',
  'altar.purse': 'Your purse: {n} Scrip',
  'altar.donate': 'Give {n} Scrip',
  'altar.indulgence': 'An Indulgence',
  'altar.indulgence.hint': 'Clears one rumour of your look. {faith} Faith and {scrip} Scrip.',
  'altar.seal': 'A Parish Seal',
  'altar.seal.hint': 'Presented at a meeting, the Church holds the charge. {faith} Faith and {scrip} Scrip.',
  'altar.buy': 'Buy',
  'altar.short': 'Not enough Faith or Scrip',

  // 14.35.3 The back-room buyer (the black market) and the notices
  'market.title': 'The back room',
  'market.lead': 'A man who buys what people would rather keep quiet.',
  'market.none': 'You hold no notices.',
  'notice.line': "A figure in {look}'s look, in {place}, {when}.",
  'notice.fence': 'Sell for {n} Scrip',
  'notice.burn': 'Burn',
  'notice.when.day': 'by day',
  'notice.when.dusk': 'at dusk',
  'notice.when.night': 'at night',
  'notice.when.finalNight': 'on the last night',
  'notice.stranger': 'a stranger',

  // 14.35.4 The HQ panel
  'hq.tier': 'Built: {n} of 3',
  'hq.next': 'Next: {scrip} Scrip, {materials}',
  'hq.done': 'Fully built.',
  'hq.build': 'Build',
  'hq.notYours': 'Only someone in the {look} look may build here.',
  'hq.short': 'Not enough Scrip or materials',

  // 14.35.5 The bank counter
  'bank.title': 'The Company ledger',
  'bank.lead': 'Rent falls due at midday and is owed by dusk. Pay all you owe at once.',
  'bank.pay': 'Pay what you owe',

  'civic.close': 'Close',

  // 14.35.4 Station names
  'hq.crumbOvens': "Crumb's Ovens",
  'hq.chapel': 'Chapel',
  'hq.surgery': 'Surgery',
  'hq.lodge': "Gamekeeper's Lodge",
  'hq.office': "Detective's Office",
  'hq.store': "Lamplighter's Store",
} as const;

/** The name of an `economy.json` HQ station, or its id when the copy has none. */
export const stationName = (id: string): string => (CIVIC_COPY as Record<string, string>)[`hq.${id}`] ?? id;
