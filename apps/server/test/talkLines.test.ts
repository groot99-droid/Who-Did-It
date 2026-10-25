import { describe, expect, it } from 'vitest';
import type { PublicFacts } from '../src/services/talk/facts';
import { HERRINGS, NOTE_TEMPLATES, SMALL_TALK, holds } from '../src/services/talk/templates';
import { talk } from '@wdi/content';

// Round 9 (N2): the lines moved from templates.ts into talk.json unchanged. These are the lines and the herring
// conditions as templates.ts held them before the move, copied byte for byte.
const BEFORE_NOTES = [
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
const BEFORE_BELL_ONLY = 'Whoever rang the bell, say why.';
const BEFORE_HERRINGS: { when: (f: PublicFacts) => boolean; text: string }[] = [
  { when: (f) => f.body !== '', text: 'Poor {seat}. Who found the body?' },
  { when: (f) => f.reason === 'bell', text: 'Who found the body this time?' },
  { when: (f) => f.reason === 'body', text: 'Why ring the bell when nobody is hurt?' },
  { when: (f) => f.caller !== '', text: '{seat}, why did you call us here?' },
  { when: () => true, text: 'Where is {seat}? Nobody has seen them all day.' },
  { when: () => true, text: 'Night {wrongRound} and still no answer.' },
];
const BEFORE_SMALL_TALK = [
  'Can I get a cup of coffee?',
  'Is there any more of that pie?',
  'Who left the gate open again?',
  'Must we do this before supper?',
  'I only came for the biscuits.',
  'Does anyone else smell bread?',
  'My feet are sore. Can we sit?',
  'Someone owes me a shilling.',
];

/** Every meeting the facts can describe, as far as a line's condition reads them. */
const meetings: PublicFacts[] = ['body', 'bell', 'missing', 'final'].flatMap((reason) =>
  ['', 'Bo'].flatMap((body) =>
    ['', 'Cy'].map((caller) => ({ round: 2, reason, caller, body, missing: [], others: ['Ada'] })),
  ),
);

describe('talk.json holds the lines templates.ts held (N2)', () => {
  it('the note, herring and small-talk lines are byte-identical and in the same order', () => {
    expect(NOTE_TEMPLATES).toEqual(BEFORE_NOTES);
    expect(HERRINGS.map((h) => h.text)).toEqual(BEFORE_HERRINGS.map((h) => h.text));
    expect(SMALL_TALK).toEqual(BEFORE_SMALL_TALK);
    const bytes = (lines: readonly string[]) => Buffer.from(lines.join('\n'), 'utf8').toString('hex');
    expect(bytes(NOTE_TEMPLATES)).toBe(bytes(BEFORE_NOTES));
    expect(bytes(SMALL_TALK)).toBe(bytes(BEFORE_SMALL_TALK));
  });

  it('each line is drawn in exactly the meetings it was drawn in before', () => {
    for (const f of meetings) {
      HERRINGS.forEach((h, i) => expect(h.when(f)).toBe(BEFORE_HERRINGS[i]!.when(f)));
      talk.notes.forEach((l) =>
        expect(holds(l.when, f)).toBe(l.text !== BEFORE_BELL_ONLY || f.reason === 'bell'),
      );
    }
  });
});
