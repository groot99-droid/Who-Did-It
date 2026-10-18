import balanceJson from '@wdi/content/data/balance.json';
import onubBalanceJson from '@wdi/content/data/balance.onub.json';
import type { LobbySnapshot, NetworkService } from '../net/NetworkService';
import { type GameModeId, MAX_PLAYERS, MIN_PLAYERS_TO_START, type NpcLevelId } from '../net/protocol';
import { joinLink } from '../flags';
import { LOBBY_COPY as C, fill } from './copy';
import { h, icon, type Screen } from './dom';
import { mountDeckEditor } from './lobby/DeckEditor';
import { mountDeckList } from './main/deckList';
import { mountMapPicker } from './lobby/MapPicker';

const { npc, players: seatRange } = balanceJson;
const { min: lengthMin, max: lengthMax } = onubBalanceJson.targetLengthMin;
const LEVELS = Object.keys(npc.difficulty) as NpcLevelId[];
const LEVEL_LABELS: Record<NpcLevelId, string> = {
  easy: C['lobby.npc.level.easy'],
  normal: C['lobby.npc.level.normal'],
  hard: C['lobby.npc.level.hard'],
};

/** The mode chip text (UI.md 14.13): the quick mode names its length and party size (A15). */
export function modeChipText(mode: GameModeId): string {
  return mode === 'onub'
    ? fill(C['lobby.mode.onub'], {
        min: lengthMin,
        max: lengthMax,
        players: fill(C['lobby.mode.players'], { min: seatRange.min, max: seatRange.max }),
      })
    : C['lobby.mode.main'];
}

/** The map row shows in the main mode only: the quick mode never walks a map (GDD 3.11, 3.13). */
export function showsMapRow(mode: GameModeId): boolean {
  return mode !== 'onub';
}

