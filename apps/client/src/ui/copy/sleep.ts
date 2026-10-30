// UI.md 14.46 Sleeping (Session 10H, round 10, GDD 3.32): the bed prompts, the asleep overlay and the dawn line.
// A screen reads its lines from here, never from a literal. No line names a seat: a sleeper learns how many are in
// bed, never who.
export const SLEEP_COPY = {
  'prompt.bed': 'Press E: lie down',
  'prompt.cot': 'Press E: lie down on the cot',
  'prompt.innBed': 'Press E: rent the bed ({n} Scrip)',
  'asleep.title': 'Asleep',
  'asleep.count': '{n} of {m} in bed',
  'asleep.hint': 'Move to wake.',
  'asleep.through': 'You slept through.',
} as const;
