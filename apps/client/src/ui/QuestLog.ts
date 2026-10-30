import balance from '@wdi/content/data/balance.json';
import quests from '@wdi/content/data/quests.json';
import { fill } from './copy';
import { M5B_COPY as C, questLine } from './copy/m5b';
import { h } from './dom';
import { itemList, stacksOf, type Panel } from './Inventory';
import type { StackSnap } from '../net/world';
import type { QuestSnap } from '../net/world';

interface QuestDef {
  id: string;
  giver: string;
  kind: string;
  wants: Array<{ item: string; qty: number }>;
  reward: Array<{ item: string; qty: number }>;
  copyId: string;
  /** Round 10, D9: the quest of the same giver to turn in first. */
  after?: string;
}
const DEFS = quests.quests as Record<string, QuestDef>;
const NPCS = quests.npcs as Record<string, { name: string }>;
export const QUESTS_MAX_ACTIVE = balance.quests.maxActive;

export interface QuestRow {
  id: string;
  giver: string;
  giverName: string;
  copyId: string;
  wants: QuestDef['wants'];
  reward: QuestDef['reward'];
  total: number;
  have: number;
  state: 'offer' | 'taken' | 'done';
  /** The giver stands within reach: Take the work / Hand it in are live. */
  near: boolean;
}

/**
 * The rows of the log: every `fetch` quest of a giver in reach (offers), plus every quest this seat holds (taken or
 * done, wherever its giver stands). A `contract` quest is the round-7 seam and never shows.
 */
export function questRows(
  mine: readonly QuestSnap[],
  inventory: readonly StackSnap[],
  nearNpcs: ReadonlySet<string>,
): QuestRow[] {
  const have = new Map<string, number>();
  for (const s of stacksOf(inventory)) have.set(s.defId, (have.get(s.defId) ?? 0) + s.qty);
  const rows: QuestRow[] = [];
  const row = (d: QuestDef, state: QuestRow['state']): QuestRow => {
    const total = d.wants.reduce((n, w) => n + w.qty, 0);
    const held = d.wants.reduce((n, w) => n + Math.min(have.get(w.item) ?? 0, w.qty), 0);
    return {
      id: d.id,
      giver: d.giver,
      giverName: NPCS[d.giver]?.name ?? d.giver,
      copyId: d.copyId,
      wants: d.wants,
      reward: d.reward,
      total,
      have: state === 'done' ? total : held,
      state,
      near: nearNpcs.has(d.giver),
    };
  };
  for (const q of mine) {
    const d = DEFS[q.id];
    if (d) rows.push(row(d, q.done ? 'done' : 'taken'));
  }
  for (const d of Object.values(DEFS)) {
    if (d.kind !== 'fetch' || !nearNpcs.has(d.giver) || mine.some((q) => q.id === d.id)) continue;
    if (d.after !== undefined && !mine.some((q) => q.id === d.after && q.done)) continue; // a chain step waits
    rows.push(row(d, 'offer'));
  }
  return rows;
}

export interface QuestDeps {
  quests(): QuestSnap[];
  inventory(): StackSnap[];
  /** The `quests.json` npc ids of the givers within reach of the own seat. */
  near(): ReadonlySet<string>;
  accept(questId: string): void;
  turnIn(questId: string): void;
}

/** The quest log (UI.md 14.19.4): the offers of the giver beside you and the work you hold. Opens with J, or T at a giver. */
export function mountQuestLog(parent: HTMLElement, deps: QuestDeps): Panel {
  const list = h('ul', { class: 'wdi-m5b__list', 'data-testid': 'quest-list' });
  const close = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--sm wdi-btn--ghost', 'data-testid': 'quest-close' },
    C['quest.close'],
  );
  const root = h(
    'section',
    {
      class: 'wdi-root wdi-m5b__panel',
      hidden: true,
      'data-testid': 'quests',
      'aria-label': C['quest.title'],
    },
    h('header', { class: 'wdi-m5b__head' }, h('h2', {}, C['quest.title']), close),
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
      const mine = deps.quests();
      const rows = questRows(mine, deps.inventory(), deps.near());
      const active = mine.filter((q) => !q.done).length;
      const sig = rows.map((r) => `${r.id}:${r.state}:${r.have}:${r.near}`).join('|') + `#${active}`;
      if (sig === shown) return;
      shown = sig;
      list.replaceChildren(
        ...(rows.length === 0
          ? [h('li', { class: 'wdi-m5b__empty', 'data-testid': 'quest-empty' }, C['quest.none'])]
          : rows.map((r) => {
              const body = h(
                'div',
                { class: 'wdi-m5b__what' },
                h('span', { class: 'wdi-m5b__name' }, fill(C['quest.giver'], { name: r.giverName })),
                h('span', { class: 'wdi-m5b__line' }, questLine(r.copyId, r.state === 'done')),
                h('span', { class: 'wdi-hint' }, fill(C['quest.wants'], { list: itemList(r.wants) })),
                h('span', { class: 'wdi-hint' }, fill(C['quest.reward'], { list: itemList(r.reward) })),
              );
              if (r.state === 'taken')
                body.append(
                  h(
                    'span',
                    { class: 'wdi-hint', 'data-testid': `quest-progress-${r.id}` },
                    fill(C['quest.progress'], { have: r.have, total: r.total }),
                  ),
                );
              const li = h(
                'li',
                {
                  class: 'wdi-m5b__row wdi-m5b__row--quest',
                  'data-testid': `quest-${r.id}`,
                  'data-state': r.state,
                },
                body,
              );
              if (r.state === 'offer') {
                const full = active >= QUESTS_MAX_ACTIVE;
                const b = h(
                  'button',
                  {
                    type: 'button',
                    class: 'wdi-btn wdi-btn--sm wdi-btn--primary',
                    'data-testid': `quest-accept-${r.id}`,
                    disabled: !r.near || full,
                    title: full ? C['quest.full'] : undefined,
                  },
                  C['quest.accept'],
                );
                b.addEventListener('click', () => deps.accept(r.id));
                li.append(b);
              } else if (r.state === 'taken') {
                const b = h(
                  'button',
                  {
                    type: 'button',
                    class: 'wdi-btn wdi-btn--sm wdi-btn--primary',
                    'data-testid': `quest-turnin-${r.id}`,
                    disabled: !r.near || r.have < r.total,
                  },
                  C['quest.turnin'],
                );
                b.addEventListener('click', () => deps.turnIn(r.id));
                li.append(b);
              } else li.append(h('span', { class: 'wdi-m5b__done' }, C['quest.done']));
              return li;
            })),
      );
    },
    destroy() {
      root.remove();
    },
  };
  close.addEventListener('click', () => panel.close());
  return panel;
}
