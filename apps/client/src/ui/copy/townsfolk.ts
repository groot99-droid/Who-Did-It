// UI.md 14.36 the ambient townsfolk (Session 8E, round 8; GDD 3.24): the nameplate of a figure by its `villager` look
// id and the meeting line for the townsfolk the creatures took. A screen reads its lines from here, never from a
// literal.
export const TOWNSFOLK_COPY = {
  'figure.villager': 'Villager',
  'figure.villager_clerk': 'Company Clerk',
  'figure.villager_tallyman': 'Tallyman',
  'meeting.townsfolk.lost.one': 'The wolves took one of the townsfolk.',
  'meeting.townsfolk.lost.many': 'The wolves took {n} of the townsfolk.',
} as const;

/** The nameplate of a figure wearing `lookId` (a `villager` look): its own line, else the plain villager's. */
export function figureName(lookId: string): string {
  const key = `figure.${lookId}` as keyof typeof TOWNSFOLK_COPY;
  return TOWNSFOLK_COPY[key] ?? TOWNSFOLK_COPY['figure.villager'];
}

/** The meeting line for `n` townsfolk taken since the last meeting; null for none. */
export function townsfolkLostLine(n: number): string | null {
  if (n <= 0) return null;
  if (n === 1) return TOWNSFOLK_COPY['meeting.townsfolk.lost.one'];
  return TOWNSFOLK_COPY['meeting.townsfolk.lost.many'].replace('{n}', String(n));
}
