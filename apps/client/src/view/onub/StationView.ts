import onubBalance from '@wdi/content/data/balance.onub.json';
import { mulberry32 } from '@wdi/shared/rules';
import { fill } from '../../ui/copy';
import { ONUB_PREP_COPY as C } from '../../ui/copy/onubPrep';
import { h } from '../../ui/dom';
import type { PrepModel } from './PrepView';
import { cratesGame } from './minigames/crates';
import { pourGame } from './minigames/pour';
import { slideGame } from './minigames/slide';
import { stokeGame } from './minigames/stoke';

export type StationSpec = (typeof onubBalance.stations)[number];
export type MiniGameSpec = StationSpec['minigame'];
export type MiniKind = MiniGameSpec['kind'];

/** What a mini-game is given: its slot, its station's numbers and a local RNG for the bands. */
export interface MiniGameHost {
  root: HTMLElement;
  spec: MiniGameSpec;
  /** Local and unseeded by anything the server knows: the result never reaches the wire (GDD 3.11). */
  rng: () => number;
  /** The mini-game is done: the hand opens. Calling it twice is harmless. */
  onDone(): void;
}

export interface MiniGame {
  destroy(): void;
}

export type MiniGameFactory = (host: MiniGameHost) => MiniGame;

/**
 * Every mini-game by kind, from the four files of `view/onub/minigames/`; a kind with no entry gets the plain
 * tap below, so a room can always be played through.
 */
export const MINIGAMES: Partial<Record<MiniKind, MiniGameFactory>> = {
  crates: cratesGame,
  pour: pourGame,
  slide: slideGame,
  stoke: stokeGame,
};

/** The Done control shows once a seat has spent `timers.minigameAssistS` in a room (GDD 3.11). */
export const assistReady = (elapsedS: number): boolean => elapsedS >= onubBalance.timers.minigameAssistS;

const tapFactory: MiniGameFactory = (host) => {
  const button = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--primary', 'data-testid': 'minigame-tap' },
    C['onub.mini.assist'],
  );
  button.addEventListener('click', host.onDone);
  host.root.append(button);
  return { destroy: () => button.remove() };
};

export interface StationRoom {
  destroy(): void;
}

export interface StationOptions {
  onBack(): void;
  onCommit(): void;
  now(): number;
}

/**
 * One station room (GDD 3.11 "Evening Prep"): the mini-game as the gate, the Done control after
 * `timers.minigameAssistS`, then the hand and the commit. The room is rebuilt whenever the model enters it, so a
 * second visit restarts the mini-game with new bands.
 */
export function mountStation(
  root: HTMLElement,
  stationId: string,
  model: PrepModel,
  opts: StationOptions,
): StationRoom {
  const station = onubBalance.stations.find((s) => s.id === stationId);
  if (station === undefined) return { destroy: () => undefined };
  const committed = model.committed();
  const title = h(
    'h2',
    { class: 'wdi-display wdi-display--md' },
    fill(C['onub.station.room'], { station: station.name }),
  );
  const back = h(
    'button',
    {
      type: 'button',
      class: 'wdi-btn wdi-btn--ghost wdi-btn--sm',
      'data-testid': 'station-back',
      hidden: committed,
    },
    C['onub.station.back'],
  );
  back.addEventListener('click', opts.onBack);
  const gameSlot = h('div', { class: 'wdi-station__game', 'data-testid': `minigame-${stationId}` });
  const assist = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--sm', 'data-testid': 'minigame-assist', hidden: true },
    C['onub.mini.assist'],
  );
  const hint = h('p', { class: 'wdi-hint' });
  const hand = h('div', {
    class: 'wdi-panel wdi-stack wdi-stack--tight',
    'data-testid': 'hand',
    hidden: true,
  });
  const room = h(
    'section',
    {
      class: 'wdi-station wdi-stack',
      'data-testid': 'station-room',
      'data-station': stationId,
      style: `--wdi-station-enter: ${onubBalance.timers.stationTransitionS}s`,
    },
    h('div', { class: 'wdi-row wdi-row--between' }, title, back),
    hint,
    gameSlot,
    h('div', { class: 'wdi-row' }, assist),
    hand,
  );
  root.replaceChildren(room);

  let game: MiniGame | null = null;
  let assistTimer: number | null = null;
  const finish = () => {
    if (model.done()) return;
    model.finishMini();
    game?.destroy();
    game = null;
    gameSlot.hidden = true;
    assist.hidden = true;
    hint.textContent = C['onub.mini.done'];
    renderHand();
  };

  function renderHand() {
    const cards = model.hand();
    hand.hidden = cards.length === 0;
    const commit = h(
      'button',
      {
        type: 'button',
        class: 'wdi-btn wdi-btn--primary',
        'data-testid': 'prep-commit',
        disabled: model.picked() === null,
      },
      model.picked() === null ? C['onub.prep.pick'] : C['onub.prep.commit'],
    );
    commit.addEventListener('click', opts.onCommit);
    const buttons = cards.map((id) => {
      const card = onubBalance.cards[id as keyof typeof onubBalance.cards];
      const sabotage = card?.kind === 'sabotage';
      const button = h(
        'button',
        {
          type: 'button',
          class: `wdi-btn wdi-hand__card${sabotage ? ' wdi-hand__card--sabotage' : ''}`,
          'data-testid': `card-${id}`,
          'aria-pressed': model.picked() === id,
          'data-kind': card?.kind ?? 'good',
        },
        h('span', { class: 'wdi-strong' }, card?.name ?? id),
        h('span', { class: 'wdi-hint' }, card?.text ?? ''),
        h(
          'span',
          { class: 'wdi-chip wdi-chip--quiet' },
          sabotage ? C['onub.hand.sabotage'] : C['onub.hand.good'],
        ),
      );
      button.addEventListener('click', () => {
        if (model.pick(id)) renderHand();
      });
      return button;
    });
    hand.replaceChildren(
      h('h3', { class: 'wdi-display wdi-display--sm' }, C['onub.hand.title']),
      h('p', { class: 'wdi-hint' }, C['onub.hand.hint']),
      h('div', { class: 'wdi-hand' }, ...buttons),
      ...(model.wasRefused()
        ? [h('p', { class: 'wdi-field__msg wdi-field__msg--error', role: 'alert' }, C['onub.refuse.prep'])]
        : []),
      commit,
    );
  }

  if (model.done()) {
    gameSlot.hidden = true;
    hint.textContent = C['onub.mini.done'];
    renderHand();
  } else {
    game = (MINIGAMES[station.minigame.kind] ?? tapFactory)({
      root: gameSlot,
      spec: station.minigame,
      rng: mulberry32(Math.floor(Math.random() * 0x7fffffff)),
      onDone: finish,
    });
    assist.addEventListener('click', finish);
    assistTimer = window.setTimeout(() => {
      assist.hidden = model.done();
      if (!model.done()) hint.textContent = C['onub.mini.assist.hint'];
    }, onubBalance.timers.minigameAssistS * 1000);
  }

  return {
    destroy() {
      if (assistTimer !== null) window.clearTimeout(assistTimer);
      game?.destroy();
      room.remove();
    },
  };
}
