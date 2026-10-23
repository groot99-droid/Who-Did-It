import items from '@wdi/content/data/items.json';
import { fill } from './copy';
import { M5B_COPY as C } from './copy/m5b';
import { BODY_COPY } from './copy/body'; // round 8, 8A
import { h } from './dom';
import type { StackSnap } from '../net/world';
import { useVerbOf } from '../view/body/verbs'; // round 8, 8A

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
  /** Round 8 (8A): a Use button's verb, `act.ability {abilityId, targetId?}`; no target is the actor. */
  use(abilityId: string, targetId?: string): void;
  /** Round 8 (8A): the handle of the avatar nearest to the own within `rangeTiles`, for a cure on a seat in reach. */
  near(rangeTiles: number): string | null;
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
 * Round 8 (8A, UI.md 14.32): a row whose item any holder may use (`useVerbOf`) gets a Use button, and a cure that also
 * works on a seat gets a second one while an avatar stands in its reach.
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
      // round 8, 8A: the near handle of each cure is part of the signature, so its second button follows the reach.
      const nearOf = (id: string): string | null => {
        const v = useVerbOf(id);
        return v && v.target === 'player' ? deps.near(v.rangeTiles) : null;
      };
      const sig = `${stacks.map((s) => `${s.defId}:${s.qty}:${nearOf(s.defId) ?? ''}`).join('|')}#${lit}`;
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
              const verb = useVerbOf(s.defId); // round 8, 8A
              if (verb) {
                const use = h(
                  'button',
                  { type: 'button', class: 'wdi-btn wdi-btn--sm', 'data-testid': `inventory-use-${s.defId}` },
                  BODY_COPY['body.use'],
                );
                use.addEventListener('click', () => deps.use(verb.id));
                row.append(use);
                const near = nearOf(s.defId);
                if (near !== null) {
                  const onNear = h(
                    'button',
                    {
                      type: 'button',
                      class: 'wdi-btn wdi-btn--sm',
                      'data-testid': `inventory-use-near-${s.defId}`,
                    },
                    BODY_COPY['body.use.near'],
                  );
                  onNear.addEventListener('click', () => deps.use(verb.id, near));
                  row.append(onNear);
                }
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
