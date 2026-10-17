import { TICK_RATE } from '@wdi/shared/constants';
import roles from '@wdi/content/data/roles.json';
import onubBalance from '@wdi/content/data/balance.onub.json';
import onubRoles from '@wdi/content/data/roles.onub.json';
import type { ChatLine, ClaimRow, MatchMode, MeetingStart, OnubGameOver, VoteResult } from '../net/meeting';
import { SKIP } from '../net/meeting';
import { fill } from './copy';
import { MEETING_COPY as C } from './copy/meeting';
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

/** "Hana reported Gus's body" / "Hana rang the bell" / the dawn line. */
export function reasonLine(start: MeetingStart | null, nameOf: NameOf): string {
  if (start === null) return C['meeting.reason.none'];
  if (start.reason === 'dawn') return C['meeting.reason.dawn'];
  const caller = nameOf(start.callerId);
  if (start.reason === 'bell') return fill(C['meeting.reason.bell'], { caller });
  if (start.reason === 'body') {
    return start.bodyOf === undefined
      ? fill(C['meeting.reason.bodyUnknown'], { caller })
      : fill(C['meeting.reason.body'], { caller, victim: nameOf(start.bodyOf) });
  }
  return C['meeting.reason.missing'];
}

/** m:ss from ticks left; the placeholder when no clock runs. */
export function clockText(ticksLeft: number | null): string {
  if (ticksLeft === null || ticksLeft < 0) return '-:--';
  const s = Math.ceil(ticksLeft / TICK_RATE);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Every seat the vote turned out: the quick-mode `outs`, else the one `ejectedId`. */
export function outsOf(result: VoteResult): string[] {
  if (result.outs !== undefined) return result.outs;
  return result.ejectedId === undefined ? [] : [result.ejectedId];
}

/** Why nobody left: no votes at all, a Skip plurality, or a tie. */
export function noEjectionLine(result: VoteResult, mode: MatchMode = 'main'): string {
  if (mode === 'onub') return C['reveal.outs.none'];
  const ranked = Object.entries(result.tally).sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (top === undefined) return C['reveal.none.empty'];
  if (top[0] === SKIP) return C['reveal.none.skip'];
  return C['reveal.none.tie'];
}

/** The reveal's lines: who left and what they were, or why nobody did. */
export function ejectionLines(result: VoteResult, nameOf: NameOf, mode: MatchMode = 'main'): string[] {
  const outs = outsOf(result);
  if (outs.length === 0) return [noEjectionLine(result, mode)];
  const roleOf = (id: string): string | undefined =>
    result.roles?.[id] ?? (id === result.ejectedId ? result.role : undefined);
  const named = (id: string) => {
    const role = roleOf(id);
    return role === undefined
      ? null
      : fill(C['reveal.role'], { name: nameOf(id), role: roleTitle(role, mode) });
  };
  const head =
    mode === 'onub'
      ? fill(outs.length === 1 ? C['reveal.outs.one'] : C['reveal.outs'], {
          names: joinNames(outs.map(nameOf)),
        })
      : fill(C['reveal.ejected'], { name: nameOf(outs[0] ?? '') });
  return [head, ...outs.map(named).filter((l): l is string => l !== null)].map((line) => `${line}.`);
}

export function ejectionLine(result: VoteResult, nameOf: NameOf, mode: MatchMode = 'main'): string {
  return ejectionLines(result, nameOf, mode).join(' ');
}

/** Quick mode: the seats that did not vote, or null when everyone did. */
export function abstainedLine(result: VoteResult, nameOf: NameOf): string | null {
  const names = (result.abstained ?? []).map(nameOf);
  return names.length === 0 ? null : fill(C['reveal.abstained'], { names: joinNames(names) });
}

/** Who is speaking in a chat line, with the channel spelled out where it matters. */
export function chatTag(line: ChatLine): string {
  return line.channel === 'ghost' ? 'ghost' : line.channel === 'cabal' ? 'cabal' : '';
}

/** `Winner` ids of the schema: 0 none, 1 village, 2 cabal, 3 drifter, 4 debtor, 5 nobody. */
const WINNER_LINE = [
  C['over.none'],
  C['over.village'],
  C['over.cabal'],
  C['over.drifter'],
  C['over.debtor'],
  C['over.nobody'],
];

export function winnerLine(winner: number): string {
  return WINNER_LINE[winner] ?? C['over.none'];
}

type RoleRow = { faction?: string };
const factionRows = (mode: MatchMode) =>
  (mode === 'onub' ? onubRoles.roles : roles.roles) as Record<string, RoleRow | undefined>;

/** The faction a role belongs to (`roles.json`, or `roles.onub.json` in quick mode), shown only at the end. */
export function factionOf(roleId: string, mode: MatchMode = 'main'): 'village' | 'cabal' | 'neutral' {
  const faction = factionRows(mode)[roleId]?.faction;
  return faction === 'cabal' || faction === 'neutral' ? faction : 'village';
}

export const FACTION_LABEL = {
  village: C['over.faction.village'],
  cabal: C['over.faction.cabal'],
  neutral: C['over.faction.neutral'],
} as const;

// --- quick mode: claims ---------------------------------------------------------------------------

/** Acts that show the actor something, so their claim may name a seat and the role seen (GDD 3.11). */
const REVEALING_ACTS = new Set([
  'onub.peekPlate',
  'onub.peekDead',
  'onub.take',
  'onub.check',
  'onub.readLedger',
]);

/** The roles a claim chip is offered for, in `roles.onub.json` order (V1 roles only). */
export function claimRoleIds(): string[] {
  return Object.entries(onubRoles.roles)
    .filter(([, r]) => r.ships === 'V1')
    .map(([id]) => id);
}

/** Does this role's night act show the actor something (so the claim form asks for a seat and a role)? */
export function isRevealingRole(roleId: string): boolean {
  const window = onubBalance.windows.find((w) => w.role === roleId);
  return window?.acts.some((a) => REVEALING_ACTS.has(a.act)) ?? false;
}

/** "I was the Sin-Eater: Hana's loaf was Mourner" and its shorter forms. */
export function claimLine(claim: ClaimRow, nameOf: NameOf): string {
  const role = roleTitle(claim.roleId, 'onub');
  const saw = claim.sawRoleId === '' ? '' : roleTitle(claim.sawRoleId, 'onub');
  if (saw === '') return fill(C['meeting.claim.line'], { role });
  if (claim.targetId === '') return fill(C['meeting.claim.line.sawDead'], { role, saw });
  return fill(C['meeting.claim.line.saw'], { role, saw, name: nameOf(claim.targetId) });
}

// --- quick mode: the end screen -------------------------------------------------------------------

/** Names a swap-log slot: a plate by its owner (`onub.plates`), anything else is a dead loaf. */
const slotOwner = (slot: string, onub: OnubGameOver, nameOf: NameOf): string | null => {
  const seat = onub.plates[slot];
  return seat === undefined ? null : nameOf(seat);
};

/**
 * One swap-log row as a sentence, e.g. "The Cutpurse took Hana's loaf". The window's role is the actor's
 * dealt role, so the actor's own plate is the plate of the seat dealt that role; the other slot is the one
 * the sentence is about. The acts that only look (peeks, check, ledger) never reach the log.
 */
export function swapLogLine(
  entry: OnubGameOver['swapLog'][number],
  onub: OnubGameOver,
  nameOf: NameOf,
): string {
  const role = roleTitle(entry.roleId, 'onub');
  const names = entry.slots.map((s) => slotOwner(s, onub, nameOf));
  const dead = C['over.swap.deadLoaf'];
  const actorSeats = new Set(
    Object.entries(onub.dealt)
      .filter(([, r]) => r === entry.roleId)
      .map(([id]) => id),
  );
  const isActorSlot = (slot: string) => {
    const seat = onub.plates[slot];
    return seat !== undefined && actorSeats.has(seat);
  };
  if (entry.act === 'onub.take' || entry.act === 'onub.swapDead') {
    const other = entry.slots.find((s) => !isActorSlot(s)) ?? entry.slots[1] ?? '';
    const name = slotOwner(other, onub, nameOf);
    if (entry.act === 'onub.take') return fill(C['over.swap.take'], { role, name: name ?? dead });
    const mine = entry.slots.find(isActorSlot) ?? entry.slots.find((slot) => onub.plates[slot] !== undefined);
    return fill(C['over.swap.swapDead'], {
      role,
      name: (mine === undefined ? null : slotOwner(mine, onub, nameOf)) ?? '?',
    });
  }
  if (entry.act === 'onub.swapPlates' && names[0] !== null && names[1] !== null) {
    return fill(C['over.swap.swap'], { role, a: names[0] ?? dead, b: names[1] ?? dead });
  }
  return fill(C['over.swap.other'], { role, a: names[0] ?? dead, b: names[1] ?? dead });
}

/** One "A voted B" line per seat; a seat with no vote abstained. */
export function voteLines(onub: OnubGameOver, seatIds: readonly string[], nameOf: NameOf): string[] {
  return seatIds.map((id) => {
    const to = onub.votes[id];
    return to === undefined
      ? fill(C['over.votes.abstained'], { from: nameOf(id) })
      : fill(C['over.votes.line'], { from: nameOf(id), to: nameOf(to) });
  });
}
