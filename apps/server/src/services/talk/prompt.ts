import { balance } from '@wdi/content';
import type { PublicFacts } from './facts';

/**
 * The model's instructions (GDD 3.25 "Input"). It writes as a villager at the table and is told nothing a human in
 * its seat could not read: the public facts, the meeting so far, its own name and what it found itself. Not its
 * card, so no line can carry it.
 */
export const TALK_SYSTEM = [
  'You write one anonymous note for the town meeting of a murder-mystery party game set in a foggy',
  'nineteenth-century village. Everyone at the table reads the note; nobody sees who wrote it.',
  'Write as an ordinary villager: plain, short, in character, one sentence or two.',
  `Stay under ${balance.talk.model.maxChars} characters. Output only the note: no quotes, no name, no preamble.`,
  'Talk only about what the facts and the meeting so far say. Never claim to know any',
  "person's secret role, and never name a role or card for anyone. Never mention games, rules,",
  'computers or yourself as anything but a villager.',
].join(' ');

export function talkPrompt(
  self: string,
  facts: PublicFacts,
  transcript: readonly { who: string; text: string }[],
  findings: readonly string[],
): string {
  const recent = transcript.slice(-balance.talk.model.transcriptLines);
  const lines = [
    `You are ${self}.`,
    `Round ${facts.round}. The meeting was called by ${facts.reason === 'bell' ? 'the bell' : facts.reason}.`,
    facts.caller !== '' ? `${facts.caller} called it.` : '',
    facts.body !== '' ? `The body found was ${facts.body}'s.` : '',
    facts.missing.length > 0 ? `Missing at the roll-call: ${facts.missing.join(', ')}.` : '',
    `Also at the table: ${facts.others.join(', ') || 'nobody else'}.`,
    findings.length > 0 ? `What you found yourself: ${findings.join(' ')}` : '',
    recent.length > 0 ? 'The meeting so far:' : 'Nobody has said anything yet.',
    ...recent.map((l) => (l.who === '' ? `(a note) ${l.text}` : `${l.who}: ${l.text}`)),
    'Write your note.',
  ];
  return lines.filter((l) => l !== '').join('\n');
}
