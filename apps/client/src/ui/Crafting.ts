import recipes from '@wdi/content/data/recipes.json';
import { fill } from './copy';
import { M5B_COPY as C } from './copy/m5b';
import { h } from './dom';
import { itemList, itemName, stacksOf, type Panel } from './Inventory';
import type { StackSnap } from '../net/m5b';

export interface RecipeRow {
  id: string;
  out: string;
  qty: number;
  station: string | null;
  craftS: number;
  ins: Array<{ item: string; qty: number }>;
  /** What is still missing, as a want list; empty when the inputs are all in the pockets. */
  missing: Array<{ item: string; qty: number }>;
}

const ALL = Object.values(recipes.recipes) as Array<{
  id: string;
  out: string;
  qty: number;
  in: Array<{ item: string; qty: number }>;
  station: string | null;
  craftS: number;
}>;

/** Every recipe with what the pockets still lack for it. */
export function recipeRows(inventory: readonly StackSnap[]): RecipeRow[] {
  const have = new Map<string, number>();
  for (const s of stacksOf(inventory)) have.set(s.defId, (have.get(s.defId) ?? 0) + s.qty);
  return ALL.map((r) => ({
    id: r.id,
    out: r.out,
    qty: r.qty,
    station: r.station,
    craftS: r.craftS,
    ins: r.in,
    missing: r.in
      .map((i) => ({ item: i.item, qty: i.qty - (have.get(i.item) ?? 0) }))
      .filter((i) => i.qty > 0),
  }));
}

export interface CraftingDeps {
  inventory(): StackSnap[];
  /** The recipe being crafted (a running `craft` hold), or null. */
  crafting(): string | null;
  /** Starts the hold of a recipe, or stops the one running. */
  toggle(recipeId: string): void;
  /** Seconds of the running cast gone, 0..1 of `craftS`. */
  progress(): number;
}

const STATION_NAME: Record<string, string> = { oven: 'oven', basin: 'basin' };

/**
 * The crafting list (UI.md 14.19.3): each recipe in `recipes.json`, its inputs, where it is made and a Make button that
 * starts the `craft` hold. The server decides: a recipe with a `station` needs a prop of that kind in reach, and a
 * refusal comes back as the usual error line. Opens with C.
 */
export function mountCrafting(parent: HTMLElement, deps: CraftingDeps): Panel {
  const list = h('ul', { class: 'wdi-m5b__list', 'data-testid': 'crafting-list' });
  const close = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--sm wdi-btn--ghost', 'data-testid': 'crafting-close' },
    C['craft.close'],
  );
  const root = h(
    'section',
    {
      class: 'wdi-root wdi-m5b__panel',
      hidden: true,
      'data-testid': 'crafting',
      'aria-label': C['craft.title'],
    },
    h('header', { class: 'wdi-m5b__head' }, h('h2', {}, C['craft.title']), close),
    list,
  );
  parent.append(root);
  let shown = '';
  const bars = new Map<string, HTMLElement>();
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
      const rows = recipeRows(deps.inventory());
      const running = deps.crafting();
      const sig = `${rows.map((r) => r.missing.length).join('')}#${running ?? ''}`;
      if (sig !== shown) {
        shown = sig;
        bars.clear();
        list.replaceChildren(
          ...rows.map((r) => {
            const on = running === r.id;
            const button = h(
              'button',
              {
                type: 'button',
                class: 'wdi-btn wdi-btn--sm wdi-btn--primary',
                'data-testid': `craft-${r.id}`,
                disabled: r.missing.length > 0 && !on,
              },
              on ? C['craft.stop'] : C['craft.make'],
            );
            button.addEventListener('click', () => deps.toggle(r.id));
            const bar = h('i', {});
            bars.set(r.id, bar);
            return h(
              'li',
              { class: 'wdi-m5b__row wdi-m5b__row--recipe', 'data-testid': `recipe-${r.id}` },
              h(
                'div',
                { class: 'wdi-m5b__what' },
                h('span', { class: 'wdi-m5b__name' }, itemName(r.out)),
                h('span', { class: 'wdi-hint' }, itemList(r.ins)),
                h(
                  'span',
                  { class: 'wdi-hint' },
                  r.station === null
                    ? C['craft.anywhere']
                    : fill(C['craft.station'], { station: STATION_NAME[r.station] ?? r.station }),
                ),
                r.missing.length > 0
                  ? h(
                      'span',
                      { class: 'wdi-hint wdi-m5b__lack' },
                      fill(C['craft.need'], { list: itemList(r.missing) }),
                    )
                  : h('span', { class: 'wdi-hint wdi-m5b__ok' }, C['craft.ready']),
                h('span', { class: 'wdi-m5b__bar' }, bar),
              ),
              button,
            );
          }),
        );
      }
      const running2 = deps.crafting();
      for (const [id, bar] of bars)
        bar.style.width = running2 === id ? `${Math.round(deps.progress() * 100)}%` : '0%';
    },
    destroy() {
      root.remove();
    },
  };
  close.addEventListener('click', () => panel.close());
  return panel;
}
