import type { StackSnap, TaskSnap } from '../net/world';
import { fill } from './copy';
import { TASK_COPY as C } from './copy/tasks';
import { h } from './dom';
import { type Panel, stacksOf } from './Inventory';
import { choreLine, choreRows } from './tasks';

export interface ChoreDeps {
  tasks(): TaskSnap[];
  inventory(): StackSnap[];
  /** A scene id's name; the id itself until the content has loaded. */
  sceneName(id: string): string;
}

/**
 * The chores panel (UI.md 14.38.2; GDD 3.5): this seat's own task list, in deal order, each with what to fetch and
 * where to bring it. A Cabal or neutral seat sees the same rows under "A show of work" (its list is fake, 3.5); nothing
 * on the wire says so, since `Private.tasks` is its own. Opens with K. Session 7M.
 */
export function mountChores(parent: HTMLElement, deps: ChoreDeps): Panel {
  const list = h('ul', { class: 'wdi-m5b__list', 'data-testid': 'chores-list' });
  const sub = h(
    'p',
    { class: 'wdi-hint wdi-m5b__sub', hidden: true, 'data-testid': 'chores-show' },
    C['chores.show'],
  );
  const close = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--sm wdi-btn--ghost', 'data-testid': 'chores-close' },
    C['chores.close'],
  );
  const root = h(
    'section',
    {
      class: 'wdi-root wdi-m5b__panel',
      hidden: true,
      'data-testid': 'chores',
      'aria-label': C['chores.title'],
    },
    h('header', { class: 'wdi-m5b__head' }, h('h2', {}, C['chores.title']), close),
    sub,
    list,
  );
  parent.append(root);
  let shown = '';
  const panel: Panel = {
    root,
    get isOpen() {
      return !root.hidden;
    },
    open() {
      root.hidden = false;
      shown = '';
      panel.update();
    },
    close() {
      root.hidden = true;
    },
    toggle() {
      if (root.hidden) panel.open();
      else panel.close();
    },
    update() {
      if (root.hidden) return;
      const have = new Set(stacksOf(deps.inventory()).map((s) => s.defId));
      const rows = choreRows(deps.tasks(), (item) => have.has(item));
      const lines = rows.map((r) => ({ r, line: choreLine(r, deps.sceneName) }));
      const sig = lines.map(({ r, line }) => `${r.id}:${r.step}:${line}`).join('|');
      if (sig === shown) return;
      shown = sig;
      sub.hidden = !rows.some((r) => r.fake);
      list.replaceChildren(
        ...(rows.length === 0
          ? [h('li', { class: 'wdi-m5b__empty', 'data-testid': 'chores-empty' }, C['chores.none'])]
          : lines.map(({ r, line }) =>
              h(
                'li',
                {
                  class: 'wdi-m5b__row wdi-m5b__row--chore',
                  'data-testid': `chore-${r.id}`,
                  'data-step': r.step,
                },
                h(
                  'div',
                  { class: 'wdi-m5b__what' },
                  h('span', { class: 'wdi-m5b__name' }, r.name),
                  h('span', { class: 'wdi-hint' }, line),
                  ...(r.nightOnly && r.step !== 'done'
                    ? [h('span', { class: 'wdi-hint' }, C['chores.night'])]
                    : []),
                ),
                ...(r.step === 'done' ? [h('span', { class: 'wdi-m5b__done' }, C['chores.done'])] : []),
              ),
            )),
      );
    },
    destroy() {
      root.remove();
    },
  };
  close.addEventListener('click', () => panel.close());
  return panel;
}

/** The village's work (UI.md 14.38.3): the public task bar of GDD 3.5 as a thin meter with its percentage. */
export function mountWorkBar(parent: HTMLElement): { update(pct: number): void; destroy(): void } {
  const fillEl = h('i', {});
  const pctEl = h(
    'span',
    { class: 'wdi-m5b__work-pct', 'data-testid': 'work-pct' },
    fill(C['work.pct'], { pct: 0 }),
  );
  const root = h(
    'div',
    {
      class: 'wdi-m5b__work',
      'data-testid': 'work',
      role: 'progressbar',
      'aria-label': C['work.title'],
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-valuenow': '0',
      title: C['work.title'],
    },
    h('span', { class: 'wdi-m5b__work-bar' }, fillEl),
    pctEl,
  );
  parent.append(root);
  let shown = -1;
  return {
    update(pct) {
      const p = Math.max(0, Math.min(100, Math.round(pct)));
      if (p === shown) return;
      shown = p;
      fillEl.style.width = `${p}%`;
      pctEl.textContent = fill(C['work.pct'], { pct: p });
      root.setAttribute('aria-valuenow', String(p));
    },
    destroy() {
      root.remove();
    },
  };
}
