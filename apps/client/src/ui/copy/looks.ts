// UI.md 14.15 Looks and covers (Session 5F, round 5): the role card's deck strip and cover picker, the seat picker.
// Values in braces are filled with `fill()`.
export const LOOKS_COPY = {
  // The role card
  'card.deck': 'The deck',
  'card.deck.hint': 'Every character of this match. Two are in nobody’s hands.',
  'card.walk': 'You walk as {look}',
  'card.cover.title': 'Choose the face you will wear',
  'card.cover.hint': 'Everyone will see this character. A safe pick is a card nobody holds.',
  'card.cover.safe': 'Safe',
  'card.cover.dealt': 'In play',
  'card.cover.mate': 'Worn by {name}',
  'card.cover.pick': 'Wear {look}',

  // The seat picker (Impersonate, the night powers, the aim)
  'seats.title.impersonate': 'Whose face?',
  'seats.empty': 'Nobody to pick',
  'seats.cancel': 'Cancel',

  // Impersonate
  'toast.disguise.wait': 'Waiting for a moment unseen',
} as const;
