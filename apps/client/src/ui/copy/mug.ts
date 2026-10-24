// UI.md 14.37 the mugging prompt (Session 8E, round 8; GDD 3.24): the lines of the panel a mugged player sees. A
// screen reads its lines from here, never from a literal. Values in braces are filled with `fill()`.
export const MUG_COPY = {
  'mug.title': '{name} wants your purse.',
  'mug.hint': 'Pay a share of your purse.',
  'mug.timer': '{s} s to choose',
  'mug.pay': 'Pay',
  /** Join the panel with the fists (DECISIONS A180, part two). */
  'mug.flee': 'Run',
  'mug.fight': 'Fight',
} as const;
