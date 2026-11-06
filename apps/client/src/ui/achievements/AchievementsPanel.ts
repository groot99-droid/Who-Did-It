import achievementsJson from '@wdi/content/data/achievements.json';
import type { AchievementsFile } from '@wdi/content';
import { fill } from '../copy';
import { h } from '../dom';
import { openDialog, type MenuDialog } from '../menu/dialog';
import { ACHV_COPY as C } from './copy';
import { treeRows, type AchievementRow } from './model';
import { readEarned } from './store';
import './achievements.css';

const STATE_LABEL = { earned: 'achv.earned', open: 'achv.open', locked: 'achv.locked' } as const;

function rowEl(r: AchievementRow): HTMLElement {
  return h(
    'li',
    {
      class: `wdi-achv-row wdi-achv-row--${r.state}`,
      'data-testid': 'achv-row',
      'data-id': r.id,
      'data-state': r.state,
    },
    h(
      'div',
      { class: 'wdi-achv-row__head' },
      h('strong', {}, r.title),
      h('span', { class: 'wdi-achv-row__state' }, C[STATE_LABEL[r.state]]),
    ),
    r.state === 'locked' ? null : h('p', { class: 'wdi-achv-row__text' }, r.text),
    r.state === 'locked' && r.from.length > 0
      ? h('p', { class: 'wdi-achv-row__from' }, fill(C['achv.growsFrom'], { titles: r.from.join(', ') }))
      : null,
    r.state === 'open' && r.steps.length > 1
      ? h('ol', { class: 'wdi-achv-row__steps' }, ...r.steps.map((s) => h('li', {}, s)))
      : null,
    r.day ? h('small', { class: 'wdi-achv-row__day' }, r.day) : null,
  );
}

/** The small view (GDD 3.28): every tree, each achievement earned, open or locked, from the device record. */
export function openAchievements(opts: { root: HTMLElement; onClose?(): void }): MenuDialog {
  const dialog = openDialog(opts.root, {
    id: 'achv-title',
    title: C['achv.title'],
    ...(opts.onClose ? { onClose: opts.onClose } : {}),
  });
  const trees = treeRows(achievementsJson as unknown as AchievementsFile, readEarned());
  dialog.body.append(
    ...trees.map((t) =>
      h(
        'section',
        { class: 'wdi-achv-tree', 'data-testid': 'achv-tree', 'data-id': t.id },
        h('h3', {}, t.title),
        h('p', { class: 'wdi-achv-tree__text' }, `${t.text} ${fill(C['achv.count'], { n: t.earned })}`),
        h('ul', { class: 'wdi-achv-list' }, ...t.rows.map(rowEl)),
      ),
    ),
  );
  return dialog;
}
