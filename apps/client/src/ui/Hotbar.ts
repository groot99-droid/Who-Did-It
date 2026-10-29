import { M5B_COPY as C } from './copy/m5b';
import { h } from './dom';
import { itemName } from './itemNames';
import { LAYOUT, slotted, slotsIn } from './slots';
import type { StackSnap } from '../net/world';

// Round 10, A13 (GDD 3.30; UI.md 14.44): the hotbar strip, always on screen during a match. A tap or the number keys
// 1 to 6 select the held slot (`inv.select`); the touch strip is the same strip.

export interface HotbarDeps {
  inventory(): StackSnap[];
  selected(): number;
  select(slot: number): void;
}

export interface Hotbar {
  readonly root: HTMLElement;
  update(): void;
  destroy(): void;
}

export function mountHotbar(parent: HTMLElement, deps: HotbarDeps): Hotbar {
  const root = h('nav', { class: 'wdi-hotbar', 'aria-label': C['hotbar.label'], 'data-testid': 'hotbar' });
  parent.append(root);
  let shown = '';
  return {
    root,
    update() {
      const slots = slotted(deps.inventory());
      const held = deps.selected();
      const sig = slotsIn(LAYOUT, 'hotbar')
        .map((n) => `${slots.get(n)?.defId ?? ''}:${slots.get(n)?.qty ?? 0}`)
        .join('|')
        .concat(`#${held}`);
      if (sig === shown) return;
      shown = sig;
      root.replaceChildren(
        ...slotsIn(LAYOUT, 'hotbar').map((n, i) => {
          const s = slots.get(n);
          const b = h(
            'button',
            {
              type: 'button',
              class: `wdi-slot${n === held ? ' wdi-slot--held' : ''}`,
              'data-testid': `hotbar-${n}`,
              'aria-pressed': String(n === held),
            },
            h('kbd', {}, String(i + 1)),
            s ? h('span', { class: 'wdi-m5b__name' }, itemName(s.defId)) : '',
            s && s.qty > 1 ? h('span', { class: 'wdi-m5b__qty' }, `x${s.qty}`) : '',
          );
          b.addEventListener('click', () => deps.select(n));
          return b;
        }),
      );
    },
    destroy() {
      root.remove();
    },
  };
}
