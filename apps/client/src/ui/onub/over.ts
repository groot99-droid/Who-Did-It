import onubBalance from '@wdi/content/data/balance.onub.json';
import type { OnubGameOver } from '../../net/meeting';
import { fill } from '../copy';
import { ONUB_NIGHT_COPY as C } from '../copy/onubNight';
import { h } from '../dom';
import { renderActLog } from './actlog';
import { cardName, PANTRY, roleName, stationName } from './rushModel';
import { slotLabel } from './slots';

type CopyId = keyof typeof C;

/** The headline of a winners row (one line per row id); an unknown row falls back to the row's own text. */
export function overHeadline(rowId: string): string {
  const id = `onub.over.row.${rowId}` as CopyId;
  if (id in C) return C[id];
  return onubBalance.winners.find((w) => w.id === rowId)?.text ?? C['onub.over.nobody'];
}

/**
 * The quick-mode end panel under the role list (GDD 3.11, round-5 contract 5.3): every seat's Role and Location
 * card dealt and held at dawn, the card it played, the Pantry, the piles with their lost cards, the Cloche, the
 * night's timeline and the vote arrows. `ui/GameOver.ts` calls it when `over.onub` is set.
 */
export function renderOnubOver(root: HTMLElement, over: OnubGameOver, names: (id: string) => string): void {
  const seatName = (i: number) => names(over.seats[i] ?? '');
  const slotName = (slot: string) => slotLabel(slot, seatName);

  const seats = over.seats.map((id) =>
    h(
      'li',
      {
        class: `wdi-roster__row${over.winnerIds.includes(id) ? ' is-winner' : ''}`,
        'data-testid': `gameover-seat-${id}`,
      },
      h(
        'span',
        { class: 'wdi-grow wdi-stack wdi-stack--tight' },
        h('span', { class: 'wdi-roster__name' }, names(id)),
        h(
          'span',
          { class: 'wdi-roster__meta', 'data-testid': `gameover-final-${id}` },
          fill(C['onub.over.seat.role'], {
            dealt: roleName(over.dealt[id] ?? ''),
            final: roleName(over.final[id] ?? ''),
          }),
        ),
        h(
          'span',
          { class: 'wdi-roster__meta', 'data-testid': `gameover-loc-${id}` },
          fill(C['onub.over.seat.loc'], {
            dealt: stationName(over.dealtLoc[id] ?? ''),
            final: stationName(over.finalLoc[id] ?? ''),
          }),
        ),
        h(
          'span',
          { class: 'wdi-roster__meta' },
          fill(C['onub.over.seat.card'], { card: cardName(over.prepCards[id] ?? '') }),
          over.prepAuto.includes(id) && ` (${C['onub.over.seat.auto']})`,
        ),
      ),
      over.winnerIds.includes(id) &&
        h('span', { class: 'wdi-chip wdi-chip--ready' }, C['onub.over.seat.won']),
    ),
  );

  const pantry = h(
    'section',
    { class: 'wdi-stack wdi-stack--tight', 'data-testid': 'gameover-pantry' },
    h('h2', { class: 'wdi-eyebrow' }, C['onub.over.pantry']),
    ...over.pantryRolesDealt.map((dealt, k) =>
      h(
        'p',
        { class: 'wdi-text', 'data-testid': `gameover-pantry-role-${k}` },
        fill(C['onub.over.pantry.role'], {
          n: k + 1,
          dealt: roleName(dealt),
          final: roleName(over.pantryRoles[k] ?? ''),
        }),
      ),
    ),
    ...over.pantryLocsDealt.map((dealt, k) =>
      h(
        'p',
        { class: 'wdi-text', 'data-testid': `gameover-pantry-loc-${k}` },
        fill(C['onub.over.pantry.loc'], {
          n: k + 1,
          dealt: stationName(dealt),
          final: stationName(over.pantryLocs[k] ?? ''),
        }),
      ),
    ),
  );

  const piles = h(
    'section',
    { class: 'wdi-stack wdi-stack--tight', 'data-testid': 'gameover-piles' },
    h('h2', { class: 'wdi-eyebrow' }, C['onub.over.piles']),
    ...onubBalance.stations.map((s) => {
      const pile = over.piles[s.id];
      const cards = pile?.cards.map(cardName).join(', ') ?? '';
      const lost =
        pile !== undefined && pile.lost.length > 0
          ? `; ${fill(C['onub.over.pile.lost'], { cards: pile.lost.map(cardName).join(', ') })}`
          : '';
      return h(
        'p',
        { class: 'wdi-text', 'data-testid': `gameover-pile-${s.id}` },
        `${fill(C['onub.over.pile'], { station: s.name, cards: cards === '' ? C['onub.over.pile.empty'] : cards })}${lost}. ${fill(C['onub.over.pile.net'], { net: pile?.net ?? 0 })}`,
      );
    }),
    h(
      'p',
      { class: 'wdi-muted' },
      fill(C['onub.over.ruin'], {
        weight: over.ruinWeight,
        state: over.ruined ? C['onub.over.ruin.yes'] : C['onub.over.ruin.no'],
      }),
    ),
    over.cloche !== '' &&
      h('p', { class: 'wdi-muted' }, fill(C['onub.over.cloche'], { card: slotName(over.cloche) })),
  );

  const arrows = Object.entries(over.votes).map(([from, to]) =>
    h(
      'li',
      {},
      fill(C['onub.over.vote'], {
        from: names(from),
        to: to === PANTRY ? C['onub.over.vote.pantry'] : names(to),
      }),
    ),
  );
  const votes = h(
    'section',
    { class: 'wdi-stack wdi-stack--tight' },
    h('h2', { class: 'wdi-eyebrow' }, C['onub.over.votes']),
    arrows.length === 0
      ? h('p', { class: 'wdi-hint' }, C['onub.over.vote.none'])
      : h('ul', { class: 'wdi-timeline' }, ...arrows),
  );

  const log = h('section', { class: 'wdi-stack wdi-stack--tight' });
  renderActLog(log, over.actLog, slotName);

  root.replaceChildren(
    h('h2', { class: 'wdi-eyebrow' }, C['onub.over.seats']),
    h('ul', { class: 'wdi-roster' }, ...seats),
    pantry,
    piles,
    log,
    votes,
  );
}
