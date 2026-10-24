import type { CivicAct, NotebookSnap, StackSnap } from '../../net/world';
import { fill } from '../copy';
import { CIVIC_COPY as C, stationName } from '../copy/civic';
import { h } from '../dom';
import type { Panel } from '../Inventory';
import { lookName } from '../portrait';
import { type CivicSpot, canAfford, hqOffer, noticeRows } from './rows';

/** The `economy.json` numbers the panels show (GDD 3.23), read once by the layer. */
export interface CivicNumbers {
  faith: {
    max: number;
    donateMax: number;
    indulgence: { faith: number; scrip: number };
    seal: { faith: number; scrip: number };
  };
  fencePrice: number;
  stations: Readonly<
    Record<
      string,
      { look: string; tiers: ReadonlyArray<{ scrip: number; materials: { item: string; qty: number }[] }> }
    >
  >;
}

export interface CivicDeps {
  numbers: CivicNumbers;
  faith(): number;
  purse(): number;
  look(): string;
  hqTiers(): Record<string, number>;
  inventory(): StackSnap[];
  notebook(): NotebookSnap[];
  sceneName(index: number): string;
  send(type: CivicAct, payload: object): void;
}

export interface CivicPanel extends Panel {
  /** Opens the panel on the altar, the back room, a station or a bank counter in reach. */
  show(spot: CivicSpot): void;
}

/**
 * The civic panels (UI.md 14.35): the altar, the back-room buyer with the held notices, an HQ station and the bank's
 * ledger, one panel redrawn for the prop it was opened at. The server decides every act; a refusal comes back as the
 * usual error line. 8H animates it by its `wdi-anim-*` classes.
 */
