import { TICK_RATE } from '@wdi/shared/constants';
import roles from '@wdi/content/data/roles.json';
import type { ChatLine, MeetingStart, VoteResult } from '../net/meeting';
import { SKIP } from '../net/meeting';
import { fill } from './copy';
import { MEETING_COPY as C } from './copy/meeting';
import { NOTES_COPY } from './copy/notes';
import { roleTitle } from './RoleCard';

// The meeting and game-over lines. Wording lives in `copy/meeting.ts` (docs/UI.md 14); these functions pick
// the line and fill it, and never hold a sentence of their own.

type NameOf = (playerId: string) => string;

/** `Phase` ids that matter to the meeting screen (schema `Phase`, mirrored as the router mirrors lobby). */
export const MEETING_PHASE = { discussion: 7, vote: 8, reveal: 9, gameOver: 12 } as const;

export const PHASE_LABEL: Record<number, string> = {
  [MEETING_PHASE.discussion]: C['meeting.phase.discussion'],
  [MEETING_PHASE.vote]: C['meeting.phase.vote'],
  [MEETING_PHASE.reveal]: C['meeting.phase.reveal'],
};

/** "Ada, Bo and Cy". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Hana reported Gus's body" / "Hana rang the bell". */
export function reasonLine(start: MeetingStart | null, nameOf: NameOf): string {
  if (start === null) return C['meeting.reason.none'];
  const caller = nameOf(start.callerId);
  if (start.reason === 'bell') return fill(C['meeting.reason.bell'], { caller });
  if (start.reason === 'body') {
    return start.bodyOf === undefined
      ? fill(C['meeting.reason.bodyUnknown'], { caller })
      : fill(C['meeting.reason.body'], { caller, victim: nameOf(start.bodyOf) });
  }
  if (start.reason === 'final') return NOTES_COPY['meeting.reason.final']; // round 8, 8T (6Z's grant): GDD 3.2 Final Night
  return C['meeting.reason.missing'];
}

/** m:ss from ticks left; the placeholder when no clock runs. */
export function clockText(ticksLeft: number | null): string {
  if (ticksLeft === null || ticksLeft < 0) return '-:--';
  const s = Math.ceil(ticksLeft / TICK_RATE);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Every seat the vote turned out: the one `ejectedId`, or none. */
export function outsOf(result: VoteResult): string[] {
  return result.ejectedId === undefined ? [] : [result.ejectedId];
}

/** Why nobody left: no votes at all, a Skip plurality, or a tie. */
export function noEjectionLine(result: VoteResult): string {
  const ranked = Object.entries(result.tally).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (top === undefined) return C['reveal.none.empty'];
  if (top[0] === SKIP) return C['reveal.none.skip'];
  return C['reveal.none.tie'];
}

/** The reveal's lines: who left and what they were, or why nobody did. */
export function ejectionLines(result: VoteResult, nameOf: NameOf): string[] {
  const outs = outsOf(result);
  if (outs.length === 0) return [noEjectionLine(result)];
  const roleOf = (id: string): string | undefined => (id === result.ejectedId ? result.role : undefined);
  const named = (id: string) => {
    const role = roleOf(id);
    return role === undefined ? null : fill(C['reveal.role'], { name: nameOf(id), role: roleTitle(role) });
  };
  const head = fill(C['reveal.ejected'], { name: nameOf(outs[0] ?? '') });
  return [head, ...outs.map(named).filter((l): l is string => l !== null)].map((line) => `${line}.`);
}

export function ejectionLine(result: VoteResult, nameOf: NameOf): string {
  return ejectionLines(result, nameOf).join(' ');
}

/** Who is speaking in a chat line, with the channel spelled out where it matters. */
export function chatTag(line: ChatLine): string {
  return line.channel === 'ghost' ? 'ghost' : line.channel === 'cabal' ? 'cabal' : '';
}

/** `Winner` ids of the schema: 0 none, 1 village, 2 cabal, 3 drifter, 4 (unused), 5 nobody. */
const WINNER_LINE = [
  C['over.none'],
  C['over.village'],
  C['over.cabal'],
  C['over.drifter'],
  C['over.none'],
  C['over.nobody'],
];

export function winnerLine(winner: number): string {
  return WINNER_LINE[winner] ?? C['over.none'];
}

type RoleRow = { faction?: string };
const mainRoles = roles.roles as Record<string, RoleRow | undefined>;

/** The faction a role belongs to, shown only at the end: `roles.json` (no team literal lives in code). */
export function factionOf(roleId: string): 'village' | 'cabal' | 'neutral' {
  const faction = mainRoles[roleId]?.faction;
  return faction === 'cabal' || faction === 'neutral' ? faction : 'village';
}

export const FACTION_LABEL = {
  village: C['over.faction.village'],
  cabal: C['over.faction.cabal'],
  neutral: C['over.faction.neutral'],
} as const;
