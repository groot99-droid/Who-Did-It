import items from '@wdi/content/data/items.json';
import { fill } from './copy';
import { M5B_COPY as C } from './copy/m5b';
import { h } from './dom';
import type { StackSnap } from '../net/world';

const DEFS = items.items as Record<string, { name: string; kind: string; use?: string; tooltip?: string }>;
export const INVENTORY_SLOTS = items.inventorySlots;

/** The display name of an item id (`items.json`); the id itself for a row the content lacks. */
export const itemName = (id: string): string => DEFS[id]?.name ?? id;

/** A carried light the owner can light or douse (`items.json` `use: 'light'`). */
export const isLight = (id: string): boolean => DEFS[id]?.use === 'light';

/** Stacks of the pockets without empty slots, in slot order. */
export function stacksOf(slots: readonly StackSnap[]): StackSnap[] {
  return slots.filter((s) => s.defId !== '' && s.qty > 0);
}

/** `Resin x2, Timber x1`: a want or reward list as one line. */
export function itemList(list: ReadonlyArray<{ item: string; qty: number }>): string {
  return list.map((i) => (i.qty > 1 ? `${itemName(i.item)} x${i.qty}` : itemName(i.item))).join(', ');
}

export interface InventoryDeps {
  inventory(): StackSnap[];
  /** Whether a lit light is in hand (the `lantern` status bit of the own avatar). */
  lit(): boolean;
  light(on: boolean): void;
}

export interface Panel {
  readonly root: HTMLElement;
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
  /** Redraws when the data it shows changed; cheap enough to call every frame. */
  update(): void;
  destroy(): void;
}

/**
 * The pockets (UI.md 14.19.2): `inventorySlots` rows, one per stack, the name, the quantity and, for a carried light,
 * a Light / Douse button (`act.light`). Opens with I; the data is the own `Private.inventory`, never another seat's.
 */
export function mountInventory(parent: HTMLElement, deps: InventoryDeps): Panel {
  const list = h('ul', { class: 'wdi-m5b__list', 'data-testid': 'inventory-list' });
  const count = h('p', { class: 'wdi-hint', 'data-testid': 'inventory-count' });
  const close = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--sm wdi-btn--ghost', 'data-testid': 'inventory-close' },
    C['inv.close'],
  );
  const root = h(
    'section',
    {
      class: 'wdi-root wdi-m5b__panel',
      hidden: true,
      'data-testid': 'inventory',
      'aria-label': C['inv.title'],
    },
    h('header', { class: 'wdi-m5b__head' }, h('h2', {}, C['inv.title']), close),
    list,
    count,
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
      const stacks = stacksOf(deps.inventory());
      const lit = deps.lit();
      const sig = `${stacks.map((s) => `${s.defId}:${s.qty}`).join('|')}#${lit}`;
      if (sig === shown) return;
      shown = sig;
      list.replaceChildren(
        ...(stacks.length === 0
          ? [h('li', { class: 'wdi-m5b__empty', 'data-testid': 'inventory-empty' }, C['inv.empty'])]
          : stacks.map((s) => {
              const row = h(
                'li',
                {
                  class: 'wdi-m5b__row',
                  'data-testid': `inventory-item-${s.defId}`,
                  title: DEFS[s.defId]?.tooltip,
                },
                h('span', { class: 'wdi-m5b__name' }, itemName(s.defId)),
                h('span', { class: 'wdi-m5b__qty' }, `x${s.qty}`),
              );
              if (isLight(s.defId)) {
                const b = h(
                  'button',
                  { type: 'button', class: 'wdi-btn wdi-btn--sm', 'data-testid': 'inventory-light' },
                  lit ? C['inv.light.off'] : C['inv.light.on'],
                );
                b.addEventListener('click', () => deps.light(!deps.lit()));
                row.append(b);
              }
              return row;
            })),
      );
      count.textContent = fill(C['inv.slots'], { n: stacks.length, max: INVENTORY_SLOTS });
    },
    destroy() {
      root.remove();
    },
  };
  close.addEventListener('click', () => panel.close());
  return panel;
}
