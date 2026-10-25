import { type TalkWhen, talk } from '@wdi/content';
import type { Rng } from '@wdi/shared';
import type { PublicFacts } from './facts';

const pickOf = <T>(items: readonly T[], u: number): T | undefined =>
  items[Math.min(items.length - 1, Math.floor(u * items.length))];

/**
 * The template lines of an NPC seat's meeting notes (GDD 3.25 "Talk"), from `talk.json` (round 9, N2). A line names
 * seats only by name and never names a card, a role or a faction (`checkTalk`). `{body}`, `{caller}`, `{missing}` and
 * `{name}` (another living seat) are filled from `PublicFacts`; a line whose placeholder has nothing to fill, or
 * whose `when` the facts do not meet, is not drawn.
 */
export const NOTE_TEMPLATES: readonly string[] = talk.notes.map((l) => l.text);

/** Whether a line's `when` (`TalkWhen`) holds for the meeting's public facts; no `when` always holds. */
export function holds(when: TalkWhen | undefined, f: PublicFacts): boolean {
  switch (when) {
    case 'body':
      return f.body !== '';
    case 'bell':
      return f.reason === 'bell';
    case 'report':
      return f.reason === 'body';
    case 'caller':
      return f.caller !== '';
    default:
      return true;
  }
}

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
  const usable = talk.notes.filter(
    (l) =>
      holds(l.when, facts) &&
      [...l.text.matchAll(/\{(\w+)\}/g)].every(([, key]) => (fills[key ?? ''] ?? '') !== ''),
  );
  const line = pickOf(usable, uLine)?.text ?? 'Let us not vote blind.';
  return line.replace(/\{(\w+)\}/g, (_, key: string) => fills[key] ?? '');
}

/**
 * Red herrings (GDD 3.25 "Misdirection"): a line that gets one public fact slightly wrong, so a careful reader can
 * tell. `{seat}` is a living seat at the table, so naming it as the body, the missing or the caller is the slip.
 */
export const HERRINGS: readonly { when: (f: PublicFacts) => boolean; text: string }[] = talk.herrings.map(
  (h) => ({
    when: (f: PublicFacts) => holds(h.when, f),
    text: h.text,
  }),
);

/** Small talk (GDD 3.25 "Misdirection"): satire of a village meeting, about nothing at all. */
export const SMALL_TALK: readonly string[] = talk.smallTalk;

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
