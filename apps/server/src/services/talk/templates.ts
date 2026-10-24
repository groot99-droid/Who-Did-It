import type { Rng } from '@wdi/shared';
import type { PublicFacts } from './facts';

/**
 * The template lines of an NPC seat's meeting notes (GDD 3.25 "Talk"). A line names seats only by name and never
 * names a card, a role or a faction. `{body}`, `{caller}`, `{missing}` and `{name}` (another living seat) are filled
 * from `PublicFacts`; a line whose placeholder has nothing to fill is not drawn.
 */
export const NOTE_TEMPLATES: readonly string[] = [
  'Who saw {body} last?',
  'Where was everyone when {body} was found?',
  '{body} was fine this morning. What changed?',
  'Did anyone hear anything near {body}?',
  '{caller}, what did you see before you called us?',
  'Whoever rang the bell, say why.',
  'Where is {missing}?',
  'Has anyone seen {name} today?',
  '{name}, where were you after dark?',
  'I saw nothing odd today. That worries me.',
  'Let us not vote blind.',
  'Skip if nobody is sure.',
  'Someone here knows more than they say.',
  'Read the Case Board before you vote.',
  'I kept to the square most of the day.',
  'Two of us saying the same thing is not proof.',
];

const BELL_ONLY = 'Whoever rang the bell, say why.';

/** The template line for one note, from two uniforms drawn by every caller alike (so no fact moves the stream). */
export function templateNote(facts: PublicFacts, rng: Rng): string {
  const uLine = rng();
  const uName = rng();
  const pick = <T>(items: readonly T[], u: number): T | undefined =>
    items[Math.min(items.length - 1, Math.floor(u * items.length))];
  const fills: Record<string, string> = {
    body: facts.body,
    caller: facts.caller,
    missing: pick(facts.missing, uName) ?? '',
    name: pick(facts.others, uName) ?? '',
  };
  const usable = NOTE_TEMPLATES.filter((t) => {
    if (t === BELL_ONLY && facts.reason !== 'bell') return false;
    return [...t.matchAll(/\{(\w+)\}/g)].every(([, key]) => (fills[key ?? ''] ?? '') !== '');
  });
  const line = pick(usable, uLine) ?? 'Let us not vote blind.';
  return line.replace(/\{(\w+)\}/g, (_, key: string) => fills[key] ?? '');
}
