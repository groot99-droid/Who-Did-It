import { fill } from './copy';
import { M5B_COPY as C } from './copy/m5b';
import { BODY_COPY } from './copy/body'; // round 8, 8A
import { h } from './dom';
import type { StackSnap } from '../net/world';
import { mountCraftGrid } from './CraftGrid';
import { AREAS, LAYOUT, areaOf, canMove, slotted, slotsIn } from './slots';
import { useVerbOf } from '../view/body/verbs'; // round 8, 8A

import { DEFS, INVENTORY_SLOTS, isLight, itemList, itemName, stacksOf } from './itemNames';
export { INVENTORY_SLOTS, isLight, itemList, itemName, stacksOf };

export interface InventoryDeps {
  inventory(): StackSnap[];
  /** Round 10 (A12): the held hotbar slot. */
  selected(): number;
  /** Round 10 (A12): `inv.move`; the screen calls it only for a move that lands. */
  move(from: number, to: number): void;
  /** Round 10 (A13): `craft.grid`, the crafting square's cells row by row. */
  craftGrid(size: 2 | 3, cells: Array<string | null>): void;
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

const AREA_LABEL = {
  hotbar: C['inv.hotbar'],
  pack: C['inv.pack'],
  belt: C['inv.belt'],
  head: C['inv.head'],
  body: C['inv.body'],
  weapon: C['inv.weapon'],
} as const;

/**
 * The inventory screen (UI.md 14.44, GDD 3.30): the hotbar, the pack, the belt and the head, body and weapon slots as
 * a grid, and the crafting square beside it. Pick a stack, then a slot that takes it (`inv.move`); the slots that
 * would refuse are dimmed, so a move offered is a move that lands. Opens with I; the data is the own
 * `Private.inventory`, never another seat's. Round 8 (8A, UI.md 14.32): below the grid, a row for each stack that
 * has a verb, a Light or Douse button and a Use button, and a second one for a cure while an avatar stands in reach.
 */
export function mountInventory(parent: HTMLElement, deps: InventoryDeps): Panel {
  const areas = AREAS.map((area) => {
    const grid = h('div', { class: `wdi-slots wdi-slots--${area}`, 'data-testid': `inventory-${area}` });
    return { area, grid, box: h('div', { class: 'wdi-slotarea' }, h('h3', {}, AREA_LABEL[area]), grid) };
  });
  const acts = h('ul', { class: 'wdi-m5b__list', 'data-testid': 'inventory-acts' });
  const count = h('p', { class: 'wdi-hint', 'data-testid': 'inventory-count' });
  const hint = h('p', { class: 'wdi-hint' }, C['inv.pick']);
  const close = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--sm wdi-btn--ghost', 'data-testid': 'inventory-close' },
    C['inv.close'],
  );
  let picked: number | null = null;
  let shown = '';
  const crafting = mountCraftGrid({
    stacks: () => deps.inventory(),
    pickedItem: () => (picked === null ? null : (slotted(deps.inventory()).get(picked)?.defId ?? null)),
    craftGrid: (size, cells) => deps.craftGrid(size, cells),
  });
  const root = h(
    'section',
    {
      class: 'wdi-root wdi-m5b__panel wdi-inv',
      hidden: true,
      'data-testid': 'inventory',
      'aria-label': C['inv.title'],
    },
    h('header', { class: 'wdi-m5b__head' }, h('h2', {}, C['inv.title']), close),
    h(
      'div',
      { class: 'wdi-inv__body' },
      h('div', { class: 'wdi-inv__slots' }, ...areas.map((a) => a.box)),
      crafting.root,
    ),
    hint,
    acts,
    count,
  );
  parent.append(root);

  const pick = (slot: number) => {
    picked = picked === slot ? null : slot;
    shown = '';
    panel.update();
  };
  const drop = (to: number) => {
    if (picked !== null) deps.move(picked, to);
    picked = null;
    shown = '';
  };

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
      picked = null;
    },
    toggle() {
      if (root.hidden) panel.open();
      else panel.close();
    },
    update() {
      if (root.hidden) return;
      const stacks = deps.inventory();
      const slots = slotted(stacks);
      if (picked !== null && !slots.has(picked)) picked = null;
      const lit = deps.lit();
      const held = deps.selected();
      // round 8, 8A: the near handle of each cure is part of the signature, so its second button follows the reach.
      const nearOf = (id: string): string | null => {
        const v = useVerbOf(id);
        return v && v.target === 'player' ? deps.near(v.rangeTiles) : null;
      };
      const sig = `${[...slots].map(([n, s]) => `${n}:${s.defId}:${s.qty}:${nearOf(s.defId) ?? ''}`).join('|')}#${lit}#${held}#${picked ?? ''}`;
      crafting.update();
      if (sig === shown) return;
      shown = sig;
      const seen = new Set<string>();
      for (const { area, grid } of areas) {
        grid.replaceChildren(
          ...slotsIn(LAYOUT, area).map((n) => {
            const s = slots.get(n);
            const lands = picked !== null && canMove(slots, picked, n);
            const cell = h('button', {
              type: 'button',
              class: `wdi-slot${n === picked ? ' wdi-slot--picked' : ''}${area === 'hotbar' && n === held ? ' wdi-slot--held' : ''}${picked !== null && n !== picked && !lands ? ' wdi-slot--no' : ''}`,
              'data-slot': String(n),
              'data-testid': s && !seen.has(s.defId) ? `inventory-item-${s.defId}` : `inventory-slot-${n}`,
              title: s
                ? (DEFS[s.defId]?.tooltip ?? itemName(s.defId))
                : AREA_LABEL[areaOf(LAYOUT, n) ?? 'pack'],
              disabled: picked !== null && n !== picked && !lands ? true : s === undefined && picked === null,
            });
            if (s) {
              seen.add(s.defId);
              cell.append(
                h('span', { class: 'wdi-m5b__name' }, itemName(s.defId)),
                s.qty > 1 ? h('span', { class: 'wdi-m5b__qty' }, `x${s.qty}`) : '',
              );
            }
            cell.addEventListener('click', () => (picked !== null && n !== picked ? drop(n) : pick(n)));
            return cell;
          }),
        );
      }
      const usable = [...slots.values()].filter((s) => isLight(s.defId) || useVerbOf(s.defId));
      acts.replaceChildren(
        ...usable.map((s) => {
          const row = h(
            'li',
            { class: 'wdi-m5b__row', 'data-testid': `inventory-act-${s.defId}` },
            h('span', { class: 'wdi-m5b__name' }, itemName(s.defId)),
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
        }),
      );
      count.textContent =
        slots.size === 0 ? C['inv.empty'] : fill(C['inv.slots'], { n: slots.size, max: LAYOUT.size });
    },
    destroy() {
      root.remove();
    },
  };
  close.addEventListener('click', () => panel.close());
  return panel;
}
