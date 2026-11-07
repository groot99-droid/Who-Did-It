// Story mode chrome (docs/story/README.md 3): button labels and headings only. Every line of narration, every title and
// every goal arrives in the server's `story.card` and `story.goals` from the content file; none is typed here.
export const STORY_COPY = {
  'story.menu.entry': 'Story',
  'story.menu.title': 'Story',
  'story.menu.name': 'Your name',
  'story.menu.begin': 'Begin the story',
  'story.menu.continue': 'Continue',
  'story.menu.continueAt': 'Continue from {chapter}',
  'story.menu.replay': 'Replay',
  'story.menu.done': 'Finished',
  'story.menu.locked': 'Play the chapters in order',
  'story.menu.chapter': 'Chapter {n}',
  'story.card.begin': 'Begin',
  'story.card.continue': 'Continue',
  'story.card.next': 'Next chapter',
  'story.card.finish': 'The end',
  'story.card.goal': 'Goal',
  'story.card.summary': 'What you did',
  'story.card.upNext': 'Up next',
  'story.goals.title': 'Goals',
  'story.goals.done': 'done',
} as const;

export type StoryCopyId = keyof typeof STORY_COPY;
