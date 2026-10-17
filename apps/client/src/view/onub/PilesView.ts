import onubBalance from '@wdi/content/data/balance.onub.json';
import type { OnubBoardView } from '../../net/onub';
import { h } from '../../ui/dom';

/**
 * The prep piles of the public board (GDD 3.11): the Kitchen's prepReveal board and, `compact`, the Morning
 * Rush board. Pre-seeded as a plain list of station names and card ids; Session 5C draws the real board behind
 * this signature (5D calls it on the Rush).
 */
export function renderPiles(root: HTMLElement, board: OnubBoardView, opts: { compact: boolean }): void {
  const rows = onubBalance.stations.map((s) =>
    h('li', {}, `${s.name}: ${(board.piles[s.id]?.cards ?? []).join(', ')}`),
  );
  root.replaceChildren(
    h('ul', { class: opts.compact ? 'wdi-stack wdi-stack--tight' : 'wdi-stack' }, ...rows),
  );
}
