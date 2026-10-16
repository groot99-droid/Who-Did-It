import { TICK_RATE } from '@wdi/shared/constants';
import roles from '@wdi/content/data/roles.json';
import type { ChatLine, MeetingStart, VoteResult } from '../net/meeting';
import { roleTitle } from './RoleCard';

// The meeting and game-over lines. Placeholder wording until the copy deck (docs/UI.md 14) lands; the
// functions are the seam, so the deck replaces strings here and nowhere else.

type NameOf = (playerId: string) => string;

/** `Phase` ids that matter to the meeting screen (schema `Phase`, mirrored as the router mirrors lobby). */
export const MEETING_PHASE = { discussion: 7, vote: 8, reveal: 9, gameOver: 12 } as const;

export const PHASE_LABEL: Record<number, string> = {
  [MEETING_PHASE.discussion]: 'Discuss',
  [MEETING_PHASE.vote]: 'Vote',
  [MEETING_PHASE.reveal]: 'Reveal',
};

/** "Hana reported Gus's body" / "Hana rang the bell". */
export function reasonLine(start: MeetingStart | null, nameOf: NameOf): string {
  if (start === null) return 'A meeting has been called';
  const caller = nameOf(start.callerId);
  if (start.reason === 'bell') return `${caller} rang the bell`;
  if (start.reason === 'body') {
    return start.bodyOf === undefined
      ? `${caller} reported a body`
      : `${caller} reported ${nameOf(start.bodyOf)}'s body`;
  }
  return 'Roll call: someone is missing';
}

/** m:ss from ticks left; the placeholder when no clock runs. */
export function clockText(ticksLeft: number | null): string {
  if (ticksLeft === null || ticksLeft < 0) return '-:--';
  const s = Math.ceil(ticksLeft / TICK_RATE);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The role line of the reveal: who left and what they were, or that nobody did. */
export function ejectionLine(result: VoteResult, nameOf: NameOf): string {
  if (result.ejectedId === undefined) return 'Nobody was ejected.';
  const who = nameOf(result.ejectedId);
  return result.role === undefined
    ? `${who} was ejected.`
    : `${who} was ejected. They were the ${roleTitle(result.role)}.`;
}

/** Who is speaking in a chat line, with the channel spelled out where it matters. */
export function chatTag(line: ChatLine): string {
  return line.channel === 'ghost' ? 'ghost' : line.channel === 'cabal' ? 'cabal' : '';
}

/** `Winner` ids of the schema: 0 none, 1 village, 2 cabal, 3 drifter, 4 debtor, 5 nobody. */
const WINNER_LINE = [
  'The match ended',
  'The Village wins',
  'The Cabal wins',
  'The Drifter wins',
  'The Debtor wins',
  'Nobody wins',
];

export function winnerLine(winner: number): string {
  return WINNER_LINE[winner] ?? WINNER_LINE[0] ?? 'The match ended';
}

/** The faction a role belongs to (`roles.json`), shown only at the end-of-match reveal. */
export function factionOf(roleId: string): 'village' | 'cabal' | 'neutral' {
  const faction = (roles.roles as Record<string, { faction?: string } | undefined>)[roleId]?.faction;
  return faction === 'cabal' || faction === 'neutral' ? faction : 'village';
}

export const FACTION_LABEL = { village: 'Village', cabal: 'Cabal', neutral: 'Neutral' } as const;
