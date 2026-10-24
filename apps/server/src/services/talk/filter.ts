import { balance, roles } from '@wdi/content';
import type { PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';

/** Every word that names a card or a faction a seat could hold (`roles.json`); `village` and `neutral` are plain speech. */
const ROLE_WORDS: readonly string[] = [
  ...new Set(
    [
      ...Object.values(roles.roles).flatMap((r) => [r.id, ...r.name.split(/,\s*/)]),
      ...Object.entries(roles.factions)
        .filter(([id]) => id !== 'village' && id !== 'neutral')
        .map(([, f]) => f.name),
    ].map((w) => w.toLowerCase()),
  ),
];

/** Words that would say the writer is not a person at the table. */
const TELLS = /\b(ai|a\.i\.|npc|bot|robot|language model|llm|claude|anthropic|assistant|prompt)\b/i;
/** Speaking of oneself, so a role word beside it reads as a claim. */
const FIRST_PERSON = /\b(i|i'm|im|me|my|myself)\b/i;
/** A short list of slurs and the worst profanity, matched loosely; the model is asked for none of it. */
const BLOCKED =
  /(n[i1!]gg|f[a@]gg?[o0]t|r[e3]t[a@]rd|\bk[i1]ke\b|\bsp[i1]c\b|\bch[i1]nk\b|\bc[u*]nt|\bf[u*]ck|\bsh[i1]t\b|wh[o0]re)/i;

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (line: string, word: string): boolean =>
  new RegExp(`(^|[^a-z])${escape(word)}([^a-z]|$)`, 'i').test(line);

/**
 * Seats that named their own card in public, by name: none yet. The Case Board's claims (M4, `BoardRow.claimed`)
 * fill this when they ship, and a line may then name such a seat's claimed card.
 */
export function publicClaims(room: PartyRoom): Map<string, string> {
  void room;
  return new Map();
}

/**
 * A model's line made fit for the meeting notes (GDD 3.25 "Filter"), or null to fall back to the template: one line,
 * no quotes, at most `talk.model.maxChars`; nothing that says the writer is not a person; no slur; and no card or
 * faction named beside a seat's name or the writer itself, unless that seat claimed that card in public.
 */
export function filterLine(room: PartyRoom, raw: string): string | null {
  const first = raw.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  const line = first
    .trim()
    .replace(/^["'“‘]+|["'”’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (line === '' || line.length > balance.talk.model.maxChars) return null;
  if (TELLS.test(line) || BLOCKED.test(line)) return null;
  const named = ROLE_WORDS.filter((w) => hasWord(line, w));
  if (named.length === 0) return line;
  if (FIRST_PERSON.test(line)) return null;
  const claims = publicClaims(room);
  const seats: string[] = [];
  room.state.players.forEach((p: PlayerState) => {
    if (hasWord(line, p.name)) seats.push(p.name);
  });
  if (seats.length === 0) return line;
  const ok = seats.every((name) => {
    const claim = claims.get(name);
    return claim !== undefined && named.every((w) => w === claim);
  });
  return ok ? line : null;
}
