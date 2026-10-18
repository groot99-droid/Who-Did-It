import onubBalance from '@wdi/content/data/balance.onub.json';
import { fill } from '../../ui/copy';
import { ONUB_PREP_COPY as C } from '../../ui/copy/onubPrep';
import { h } from '../../ui/dom';
import type { OnubBoardView, OnubPileView } from '../../net/onub';

const CARDS = onubBalance.cards as Record<string, { name: string; kind: string; text: string } | undefined>;

/** A card as the public board shows it: its name, with `data-kind` so the theme can crack a sabotage frame. */
export function cardChip(cardId: string): HTMLElement {
  const card = CARDS[cardId];
  const sabotage = card?.kind === 'sabotage';
  return h(
    'li',
    {
      class: `wdi-chip wdi-pile__card${sabotage ? ' wdi-pile__card--sabotage' : ''}`,
      'data-kind': card?.kind ?? 'good',
      'data-testid': `pile-card-${cardId}`,
      title: card?.text ?? '',
    },
    card?.name ?? cardId,
    h(
      'span',
      { class: 'wdi-sr-only' },
      ` ${sabotage ? C['onub.board.card.sabotage'] : C['onub.board.card.good']}`,
    ),
  );
}

function pileSection(stationId: string, pile: OnubPileView | undefined, compact: boolean): HTMLElement {
  const station = onubBalance.stations.find((s) => s.id === stationId);
  const view = pile ?? { cards: [], lost: 0, net: 0, underMixed: false };
  const tracksUnderMix = station !== undefined && 'underMixBelow' in station;
  return h(
    'section',
    { class: `wdi-pile${compact ? ' wdi-pile--compact' : ''}`, 'data-testid': `pile-${stationId}` },
    h('h3', { class: 'wdi-pile__name' }, fill(C['onub.board.pile'], { station: station?.name ?? stationId })),
    view.cards.length === 0
      ? h('p', { class: 'wdi-hint' }, C['onub.board.empty'])
      : h('ul', { class: 'wdi-pile__cards' }, ...view.cards.map(cardChip)),
    view.lost > 0 &&
      h(
        'p',
        { class: 'wdi-hint wdi-pile__lost', 'data-testid': `pile-lost-${stationId}` },
        fill(view.lost === 1 ? C['onub.board.lost'] : C['onub.board.lost.many'], { count: view.lost }),
      ),
    h('p', { class: 'wdi-hint wdi-pile__net' }, fill(C['onub.board.net'], { net: view.net })),
    tracksUnderMix &&
      h(
        'p',
        {
          class: 'wdi-chip wdi-chip--danger wdi-pile__flag',
          'data-testid': 'under-mix-flag',
          hidden: !view.underMixed,
        },
        C['onub.board.underMix'],
      ),
  );
}

/**
 * The prep piles of the public board (GDD 3.11 "The crime scenes"): the Kitchen's prepReveal board and, `compact`,
 * the Morning Rush board (5D mounts it inside its own `rush-board`). Each pile shows its cards in the board's
 * order, how many the thaw took, its net weight and the Mixer's caution flag; the ruin line and the perk line
 * sit above them. It shows where sabotage happened and never who played it.
 */
export function renderPiles(root: HTMLElement, board: OnubBoardView, opts: { compact: boolean }): void {
  root.replaceChildren(
    h(
      'div',
      { class: `wdi-stack${opts.compact ? ' wdi-stack--tight' : ''}` },
      h(
        'p',
        {
          class: 'wdi-chip wdi-chip--danger wdi-pile__ruin',
          'data-testid': 'ruin-banner',
          hidden: !board.ruined,
        },
        C['onub.board.ruin'],
      ),
      h(
        'p',
        { class: 'wdi-hint', 'data-testid': 'ruin-weight' },
        board.ruined ? fill(C['onub.board.ruin.weight'], { n: board.ruinWeight }) : C['onub.board.ok'],
      ),
      board.perk && h('p', { class: 'wdi-hint', 'data-testid': 'perk-line' }, C['onub.board.perk']),
      h(
        'div',
        { class: 'wdi-pile__grid' },
        ...onubBalance.stations.map((s) => pileSection(s.id, board.piles[s.id], opts.compact)),
      ),
    ),
  );
}
