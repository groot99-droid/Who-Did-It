import onubBalance from '@wdi/content/data/balance.onub.json';
import { M5B_COPY as C } from '../../ui/copy/m5b';
import { h } from '../../ui/dom';
import { MINIGAMES, type MiniGame, type MiniGameFactory, type MiniGameSpec } from '../onub/StationView';
import { answerOf, bandRng, type MinigameAnswer } from './answers';
import type { MinigameKind } from '@wdi/shared/protocol';

export interface MinigameOpen {
  taskId: string;
  kind: MinigameKind;
  /** `S2C.minigameStart.public`: the board, as the server generated it. */
  public: unknown;
  /** Seconds before the Done control appears (`minigames.json` `assistS`). */
  assistS: number;
  /** A Cabal seat's fake task: the same board, the same answer, no `taskBar`. The copy is the same line. */
  fake?: boolean;
}

export interface MinigameModal {
  readonly root: HTMLElement;
  close(): void;
}

const specOf = (kind: MinigameKind): MiniGameSpec =>
  onubBalance.stations.find((s) => s.minigame.kind === kind)!.minigame;

/**
 * The main-mode station mini-game as a DOM modal (UI.md 14.19.6): the ONUB widget of `kind` inside a dialog, fed the
 * server's board, with the assist control after `assistS` and a way to step away. When the widget reports done the
 * modal sends the answer once through `send` and closes. `factory` is a seam for tests; it defaults to the ONUB widget.
 */
export function openMinigame(
  parent: HTMLElement,
  open: MinigameOpen,
  send: (taskId: string, answer: MinigameAnswer) => void,
  onClose: () => void,
  now: () => number = () => performance.now(),
  factory: MiniGameFactory | undefined = MINIGAMES[open.kind],
): MinigameModal {
  const stage = h('div', { class: 'wdi-m5b__stage', 'data-testid': 'minigame-stage' });
  const assist = h(
    'button',
    {
      type: 'button',
      class: 'wdi-btn wdi-btn--sm',
      hidden: true,
      'data-testid': 'minigame-assist',
      title: C['mini.assist.hint'],
    },
    C['mini.assist'],
  );
  const cancel = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--sm wdi-btn--ghost', 'data-testid': 'minigame-cancel' },
    C['mini.cancel'],
  );
  const status = h('p', { class: 'wdi-hint', 'data-testid': 'minigame-status', 'aria-live': 'polite' });
  const root = h(
    'div',
    {
      class: 'wdi-root wdi-m5b__modal',
      role: 'dialog',
      'aria-modal': 'true',
      'data-testid': 'minigame',
      'data-kind': open.kind,
      'data-state': 'play',
    },
    h(
      'div',
      { class: 'wdi-m5b__panel wdi-m5b__panel--modal' },
      h('header', { class: 'wdi-m5b__head' }, h('h2', {}, C[open.fake ? 'mini.fake' : 'mini.title']), cancel),
      stage,
      status,
      h('div', { class: 'wdi-m5b__foot' }, assist),
    ),
  );
  parent.append(root);

  let widget: MiniGame | null = null;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    root.dataset.state = 'sent';
    status.textContent = C['mini.sent'];
    send(open.taskId, answerOf(open.kind, open.public));
    window.setTimeout(close, 400);
  };
  const close = () => {
    window.clearInterval(timer);
    widget?.destroy();
    widget = null;
    root.remove();
    onClose();
  };
  if (factory)
    widget = factory({
      root: stage,
      spec: specOf(open.kind),
      rng: bandRng(open.kind, open.public),
      onDone: finish,
    });
  const born = now();
  const timer = window.setInterval(() => {
    assist.hidden = (now() - born) / 1000 < open.assistS || finished;
  }, 500);
  assist.addEventListener('click', finish);
  cancel.addEventListener('click', () => {
    if (!finished) close();
  });
  return { root, close };
}
