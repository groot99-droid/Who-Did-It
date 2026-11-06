// Achievement chrome (GDD 3.28): headings and labels only. Titles, lines and steps come from `achievements.json`.
export const ACHV_COPY = {
  'achv.menu.entry': 'Trophies',
  'achv.title': 'Trophies',
  'achv.earned': 'Earned',
  'achv.open': 'Open',
  'achv.locked': 'Locked',
  'achv.toast.done': 'Earned: {title}',
  'achv.toast.step': '{title}: step {step} of {steps}',
  'achv.empty': 'Nothing earned yet.',
  'achv.growsFrom': 'Grows from {titles}',
  'achv.count': '{n} earned',
} as const;
export type AchvCopyId = keyof typeof ACHV_COPY;
