import type { WorldFeed } from '../../net/world';
import { fill } from '../copy';
import { CIVIC_COPY as C } from '../copy/civic';
import { h } from '../dom';
import type { MeetingTab } from '../Meeting';
import { loadSceneNames } from '../../view/sceneNames';
import { paperRows } from './rows';

/**
 * The meeting's papers tab (UI.md 14.35.6, GDD 3.23): this seat's own Parish Seals, Indulgences and Blackmail Notices,
 * each with the act a meeting allows (`act.faith {kind}` presents one, `act.notice {op: 'show' | 'burn'}`). Every
 * seat sees the tab, empty or not, so its presence says nothing. The server decides every act.
 */
export function mountMeetingPapers(panel: HTMLElement, feed: WorldFeed): MeetingTab {
  let sceneName: (index: number) => string = () => '';
  let alive = true;
  void loadSceneNames().then((name) => {
    if (!alive) return;
    sceneName = name;
    shown = '';
    update();
  });
  const body = h('div', { class: 'wdi-stack', 'data-testid': 'papers' });
  panel.append(body);
  let shown = '';

  const button = (label: string, testid: string, enabled: boolean, onClick: () => void) => {
    const b = h(
      'button',
      {
        type: 'button',
        class: 'wdi-btn wdi-btn--sm wdi-btn--primary',
        'data-testid': testid,
        disabled: !enabled,
      },
      label,
    );
    b.addEventListener('click', onClick);
    return b;
  };
  const row = (what: HTMLElement[], act: HTMLElement, testid: string) =>
    h(
      'li',
      { class: 'wdi-m5b__row', 'data-testid': testid },
      h('div', { class: 'wdi-m5b__what' }, ...what),
      act,
    );
  const offer = (kind: 'seal' | 'indulgence', n: number) =>
    row(
      [
        h('span', { class: 'wdi-m5b__name' }, fill(C[`papers.${kind}`], { n })),
        h('span', { class: 'wdi-hint' }, C[`papers.${kind}.hint`]),
      ],
      button(C['papers.present'], `papers-present-${kind}`, true, () => feed.civic('act.faith', { kind })),
      `papers-${kind}`,
    );

  const update = () => {
    const look = feed.snapshot().find((p) => p.id === feed.selfId)?.look ?? '';
    const papers = paperRows(feed.notebook(), feed.inventory(), look, sceneName);
    const key = JSON.stringify(papers);
    if (key === shown) return;
    shown = key;
    const rows = [
      papers.seals > 0 ? offer('seal', papers.seals) : null,
      papers.indulgences > 0 ? offer('indulgence', papers.indulgences) : null,
      ...papers.notices.map((r) =>
        row(
          [h('span', { class: 'wdi-m5b__name' }, r.line)],
          h(
            'span',
            {},
            button(C['papers.show'], `papers-show-${r.id}`, true, () =>
              feed.civic('act.notice', { itemId: r.id, op: 'show' }),
            ),
            button(C['notice.burn'], `papers-burn-${r.id}`, r.canBurn, () =>
              feed.civic('act.notice', { itemId: r.id, op: 'burn' }),
            ),
          ),
          `papers-notice-${r.id}`,
        ),
      ),
    ].filter((r): r is HTMLLIElement => r !== null);
    body.replaceChildren(
      h('p', { class: 'wdi-hint' }, C['papers.lead']),
      rows.length === 0
        ? h('p', { class: 'wdi-hint' }, C['papers.none'])
        : h('ul', { class: 'wdi-m5b__list wdi-anim-list' }, ...rows),
    );
  };

  update();
  return {
    update,
    destroy: () => {
      alive = false;
      body.remove();
    },
  };
}
