// UI.md 14.32 the body panel, the strike disc and the pockets' Use buttons (Session 8A, round 8; GDD 3.22). The bars'
// labels and the effect chips' suffixes; an effect's name is its `effects.json` row's `name`, read as data, never a
// literal here.
export const BODY_COPY = {
  'body.label': 'Your body',
  'body.health': 'Health',
  'body.stamina': 'Stamina',
  'body.effects': 'Effects on you',
  /** `{value}` of `{max}`, after the bar's label. */
  'body.value': '{value} / {max}',
  /** Whole seconds a timed effect has left. */
  'body.left': '{s}s',
  /** An effect's stacks above one (Weakened from a rat). */
  'body.stacks': '×{n}',
  /** The touch disc of the strike key (X). */
  'body.strike': 'Strike',
  /** A pocket row's Use button: the item on yourself. */
  'body.use': 'Use',
  /** The same on the seat in reach (the Medkit, the Remedy). */
  'body.use.near': 'Use on them',
} as const;

export type BodyCopyId = keyof typeof BODY_COPY;
