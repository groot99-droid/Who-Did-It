// UI.md 14.38: the chores list, the station prompts and the village's work bar (Session 7M, round 7, GDD 3.5). Task
// names come from `tasks.json`, tool names from `items.json`, scene names from `scenes/*.json`; a screen reads its
// lines from here, never from a literal.
export const TASK_COPY = {
  // 14.38.1 Prompts at a task's source and target (beside the Hold E prompts of 14.1 and 14.19.1)
  'prompt.task.take': 'Press E: take the {tool}',
  'prompt.task.do': 'Press E: {name}',
  'prompt.task.tool': 'Needs the {tool}: {name}',
  'prompt.task.night': 'Only at night: {name}',
  'toast.task.took': 'Took the {tool}.',
  'toast.task.show': 'You make a show of it.',

  // 14.38.2 The chores panel
  'chores.title': 'Chores',
  'chores.key': 'K',
  'chores.none': 'No chores on your list.',
  'chores.show': 'A show of work',
  'chores.fetch': 'Fetch the {tool} from {scene}',
  'chores.bring': 'Bring it to {scene}',
  'chores.go': 'Go to {scene}',
  'chores.night': 'After dark.',
  'chores.done': 'Done',
  'chores.close': 'Close',

  // 14.38.3 The village's work (the task bar of GDD 3.5)
  'work.title': "The village's work",
  'work.pct': '{pct}%',
} as const;

export type TaskCopyId = keyof typeof TASK_COPY;
