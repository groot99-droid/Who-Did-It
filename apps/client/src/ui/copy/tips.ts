// Loading-screen tips (docs/UI.md 14.21). They describe the controls and the world and never a role's powers, so a
// tip says nothing about who holds which card. Shown in order from a random start, one every `ui.loading.tipEveryS`.
export const TIPS: readonly string[] = [
  'Hold E on a glowing clue to collect it. Everything you collect goes in your notebook.',
  'Tab opens your role card again whenever you need to read it.',
  'Hold Shift to sneak. You make less noise, and you move slower.',
  'Some doors are locked. A locked door tells you so when you try it.',
  'The Emergency Bell calls everyone to a meeting, wherever they are.',
  'Dark places are dark at noon too. Stay near a light if you can.',
  'A meeting is the place to share what you found. Say where you were, and listen to where others were.',
  'Clues are worth little alone. Two of them in the same hand tell a story.',
  'Every map has woods and a cave. Neither is as empty as it looks.',
];

export const LOADING_COPY = {
  'loading.title': 'Setting the scene',
  'loading.tipLabel': 'Tip',
  'loading.progress': 'Loading',
} as const;
