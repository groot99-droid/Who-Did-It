import type { Rng } from '@wdi/shared';
import type { PublicFacts } from './facts';

const pickOf = <T>(items: readonly T[], u: number): T | undefined =>
  items[Math.min(items.length - 1, Math.floor(u * items.length))];

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
  const fills: Record<string, string> = {
    body: facts.body,
    caller: facts.caller,
    missing: pickOf(facts.missing, uName) ?? '',
    name: pickOf(facts.others, uName) ?? '',
  };
  const usable = NOTE_TEMPLATES.filter((t) => {
    if (t === BELL_ONLY && facts.reason !== 'bell') return false;
    return [...t.matchAll(/\{(\w+)\}/g)].every(([, key]) => (fills[key ?? ''] ?? '') !== '');
  });
  const line = pickOf(usable, uLine) ?? 'Let us not vote blind.';
  return line.replace(/\{(\w+)\}/g, (_, key: string) => fills[key] ?? '');
}

/**
 * Red herrings (GDD 3.25 "Misdirection"): a line that gets one public fact slightly wrong, so a careful reader can
 * tell. `{seat}` is a living seat at the table, so naming it as the body, the missing or the caller is the slip.
 */
export const HERRINGS: readonly { when: (f: PublicFacts) => boolean; text: string }[] = [
  { when: (f) => f.body !== '', text: 'Poor {seat}. Who found the body?' },
  { when: (f) => f.reason === 'bell', text: 'Who found the body this time?' },
  { when: (f) => f.reason === 'body', text: 'Why ring the bell when nobody is hurt?' },
  { when: (f) => f.caller !== '', text: '{seat}, why did you call us here?' },
  { when: () => true, text: 'Where is {seat}? Nobody has seen them all day.' },
  { when: () => true, text: 'Night {wrongRound} and still no answer.' },
];

/** Small talk (GDD 3.25 "Misdirection"): satire of a village meeting, about nothing at all. */
export const SMALL_TALK: readonly string[] = [
  'Can I get a cup of coffee?',
  'Is there any more of that pie?',
  'Who left the gate open again?',
  'Must we do this before supper?',
  'I only came for the biscuits.',
  'Does anyone else smell bread?',
  'My feet are sore. Can we sit?',
  'Someone owes me a shilling.',
];

/** A red herring from two uniforms; `{seat}` is never the caller or a missing seat, so it is always the slip. */
export function herringNote(facts: PublicFacts, rng: Rng): string {
  const uLine = rng();
  const uSeat = rng();
  const pool = facts.others.filter((n) => n !== facts.caller && !facts.missing.includes(n));
  const seat = pickOf(pool, uSeat) ?? '';
  const usable = HERRINGS.filter((h) => h.when(facts) && (seat !== '' || !h.text.includes('{seat}')));
  const line = pickOf(usable, uLine)?.text ?? 'Night {wrongRound} and still no answer.';
  const wrongRound = String(uSeat < 0.5 && facts.round > 1 ? facts.round - 1 : facts.round + 1);
  return line.replace('{seat}', seat).replace('{wrongRound}', wrongRound);
}

export const smallTalkNote = (rng: Rng): string => pickOf(SMALL_TALK, rng()) ?? SMALL_TALK[0]!;
