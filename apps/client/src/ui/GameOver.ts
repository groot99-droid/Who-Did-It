import type { GameOver, MeetingPlayer } from '../net/meeting';
import { h, icon, type Screen } from './dom';
import { FACTION_LABEL, factionOf, winnerLine } from './meetingText';
import { roleTitle } from './RoleCard';

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

/**
 * The end-of-match reveal: the winner, every seat's role and faction, the server's summary. This is the one
 * place a faction is shown for other players (theme README, "Faction secrecy").
 */
export function mountGameOver(root: HTMLElement, opts: GameOverOptions): GameOverScreen {
  const countdown = h('p', { class: 'wdi-hint', 'data-testid': 'gameover-countdown', role: 'timer' });
  const rows = Object.entries(opts.over.roles).map(([id, roleId]) => {
    const player = opts.roster.find((p) => p.id === id);
    const faction = factionOf(roleId);
    return h(
      'li',
      {
        class: `wdi-roster__row${player?.alive === false ? ' is-dead' : ''}`,
        'data-testid': `gameover-role-${id}`,
      },
      h('span', { class: 'wdi-seat', 'aria-hidden': 'true' }, (player?.name ?? '?').charAt(0).toUpperCase()),
      h(
        'span',
        { class: 'wdi-grow' },
        h('span', { class: 'wdi-roster__name' }, player?.name ?? 'Someone', id === opts.selfId && ' (you)'),
        h('span', { class: 'wdi-roster__meta' }, roleTitle(roleId)),
      ),
      h(
        'span',
        { class: 'wdi-roster__tags' },
        h('span', { class: 'wdi-chip' }, icon(`icons/icon_faction_${faction}`), FACTION_LABEL[faction]),
      ),
    );
  });
  const leave = h('button', { type: 'button', class: 'wdi-btn wdi-btn--ghost' }, 'Leave party');
  leave.addEventListener('click', opts.onLeave);

  const el = h(
    'section',
    {
      class: 'wdi-panel wdi-stack wdi-over',
      'aria-labelledby': 'gameover-title',
      'data-testid': 'gameover',
    },
    h('p', { class: 'wdi-eyebrow' }, 'Game over'),
    h(
      'h1',
      { id: 'gameover-title', class: 'wdi-display wdi-display--lg', 'data-testid': 'gameover-winner' },
      winnerLine(opts.over.winner),
    ),
    opts.over.summary !== '' &&
      h('p', { class: 'wdi-muted', 'data-testid': 'gameover-summary' }, opts.over.summary),
    h('ul', { class: 'wdi-roster' }, ...rows),
    h('div', { class: 'wdi-row wdi-row--between' }, countdown, leave),
  );
  root.append(el);

  const setSeconds = (seconds: number) => {
    const text = `Back to the lobby in ${Math.max(0, Math.ceil(seconds))} s`;
    if (countdown.textContent !== text) countdown.textContent = text;
  };
  setSeconds(opts.seconds);
  return { setSeconds, destroy: () => el.remove() };
}
