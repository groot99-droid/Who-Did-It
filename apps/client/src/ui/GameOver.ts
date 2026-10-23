import type { GameOver, MeetingPlayer } from '../net/meeting';
import { fill } from './copy';
import { MEETING_COPY as C } from './copy/meeting';
import { h, icon, type Screen } from './dom';
import { renderMainOver } from './main/overMain';
import { FACTION_LABEL, factionOf, winnerLine } from './meetingText';
import { overHeadline, renderOnubOver } from './onub/over';
import { roleTitle } from './RoleCard';
import { renderAddFriend } from './table/addFriend';
import './table.css';

export interface GameOverOptions {
  over: GameOver;
  roster: MeetingPlayer[];
  selfId: string;
  /** Seconds until the room returns to the lobby. */
  seconds: number;
  onLeave(): void;
}

export interface GameOverScreen extends Screen {
  /** Sets the countdown shown under the list. */
  setSeconds(seconds: number): void;
}

/** Did this seat win? Quick mode lists the winners; the main mode judges the faction against the winner id. */
function won(over: GameOver, id: string, roleId: string): boolean {
  if (over.onub !== undefined) return over.onub.winnerIds.includes(id);
  const faction = factionOf(roleId);
  return (
    (over.winner === 1 && faction === 'village') ||
    (over.winner === 2 && faction === 'cabal') ||
    (over.winner === 3 && roleId === 'drifter')
  );
}

/**
 * The end-of-match reveal: the winner, every seat's role and faction, the server's summary. This is the one
 * place a faction is shown for other players (theme README, "Faction secrecy"). Quick mode adds the end panel
 * of `ui/onub/over.ts` (Session 5D) under the role list.
 */
export function mountGameOver(root: HTMLElement, opts: GameOverOptions): GameOverScreen {
  const { over } = opts;
  const onub = over.onub;
  const mode = onub === undefined ? 'main' : 'onub';
  const nameOf = (id: string) => opts.roster.find((p) => p.id === id)?.name ?? 'Someone';
  const countdown = h('p', { class: 'wdi-hint', 'data-testid': 'gameover-countdown', role: 'timer' });
  const rows = Object.entries(over.roles).map(([id, finalRole]) => {
    const player = opts.roster.find((p) => p.id === id);
    const faction = factionOf(finalRole, mode);
    const winner = won(over, id, finalRole);
    const tag = id === opts.selfId ? (winner ? C['over.you.won'] : C['over.you.lost']) : null;
    return h(
      'li',
      {
        class: `wdi-roster__row${player?.alive === false ? ' is-dead' : ''}${onub !== undefined && winner ? ' is-winner' : ''}`,
        'data-testid': `gameover-role-${id}`,
        ...(onub !== undefined && winner ? { 'data-winner': 'true' } : {}),
      },
      h('span', { class: 'wdi-seat', 'aria-hidden': 'true' }, (player?.name ?? '?').charAt(0).toUpperCase()),
      h(
        'span',
        { class: 'wdi-grow' },
        h(
          'span',
          { class: 'wdi-roster__name' },
          player?.name ?? 'Someone',
          id === opts.selfId && ` ${C['over.you']}`,
        ),
        h('span', { class: 'wdi-roster__meta' }, roleTitle(finalRole, mode)),
      ),
      h(
        'span',
        { class: 'wdi-roster__tags' },
        tag !== null &&
          h('span', { class: `wdi-chip ${winner ? 'wdi-chip--ready' : 'wdi-chip--quiet'}` }, tag),
        h('span', { class: 'wdi-chip' }, icon(`icons/icon_faction_${faction}`), FACTION_LABEL[faction]),
        // Round 7: a seat that carries a profile can be added as a friend; never your own row.
        id === opts.selfId ? null : renderAddFriend(player?.profile ?? '', player?.name ?? 'Someone'),
      ),
    );
  });
  const leave = h('button', { type: 'button', class: 'wdi-btn wdi-btn--ghost' }, C['over.leave']);
  const onubPanel = h('div', { class: 'wdi-stack wdi-over__onub' });
  if (onub !== undefined) renderOnubOver(onubPanel, onub, nameOf);
  // Main mode: looks, the undealt cards and `alsoWon` (GDD 3.1, 3.17, Session 5G's `ui/main/overMain.ts`).
  const mainPanel = h('div', { class: 'wdi-stack wdi-over__main', 'data-testid': 'gameover-main' });
  if (onub === undefined) renderMainOver(mainPanel, over, (id) => opts.roster.find((p) => p.id === id));
  leave.addEventListener('click', opts.onLeave);

  const el = h(
    'section',
    {
      class: 'wdi-panel wdi-stack wdi-over wdi-table wdi-glass-panel',
      'aria-labelledby': 'gameover-title',
      'data-testid': 'gameover',
    },
    h('p', { class: 'wdi-eyebrow' }, C['over.title']),
    h(
      'h1',
      { id: 'gameover-title', class: 'wdi-display wdi-display--lg', 'data-testid': 'gameover-winner' },
      // Quick mode: the headline is the winners row's own line, never the `Winner` enum (round-4 bug).
      onub === undefined ? winnerLine(over.winner) : overHeadline(onub.rowId),
    ),
    over.summary !== '' && h('p', { class: 'wdi-muted', 'data-testid': 'gameover-summary' }, over.summary),
    h('h2', { class: 'wdi-eyebrow' }, C['over.roles']),
    h('ul', { class: 'wdi-roster' }, ...rows),
    onub !== undefined && onubPanel,
    // Empty (the pre-seed stub) the panel stays out, so it adds no gap to the stack.
    onub === undefined && mainPanel.childElementCount > 0 && mainPanel,
    h('div', { class: 'wdi-row wdi-row--between' }, countdown, leave),
  );
  root.append(el);

  const setSeconds = (seconds: number) => {
    const text = fill(C['over.lobby'], { s: Math.max(0, Math.ceil(seconds)) });
    if (countdown.textContent !== text) countdown.textContent = text;
  };
  setSeconds(opts.seconds);
  return { setSeconds, destroy: () => el.remove() };
}
