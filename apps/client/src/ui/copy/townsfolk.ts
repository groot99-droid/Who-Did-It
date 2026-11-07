// UI.md 14.36 the ambient townsfolk (Session 8E, round 8; GDD 3.24): the nameplate of a figure by the look it is
// drawn in (the `villagers` family and the `figures` looks of `looks.json`; round 10, 10Y, A454) and the meeting line
// for the townsfolk the creatures took. A screen reads its lines from here, never from a literal.
export const TOWNSFOLK_COPY = {
  'figure.villager': 'Villager',
  'figure.villagerelder': 'Elder',
  'figure.villagergoodwife': 'Goodwife',
  'figure.villagerlass': 'Lass',
  'figure.villagerclerk': 'Clerk',
  'figure.constable': 'Constable',
  'meeting.townsfolk.lost.one': 'The wolves took one of the townsfolk.',
  'meeting.townsfolk.lost.many': 'The wolves took {n} of the townsfolk.',
} as const;

/**
 * The nameplate of a figure drawn in `lookId` (a `villagers` or `figures` look id of `looks.json`, as the wire says
 * it): its own line, else the plain villager's. The line names what is drawn and nothing more: a figure's post or
 * title (the Company Clerk, a stallholder) is not on the wire (A160).
 */
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
