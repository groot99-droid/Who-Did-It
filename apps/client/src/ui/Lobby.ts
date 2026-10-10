import type { LobbySnapshot } from '../net/NetworkService';
import { MAX_PLAYERS, MIN_PLAYERS_TO_START } from '../net/protocol';
import { joinLink } from '../flags';
import { h, type Screen } from './dom';

export interface LobbyOptions {
  onStart(): void;
  onLeave(): void;
}

export interface LobbyScreen extends Screen {
  update(snapshot: LobbySnapshot): void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = h('textarea', { 'aria-hidden': 'true', readonly: true, style: 'position:fixed;opacity:0' });
    area.value = text;
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export function mountLobby(root: HTMLElement, opts: LobbyOptions): LobbyScreen {
  const codeText = h('span', { class: 'code', 'data-testid': 'party-code' });
  const copyBtn = h('button', { type: 'button' }, 'Copy invite link');
  const list = h('ul', { class: 'players', 'data-testid': 'player-list' });
  const count = h('span', { class: 'count' });
  const hint = h('p', { class: 'hint', 'aria-live': 'polite' });
  const start = h('button', { type: 'button', class: 'primary', 'data-testid': 'start' }, 'Start');
  const leave = h('button', { type: 'button' }, 'Leave');
  const actions = h('div', { class: 'row' }, start, leave);

  let snapshot: LobbySnapshot | null = null;
  let dialog: HTMLElement | null = null;

  const closeDialog = () => {
    dialog?.remove();
    dialog = null;
    start.focus();
  };

  const openDialog = () => {
    if (snapshot === null || dialog !== null) return;
    const confirm = h(
      'button',
      { type: 'button', class: 'primary', 'data-testid': 'confirm-start' },
      'Deal the roles',
    );
    const cancel = h('button', { type: 'button' }, 'Not yet');
    confirm.addEventListener('click', () => {
      closeDialog();
      opts.onStart();
    });
    cancel.addEventListener('click', closeDialog);
    dialog = h(
      'div',
      { class: 'scrim' },
      h(
        'div',
        { class: 'panel dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'confirm-title' },
        h('h2', { id: 'confirm-title' }, `Start with ${snapshot.players.length} players?`),
        h('p', {}, 'Roles are dealt at once and the party locks. Nobody can join after this.'),
        h('div', { class: 'row' }, confirm, cancel),
      ),
    );
    root.append(dialog);
    confirm.focus();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && dialog !== null) closeDialog();
  };
  document.addEventListener('keydown', onKey);

  start.addEventListener('click', openDialog);
  leave.addEventListener('click', opts.onLeave);
  copyBtn.addEventListener('click', () => {
    if (snapshot === null) return;
    void copyText(joinLink(snapshot.code)).then((ok) => {
      copyBtn.textContent = ok ? 'Link copied' : 'Copy failed';
      setTimeout(() => (copyBtn.textContent = 'Copy invite link'), 1800);
    });
  });

  const el = h(
    'section',
    { class: 'panel lobby', 'aria-labelledby': 'lobby-title' },
    h('h1', { id: 'lobby-title' }, 'Party code'),
    h('div', { class: 'row center' }, codeText, copyBtn),
    h('h2', {}, 'Players ', count),
    list,
    hint,
    actions,
  );
  root.append(el);

  const update = (next: LobbySnapshot) => {
    snapshot = next;
    codeText.textContent = next.code;
    count.textContent = `${next.players.length} / ${MAX_PLAYERS}`;
    list.replaceChildren(
      ...next.players.map((p) =>
        h(
          'li',
          { class: p.connected ? '' : 'away' },
          h('span', { class: 'pname' }, p.name),
          p.id === next.selfId && h('span', { class: 'tag' }, 'you'),
          p.id === next.leaderId && h('span', { class: 'tag lead' }, 'leader'),
          p.ready && h('span', { class: 'tag' }, 'ready'),
          !p.connected && h('span', { class: 'tag' }, 'away'),
        ),
      ),
    );
    const isLeader = next.selfId === next.leaderId;
    const enough = next.players.length >= MIN_PLAYERS_TO_START;
    start.hidden = !isLeader;
    start.toggleAttribute('disabled', !enough);
    hint.textContent = isLeader
      ? enough
        ? 'Everyone in? Start when the party is ready.'
        : `Need at least ${MIN_PLAYERS_TO_START} players to start (${next.players.length} here).`
      : 'Waiting for the leader to start.';
    if (dialog !== null && !enough) closeDialog();
  };

  return {
    update,
    destroy: () => {
      document.removeEventListener('keydown', onKey);
      dialog?.remove();
      el.remove();
    },
  };
}
