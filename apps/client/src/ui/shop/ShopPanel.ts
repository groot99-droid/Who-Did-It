import type { StackSnap } from '../../net/world';
import { fill } from '../copy';
import { SCRIP_COPY as C, shopName } from '../copy/scrip';
import { h } from '../dom';
import { itemName, type Panel } from '../Inventory';
import { type ShopOpen, type ShopRow, shopRows } from './rows';

export interface ShopDeps {
  /** The own `Private.purse`. */
  purse(): number;
  inventory(): StackSnap[];
  buy(shopId: string, itemId: string, qty: number): void;
  sell(shopId: string, itemId: string, qty: number): void;
}

export interface ShopPanel extends Panel {
  /** Opens the panel on the shop a `shop.open` named. */
  show(open: ShopOpen): void;
}

/**
 * The shop panel (UI.md 14.34.1): the shop's name, the purse, what it sells with a Buy button and what it wants with a
 * Sell button, one at a time. Opened by `shop.open` after a `shop` hold at a counter; the server decides each trade, and
 * a refusal comes back as the usual error line. 8H animates it by its `wdi-anim-*` classes.
 */
export function mountShop(parent: HTMLElement, deps: ShopDeps): ShopPanel {
  const title = h('h2', {});
  const purse = h('p', { class: 'wdi-hint wdi-shop__purse', 'data-testid': 'shop-purse' });
  const list = h('ul', { class: 'wdi-m5b__list wdi-anim-list', 'data-testid': 'shop-list' });
  const close = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--sm wdi-btn--ghost', 'data-testid': 'shop-close' },
    C['shop.close'],
  );
  const root = h(
    'section',
    { class: 'wdi-root wdi-m5b__panel wdi-shop wdi-anim-panel', hidden: true, 'data-testid': 'shop' },
    h('header', { class: 'wdi-m5b__head' }, title, close),
    purse,
    list,
  );
  parent.append(root);
  let open: ShopOpen | null = null;
  let shown = '';

  const line = (r: ShopRow, side: 'buy' | 'sell'): HTMLElement => {
    const button = h(
      'button',
      {
        type: 'button',
        class: 'wdi-btn wdi-btn--sm wdi-btn--primary',
        'data-testid': `shop-${side}-${r.itemId}`,
        disabled: !r.can,
      },
      side === 'buy' ? C['shop.buy'] : C['shop.sell'],
    );
    button.addEventListener('click', () => {
      if (open) deps[side](open.shopId, r.itemId, 1);
    });
    return h(
      'li',
      { class: 'wdi-m5b__row', 'data-testid': `shop-row-${r.itemId}` },
      h(
        'div',
        { class: 'wdi-m5b__what' },
        h('span', { class: 'wdi-m5b__name' }, itemName(r.itemId)),
        h('span', { class: 'wdi-hint' }, fill(C['shop.price'], { n: r.price })),
        h('span', { class: 'wdi-hint' }, fill(C['shop.have'], { n: r.have })),
        side === 'buy' && !r.can ? h('span', { class: 'wdi-hint wdi-m5b__lack' }, C['shop.short']) : null,
      ),
      button,
    );
  };

  const panel: ShopPanel = {
    root,
    get isOpen() {
      return !root.hidden;
    },
    show(o) {
      open = o;
      title.textContent = shopName(o.shopId);
      root.setAttribute('aria-label', shopName(o.shopId));
      panel.open();
    },
    open() {
      if (!open) return;
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
      if (root.hidden || !open) return;
      const coins = deps.purse();
      const rows = shopRows(open, coins, deps.inventory());
      const sig = `${coins}#${[...rows.stock, ...rows.buys].map((r) => `${r.have}${r.can ? 1 : 0}`).join(',')}`;
      if (sig === shown) return;
      shown = sig;
      purse.textContent = fill(C['shop.purse'], { n: coins });
      const head = (text: string) => h('li', { class: 'wdi-m5b__row wdi-hint' }, text);
      list.replaceChildren(
        ...(rows.stock.length ? [head(C['shop.sells']), ...rows.stock.map((r) => line(r, 'buy'))] : []),
        ...(rows.buys.length ? [head(C['shop.buys']), ...rows.buys.map((r) => line(r, 'sell'))] : []),
        ...(rows.stock.length + rows.buys.length === 0 ? [head(C['shop.none'])] : []),
      );
    },
    destroy() {
      root.remove();
    },
  };
  close.addEventListener('click', () => panel.close());
  return panel;
}
