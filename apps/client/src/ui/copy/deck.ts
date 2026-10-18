// UI.md 14.16 main-mode deck, look and night-role lines (Session 5G, round 5). Ids are the deck's; `{key}` values are
// filled by the caller with `fill()`.
export const DECK_COPY = {
  // 14.16 Deck (lobby list and HUD chip)
  'deck.title': 'The deck',
  'deck.size': '{cards} cards for {players} players',
  'deck.note': 'Every Killer card is dealt. Two other cards stay in the box, and which two is secret.',
  'deck.practice': 'Practice party: the Cabal wins with one villager left.',
  'deck.twice': '{name} x2',
  'deck.chip': 'Deck',
  'deck.chip.label': 'Deck: {cards} cards',
  'deck.chip.open': 'Show the deck',
  'deck.chip.close': 'Hide the deck',

  // 14.16 Looks (meeting and reveal)
  'look.badge': 'Walks as {look}',
  'reveal.look': 'Walking as {look}.',

  // 14.16 Last Shot
  'shot.line': '{from} fired the Last Shot: {target} was the {role}.',

  // 14.16 End screen
  'over.looks': 'Who walked as who',
  'over.looks.row': '{name} walked as {look}',
  'over.undealt': 'The cards left in the box',
  'over.undealt.none': 'No card was left in the box.',
  'over.alsoWon': 'Also won',
  'over.alsoWon.row': '{name} was ejected as the Drifter',
} as const satisfies Record<string, string>;

export type DeckCopyId = keyof typeof DECK_COPY;