export interface LobbyOptions {
  /** The network the deck editor sends `lobby.settings {onubDeck}` through. */
  net: NetworkService;
  /**
   * Offer the leader the quick-mode toggle. Until ONUB v2 lands (round 5) a live lobby offers it only with
   * `?onub=1`; the mock lobby always does.
   */
  offerOnub: boolean;
  onStart(): void;
  onReady(ready: boolean): void;
  onLeave(): void;
  onMode(mode: GameModeId): void;
  onNpcDifficulty(level: NpcLevelId): void;
  onAddNpc(): void;
  onRemoveNpc(): void;
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
  const codeText = h('span', {
    class: 'wdi-display wdi-display--xl',
    style: 'letter-spacing: var(--wdi-tracking-code)',
    'data-testid': 'party-code',
  });
  const copyBtn = h('button', { type: 'button', class: 'wdi-btn wdi-btn--sm' }, C['lobby.copy']);
  const list = h('ul', { class: 'wdi-roster', 'data-testid': 'player-list' });
  const count = h('span', { class: 'wdi-muted', 'data-testid': 'player-count' });
  const hint = h('p', { class: 'wdi-hint', 'aria-live': 'polite' });
  const start = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--primary wdi-grow', 'data-testid': 'start' },
    C['lobby.start'],
  );
  const readyBtn = h(
    'button',
    { type: 'button', class: 'wdi-btn', 'data-testid': 'lobby-ready' },
    C['lobby.ready'],
  );
  const leave = h('button', { type: 'button', class: 'wdi-btn wdi-btn--ghost' }, C['lobby.leave']);
  const modeChip = h('span', { class: 'wdi-chip', 'data-testid': 'mode-chip' });
  const modeToggle = h('button', {
    type: 'button',
    class: 'wdi-btn wdi-btn--sm',
    'data-testid': 'mode-toggle',
  });
  const addNpc = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--sm', 'data-testid': 'add-npc' },
    C['lobby.npc.add'],
  );
  const removeNpc = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--sm wdi-btn--ghost', 'data-testid': 'remove-npc' },
    C['lobby.npc.remove'],
  );
  const difficulty = h(
    'select',
    { id: 'npc-difficulty', class: 'wdi-input', 'data-testid': 'npc-difficulty' },
    ...LEVELS.map((level) => h('option', { value: level }, LEVEL_LABELS[level])),
  );
  const difficultyHint = h(
    'p',
    { class: 'wdi-hint' },
    fill(C['lobby.npc.difficultyHint'], { n: npc.difficultyMinNpcs }),
  );
  const settingsBlock = h(
    'div',
    { class: 'wdi-stack', 'aria-label': C['lobby.settings'], 'data-testid': 'lobby-settings' },
    h('div', { class: 'wdi-row wdi-row--between' }, modeChip, modeToggle),
    h('div', { class: 'wdi-row' }, addNpc, removeNpc),
    h(
      'div',
      { class: 'wdi-field' },
      h('label', { class: 'wdi-label', for: 'npc-difficulty' }, C['lobby.npc.difficulty']),
      difficulty,
    ),
    difficultyHint,
  );
  // The main mode's map row (GDD 3.13, Session 5J) in its own slot under the settings, hidden in the quick mode.
  const mapSlot = h('div', { 'data-testid': 'lobby-map', hidden: true });
  settingsBlock.append(mapSlot);
  const mapPicker = mountMapPicker(mapSlot, opts.net);
  // The main mode's deck list (GDD 3.1, Session 5G) in its own slot under the settings, hidden in the quick mode.
  const deckListSlot = h('div', { 'data-testid': 'lobby-deck-list', hidden: true });
  settingsBlock.append(deckListSlot);
  const deckList = mountDeckList(deckListSlot, opts.net);
  // The quick-mode deck editor (GDD 3.11, Session 5C) under the settings.
  const deckEditor = mountDeckEditor(settingsBlock, opts.net);
  const actions = h('div', { class: 'wdi-row' }, start, readyBtn, leave);

  let snapshot: LobbySnapshot | null = null;
  let dialog: HTMLElement | null = null;

  const closeDialog = () => {
    dialog?.remove();
    dialog = null;
    start.focus();
  };

  const openDialog = () => {
    if (snapshot === null || dialog !== null) return;
    const waiting = snapshot.players
      .filter((p) => !p.ready && p.id !== snapshot?.leaderId)
      .map((p) => p.name);
    const confirm = h(
      'button',
      { type: 'button', class: 'wdi-btn wdi-btn--primary', 'data-testid': 'confirm-start' },
      C['lobby.confirm.go'],
    );
    const cancel = h(
      'button',
      { type: 'button', class: 'wdi-btn wdi-btn--ghost' },
      C['lobby.confirm.cancel'],
    );
    confirm.addEventListener('click', () => {
      closeDialog();
      opts.onStart();
    });
    cancel.addEventListener('click', closeDialog);
    dialog = h(
      'div',
      { class: 'wdi-scrim' },
      h(
        'div',
        {
          class: 'wdi-panel wdi-dialog',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'confirm-title',
        },
        h(
          'h2',
          { id: 'confirm-title', class: 'wdi-display wdi-display--md wdi-dialog__title' },
          fill(C['lobby.confirm.title'], { n: snapshot.players.length }),
        ),
        h('p', { class: 'wdi-dialog__body' }, C['lobby.confirm.body']),
        waiting.length > 0 &&
          h(
            'p',
            { class: 'wdi-hint', 'data-testid': 'not-ready' },
            fill(C['lobby.confirm.notReady'], { names: waiting.join(', ') }),
          ),
        h('div', { class: 'wdi-dialog__actions' }, confirm, cancel),
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
  readyBtn.addEventListener('click', () => {
    const me = snapshot?.players.find((p) => p.id === snapshot?.selfId);
    opts.onReady(!(me?.ready ?? false));
  });
  leave.addEventListener('click', opts.onLeave);
  modeToggle.addEventListener('click', () => {
    if (snapshot !== null) opts.onMode(snapshot.settings.mode === 'onub' ? 'main' : 'onub');
  });
  difficulty.addEventListener('change', () => opts.onNpcDifficulty(difficulty.value as NpcLevelId));
  addNpc.addEventListener('click', opts.onAddNpc);
  removeNpc.addEventListener('click', opts.onRemoveNpc);
  copyBtn.addEventListener('click', () => {
    if (snapshot === null) return;
    void copyText(joinLink(snapshot.code)).then((ok) => {
      copyBtn.textContent = ok ? C['lobby.copied'] : C['lobby.copyFailed'];
      setTimeout(() => (copyBtn.textContent = C['lobby.copy']), 1800);
    });
  });

  const el = h(
    'section',
    { class: 'wdi-panel wdi-stack', 'aria-labelledby': 'lobby-title' },
    h('p', { class: 'wdi-eyebrow', id: 'lobby-title' }, C['lobby.code']),
    h('div', { class: 'wdi-row wdi-row--between' }, codeText, copyBtn),
    settingsBlock,
    h('h2', { class: 'wdi-subtitle' }, `${C['lobby.players']} `, count),
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
          { class: `wdi-roster__row${p.connected ? '' : ' is-away'}` },
          h('span', { class: 'wdi-seat', 'aria-hidden': 'true' }, p.name.charAt(0).toUpperCase()),
          h('span', { class: 'wdi-grow' }, h('span', { class: 'wdi-roster__name' }, p.name)),
          h(
            'span',
            { class: 'wdi-roster__tags' },
            p.id === next.selfId && h('span', { class: 'wdi-chip' }, C['lobby.tag.you']),
            p.id === next.leaderId && h('span', { class: 'wdi-chip wdi-chip--lead' }, C['lobby.tag.leader']),
            p.ready &&
              h(
                'span',
                { class: 'wdi-chip wdi-chip--ready' },
                icon('glyphs/glyph_check'),
                C['lobby.tag.ready'],
              ),
            !p.connected &&
              h(
                'span',
                { class: 'wdi-chip wdi-chip--quiet' },
                icon('glyphs/glyph_clock'),
                C['lobby.tag.away'],
              ),
          ),
        ),
      ),
    );
    const isLeader = next.selfId === next.leaderId;
    const me = next.players.find((p) => p.id === next.selfId);
    readyBtn.textContent = me?.ready ? C['lobby.notReady'] : C['lobby.ready'];
    start.hidden = !isLeader;
    const { mode, npcSeats, npcDifficulty } = next.settings;
    modeChip.textContent = modeChipText(mode);
    // Without the offer the toggle still shows in quick mode, so a leader can always return to the main mode.
    modeToggle.hidden = !isLeader || (!opts.offerOnub && mode !== 'onub');
    modeToggle.textContent = mode === 'onub' ? C['lobby.mode.toMain'] : C['lobby.mode.toOnub'];
    addNpc.hidden = !isLeader || next.players.length >= MAX_PLAYERS;
    removeNpc.hidden = !isLeader || npcSeats === 0;
    difficulty.value = npcDifficulty;
    difficulty.disabled = !isLeader || npcSeats < npc.difficultyMinNpcs;
    difficultyHint.hidden = npcSeats >= npc.difficultyMinNpcs;
    // Start needs one human (GDD 3.12); the server fills the seats below the minimum at Start.
    hint.textContent = !isLeader
      ? C['lobby.hint.wait']
      : next.players.length < MIN_PLAYERS_TO_START
        ? fill(C['lobby.hint.fill'], { min: MIN_PLAYERS_TO_START })
        : C['lobby.hint.go'];
    mapPicker.update(next);
    // Empty (the pre-seed stub) the slot stays hidden too, so it adds no gap to the settings stack.
    mapSlot.hidden = !showsMapRow(mode) || mapSlot.childElementCount === 0;
    deckList.update(next);
    // Empty (the pre-seed stub) the slot stays hidden too, so it adds no gap to the settings stack.
    deckListSlot.hidden = mode === 'onub' || deckListSlot.childElementCount === 0;
    deckEditor.update(next);
  };

  return {
    update,
    destroy: () => {
      document.removeEventListener('keydown', onKey);
      dialog?.remove();
      mapPicker.destroy();
      deckList.destroy();
      deckEditor.destroy();
      el.remove();
    },
  };
}