export function mountCivic(parent: HTMLElement, deps: CivicDeps): CivicPanel {
  const title = h('h2', {});
  const body = h('div', { class: 'wdi-civic__body', 'data-testid': 'civic-body' });
  const close = h(
    'button',
    { type: 'button', class: 'wdi-btn wdi-btn--sm wdi-btn--ghost', 'data-testid': 'civic-close' },
    C['civic.close'],
  );
  const root = h(
    'section',
    { class: 'wdi-root wdi-m5b__panel wdi-civic wdi-anim-panel', hidden: true, 'data-testid': 'civic' },
    h('header', { class: 'wdi-m5b__head' }, title, close),
    body,
  );
  parent.append(root);
  let spot: CivicSpot | null = null;
  let shown = '';

  const button = (
    label: string,
    testid: string,
    enabled: boolean,
    onClick: () => void,
  ): HTMLButtonElement => {
    const b = h(
      'button',
      {
        type: 'button',
        class: 'wdi-btn wdi-btn--sm wdi-btn--primary',
        'data-testid': testid,
        disabled: !enabled,
      },
      label,
    );
    b.addEventListener('click', onClick);
    return b;
  };
  const hint = (text: string) => h('p', { class: 'wdi-hint' }, text);
  const row = (what: HTMLElement[], act: HTMLElement | null, testid: string) =>
    h(
      'li',
      { class: 'wdi-m5b__row', 'data-testid': testid },
      h('div', { class: 'wdi-m5b__what' }, ...what),
      act,
    );
  const list = (...rows: HTMLElement[]) => h('ul', { class: 'wdi-m5b__list wdi-anim-list' }, ...rows);

  const altar = (): HTMLElement[] => {
    const { max, donateMax, indulgence, seal } = deps.numbers.faith;
    const faith = deps.faith();
    const purse = deps.purse();
    const give = (n: number) =>
      button(fill(C['altar.donate'], { n }), `civic-donate-${n}`, purse > 0 && faith < max, () =>
        deps.send('act.donate', { amount: n }),
      );
    const offer = (kind: 'indulgence' | 'seal', price: { faith: number; scrip: number }) => {
      const can = canAfford(price, faith, purse);
      const label = h('span', { class: 'wdi-m5b__name' }, C[`altar.${kind}`]);
      const text = h('span', { class: 'wdi-hint' }, fill(C[`altar.${kind}.hint`], price));
      const short = can ? null : h('span', { class: 'wdi-hint wdi-m5b__lack' }, C['altar.short']);
      const buy = button(C['altar.buy'], `civic-buy-${kind}`, can, () => deps.send('act.faith', { kind }));
      return row(short ? [label, text, short] : [label, text], buy, `civic-${kind}`);
    };
    return [
      hint(fill(C['altar.faith'], { n: faith, max })),
      hint(fill(C['altar.purse'], { n: purse })),
      h('p', { class: 'wdi-civic__give' }, give(1), give(Math.min(5, donateMax))),
      list(offer('indulgence', indulgence), offer('seal', seal)),
    ];
  };

  const market = (): HTMLElement[] => {
    const rows = noticeRows(deps.notebook(), deps.sceneName);
    if (rows.length === 0) return [hint(C['market.lead']), hint(C['market.none'])];
    return [
      hint(C['market.lead']),
      list(
        ...rows.map((r) =>
          row(
            [h('span', { class: 'wdi-m5b__name' }, r.line)],
            h(
              'span',
              {},
              button(
                fill(C['notice.fence'], { n: deps.numbers.fencePrice }),
                `civic-fence-${r.id}`,
                true,
                () => deps.send('act.notice', { itemId: r.id, op: 'fence' }),
              ),
              button(C['notice.burn'], `civic-burn-${r.id}`, true, () =>
                deps.send('act.notice', { itemId: r.id, op: 'burn' }),
              ),
            ),
            `civic-notice-${r.id}`,
          ),
        ),
      ),
    ];
  };

  const station = (id: string): HTMLElement[] => {
    const s = deps.numbers.stations[id];
    if (!s) return [];
    const o = hqOffer(s, deps.hqTiers()[id] ?? 0, deps.look(), deps.purse(), deps.inventory());
    const out: HTMLElement[] = [hint(fill(C['hq.tier'], { n: o.tier }))];
    if (o.next === null) return [...out, hint(C['hq.done'])];
    out.push(hint(o.next));
    if (!o.mine) return [...out, hint(fill(C['hq.notYours'], { look: lookName(s.look) }))];
    if (!o.can) out.push(h('p', { class: 'wdi-hint wdi-m5b__lack' }, C['hq.short']));
    out.push(button(C['hq.build'], 'civic-build', o.can, () => deps.send('act.hq', { stationId: id })));
    return out;
  };

  const bank = (): HTMLElement[] => [
    hint(C['bank.lead']),
    button(C['bank.pay'], 'civic-pay', deps.purse() > 0, () => deps.send('act.payRent', {})),
  ];

  /** What the body shows depends on these; it is rebuilt only when they change. */
  const signature = (s: CivicSpot) =>
    [
      s.kind,
      s.stationId ?? '',
      deps.faith(),
      deps.purse(),
      s.kind === 'market' ? noticeRows(deps.notebook(), () => '').map((r) => r.id) : '',
      s.kind === 'hq'
        ? [deps.hqTiers()[s.stationId ?? ''] ?? 0, deps.look(), JSON.stringify(deps.inventory())]
        : '',
    ].join('#');

  const titleOf = (s: CivicSpot): string =>
    s.kind === 'altar'
      ? C['altar.title']
      : s.kind === 'market'
        ? C['market.title']
        : s.kind === 'hq'
          ? stationName(s.stationId ?? '')
          : C['bank.title'];

  const panel: CivicPanel = {
    root,
    get isOpen() {
      return !root.hidden;
    },
    show(s) {
      spot = s;
      title.textContent = titleOf(s);
      root.setAttribute('aria-label', titleOf(s));
      panel.open();
    },
    open() {
      if (!spot) return;
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
      if (root.hidden || !spot) return;
      const sig = signature(spot);
      if (sig === shown) return;
      shown = sig;
      const parts =
        spot.kind === 'altar'
          ? altar()
          : spot.kind === 'market'
            ? market()
            : spot.kind === 'hq'
              ? station(spot.stationId ?? '')
              : bank();
      body.replaceChildren(...parts);
    },
    destroy() {
      root.remove();
    },
  };
  close.addEventListener('click', () => panel.close());
  return panel;
}
