import recipes from '@wdi/content/data/recipes.json';
import { matchGrid, type GridRecipe } from '@wdi/shared';
import { M5B_COPY as C } from './copy/m5b';
import { h } from './dom';
import { itemName } from './itemNames';
import { isBound, slotted } from './slots';
import type { StackSnap } from '../net/world';

// Round 10, A13 (GDD 3.30; UI.md 14.44): the crafting square of the inventory screen. 2 by 2 always, 3 by 3 at a
// workbench (the server decides which; this draws either). The product shown is the shared match, a preview: the
// server matches again on `craft.grid` and moves the items.

const HAND = Object.values(recipes.recipes).filter((r) => r.station === null) as Array<
  GridRecipe & { out: string; qty: number }
>;

export interface CraftGridDeps {
  stacks(): StackSnap[];
  /** The item of the stack picked in the pack, or null; clicking a cell puts one unit of it there. */
  pickedItem(): string | null;
  craftGrid(size: 2 | 3, cells: Array<string | null>): void;
}

export interface CraftGrid {
  readonly root: HTMLElement;
  update(): void;
}

/** The product a grid makes, or null; also what the preview shows. */
export function previewOf(
  size: number,
  cells: ReadonlyArray<string | null>,
): { out: string; qty: number } | null {
  const id = matchGrid(HAND, size, cells);
  const r = id === null ? undefined : HAND.find((x) => x.id === id);
  return r ? { out: r.out, qty: r.qty } : null;
}

export function mountCraftGrid(deps: CraftGridDeps): CraftGrid {
  let size: 2 | 3 = 2;
  let cells: Array<string | null> = Array.from({ length: 4 }, () => null);
  let shown = '';
  const board = h('div', { class: 'wdi-craftgrid__cells', 'data-testid': 'craftgrid-cells' });
  const out = h('button', {
    type: 'button',
    class: 'wdi-slot wdi-slot--out',
    'data-testid': 'craftgrid-out',
    disabled: true,
  });
  const toggle = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--sm wdi-btn--ghost', 'data-testid': 'craftgrid-size' },
    C['grid.size3'],
  );
  const root = h(
    'div',
    { class: 'wdi-craftgrid', 'data-testid': 'craftgrid' },
    h('h3', {}, C['grid.title']),
    board,
    out,
    toggle,
    h('p', { class: 'wdi-hint' }, C['grid.hint']),
  );
  const resize = (n: 2 | 3) => {
    size = n;
    cells = Array.from({ length: n * n }, () => null);
    shown = '';
    api.update();
  };
  toggle.addEventListener('click', () => resize(size === 2 ? 3 : 2));
  out.addEventListener('click', () => {
    if (previewOf(size, cells) === null) return;
    deps.craftGrid(size, cells);
    cells = cells.map(() => null);
    shown = '';
  });
  const api: CraftGrid = {
    root,
    update() {
      const have = new Map<string, number>();
      for (const s of slotted(deps.stacks()).values()) have.set(s.defId, (have.get(s.defId) ?? 0) + s.qty);
      // A unit that left the pockets (a gather lost, a craft made) leaves its cell.
      const used = new Map<string, number>();
      cells = cells.map((c) => {
        if (c === null) return null;
        const n = (used.get(c) ?? 0) + 1;
        used.set(c, n);
        return n > (have.get(c) ?? 0) ? null : c;
      });
      const picked = deps.pickedItem();
      const product = previewOf(size, cells);
      const sig = `${size}#${cells.join(',')}#${picked ?? ''}#${product?.out ?? ''}`;
      if (sig === shown) return;
      shown = sig;
      board.style.setProperty('--wdi-grid-n', String(size));
      toggle.textContent = size === 2 ? C['grid.size3'] : C['grid.size2'];
      board.replaceChildren(
        ...cells.map((c, i) => {
          const spare = picked !== null && (have.get(picked) ?? 0) > (used.get(picked) ?? 0);
          const cell = h(
            'button',
            {
              type: 'button',
              class: 'wdi-slot',
              'data-testid': `craftgrid-cell-${i}`,
              disabled: c === null && !(picked !== null && spare && !isBound(picked)),
              title: c === null && picked !== null && isBound(picked) ? C['grid.bound'] : '',
            },
            c === null ? '' : h('span', { class: 'wdi-m5b__name' }, itemName(c)),
          );
          cell.addEventListener('click', () => {
            if (c !== null) cells[i] = null;
            else if (picked !== null) cells[i] = picked;
            shown = '';
            api.update();
          });
          return cell;
        }),
      );
      out.replaceChildren(product ? h('span', { class: 'wdi-m5b__name' }, itemName(product.out)) : '');
      out.disabled = product === null;
    },
  };
  api.update();
  return api;
}
