import type { GameOver, MeetingPlayer } from '../../net/meeting';
import { DECK_COPY as C, fill } from '../copy';
import { h } from '../dom';
import { cardName, lookName } from './cards';

/**
 * The main-mode end panel (GDD 3.1, 3.8, 3.17), under the role list: the look every seat walked as (a cover role's
 * borrowed one included), the cards left in the box (`over.undealt`) and an ejected Drifter's win (`over.alsoWon`).
 * Only the pieces the server sent are drawn, so a payload without them leaves the panel empty and out of the stack.
 */
export function renderMainOver(
  root: HTMLElement,
  over: GameOver,
  players: (id: string) => MeetingPlayer | undefined,
): void {
  const name = (id: string): string => players(id)?.name ?? 'Someone';
  const rows = Object.keys(over.roles)
    .map((id) => ({ id, look: lookName(players(id)?.look ?? '') }))
    .filter((r) => r.look !== '');
  if (rows.length > 0) {
    root.append(
      h('h2', { class: 'wdi-eyebrow' }, C['over.looks']),
      h(
        'ul',
        { class: 'wdi-over__list', 'data-testid': 'gameover-looks' },
        ...rows.map((r) =>
          h(
            'li',
            { 'data-testid': `gameover-look-${r.id}` },
            fill(C['over.looks.row'], { name: name(r.id), look: r.look }),
          ),
        ),
      ),
    );
  }
  if (over.undealt !== undefined) {
    root.append(
      h('h2', { class: 'wdi-eyebrow' }, C['over.undealt']),
      h(
        'p',
        { 'data-testid': 'gameover-undealt' },
        over.undealt.length === 0 ? C['over.undealt.none'] : over.undealt.map(cardName).join(', '),
      ),
    );
  }
  if (over.alsoWon !== undefined && over.alsoWon.length > 0) {
    root.append(
      h('h2', { class: 'wdi-eyebrow' }, C['over.alsoWon']),
      h(
        'ul',
        { class: 'wdi-over__list', 'data-testid': 'gameover-alsowon' },
        ...over.alsoWon.map((id) => h('li', {}, fill(C['over.alsoWon.row'], { name: name(id) }))),
      ),
    );
  }
}
