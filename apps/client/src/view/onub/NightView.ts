import onubRoles from '@wdi/content/data/roles.onub.json';
import { TICK_RATE } from '@wdi/shared/constants';
import type { OnubFeed } from '../../net/onub';
import { ONUB_PHASE } from '../../net/onubRouter';
import { fill } from '../../ui/copy';
import { ONUB_NIGHT_COPY as C } from '../../ui/copy/onubNight';
import { h } from '../../ui/dom';
import onubBalance from '@wdi/content/data/balance.onub.json';
import type { NightRevealEntry, S2CPayloads } from '@wdi/shared/protocol';
import { ActFlow } from '../../ui/onub/actflow';
import { seatSlot, slotLabel } from '../../ui/onub/slots';
import { CardTableView, type Face } from './CardTableView';
import { LightsOutView } from './LightsOutView';

export { NightSound, type NightAudioOut } from './NightSound';

type CopyId = keyof typeof C;
type RoleRow = { name: string; scene: string };
const STATION_NAME = Object.fromEntries(onubBalance.stations.map((st) => [st.id, st.name]));
const ROLES = onubRoles.roles as Record<string, RoleRow | undefined>;

/** The narrator's line for a window role and edge, or null for a role without lines. */
export function narratorLine(roleId: string, edge: 'wake' | 'sleep'): string | null {
  const id = `onub.narrator.${roleId}.${edge}` as CopyId;
  return id in C ? C[id] : null;
}

/**
 * What the narrator says, from the public window alone: the open window's call, then its closing call through
 * the fade, then the caption again. The same on every page (GDD 3.11).
 */
export class Narrator {
  private last = '';
  private closing = '';

  line(window: string): string | null {
    if (window !== '') {
      this.last = window;
      this.closing = '';
      return narratorLine(window, 'wake');
    }
    if (this.last !== '') {
      this.closing = this.last;
      this.last = '';
    }
    return this.closing === '' ? null : narratorLine(this.closing, 'sleep');
  }
}

export interface NightArt {
  /** `onub_scene_<scene>` urls by key. */
  scenes: Record<string, string>;
}

/**
 * The Night scene's DOM (GDD 3.11, "The Baking Cycle"): the narrator over a lights-out screen for a sleeper, or
 * over the role scene for a waker, then the dawn panel. It reads the public board and this seat's own wake;
 * nothing it shows differs between a sleeping and a waking page except the role scene itself.
 */
export class NightView {
  readonly root: HTMLElement;
  private readonly narrator = new Narrator();
  private readonly narratorEl: HTMLElement;
  private readonly lightsOut = new LightsOutView();
  private readonly wakeEl: HTMLElement;
  private readonly dawnEl: HTMLElement;
  private readonly wakeTitle: HTMLElement;
  private readonly wakeClock: HTMLElement;
  private readonly wakeLines: HTMLElement;
  private readonly dawnText: HTMLElement;
  private art: NightArt = { scenes: {} };
  private key = '';
  private flow = new ActFlow();
  private readonly table: CardTableView;
  private readonly actsEl = h('div', { class: 'wdi-row wdi-row--wrap' });
  private readonly promptEl = h('p', { class: 'wdi-hint', 'aria-live': 'polite' });
  private readonly confirm: HTMLButtonElement;
  private readonly revealEl: HTMLElement;
  private readonly revealList = h('ul', { class: 'wdi-stack wdi-stack--tight' });
  private readonly doneEl = h(
    'p',
    { class: 'wdi-chip wdi-chip--ready', 'data-testid': 'night-done' },
    C['onub.wake.done'],
  );
  /** The latest act sent and whether `nightReveal` answered it; the legal list it was sent against. */
  private sent: { legal: string; act: string; answered: boolean } | null = null;
  private tableKey = '';
  private readonly onReveal = () => {
    if (this.sent !== null) this.sent.answered = true;
  };
  private readonly onWake = (w: S2CPayloads['nightWake']) => {
    const legal = JSON.stringify(w.view.legal);
    if (this.sent !== null && w.view.legal.length > 0 && legal !== this.sent.legal) this.sent = null;
    if (legal !== this.legalKey) {
      this.legalKey = legal;
      this.flow.setLegal(w.view.legal);
    }
  };
  private legalKey = '';

  constructor(
    parent: HTMLElement,
    private readonly feed: OnubFeed,
  ) {
    this.narratorEl = h('p', { class: 'wdi-narrator', 'data-testid': 'narrator', 'aria-live': 'polite' });
    this.wakeTitle = h('h1', { class: 'wdi-display wdi-display--md' });
    this.wakeClock = h('span', { class: 'wdi-chip', 'data-testid': 'onub-clock' });
    this.wakeLines = h('div', { class: 'wdi-stack wdi-stack--tight' });
    this.table = new CardTableView((slot) => {
      if (this.sent !== null) return;
      this.flow.toggle(slot);
      this.tableKey = '';
      this.update();
    });
    this.confirm = h(
      'button',
      { type: 'button', class: 'wdi-btn', 'data-testid': 'act-confirm' },
      C['onub.act.confirm'],
    );
    this.confirm.addEventListener('click', () => {
      const out = this.flow.send();
      if (out === null || this.sent !== null) return;
      this.sent = { legal: JSON.stringify(this.flow.acts), act: out[0], answered: false };
      this.feed.act(out[0], out[1]);
      this.update();
    });
    this.revealEl = h(
      'section',
      { class: 'wdi-stack wdi-stack--tight', 'data-testid': 'night-reveal' },
      h('h2', { class: 'wdi-eyebrow' }, C['onub.reveal.title']),
      this.revealList,
    );
    this.wakeEl = h(
      'section',
      { class: 'wdi-panel wdi-stack wdi-night-wake', 'data-testid': 'night-wake' },
      h('div', { class: 'wdi-row wdi-row--between' }, this.wakeTitle, this.wakeClock),
      this.wakeLines,
      this.actsEl,
      this.promptEl,
      this.table.root,
      h('div', { class: 'wdi-row' }, this.confirm, this.doneEl),
      this.revealEl,
    );
    feed.bus.on('nightReveal', this.onReveal);
    feed.bus.on('nightWake', this.onWake);
    this.dawnText = h('p', { class: 'wdi-text' });
    this.dawnEl = h(
      'section',
      { class: 'wdi-panel wdi-stack wdi-night-dawn', 'data-testid': 'dawn' },
      h('h1', { class: 'wdi-display wdi-display--lg' }, C['onub.dawn.title']),
      h('p', { class: 'wdi-muted' }, C['onub.dawn.text']),
      this.dawnText,
    );
    this.root = h(
      'div',
      { class: 'wdi-root wdi-night', 'data-testid': 'night' },
      this.narratorEl,
      this.lightsOut.root,
      this.wakeEl,
      this.dawnEl,
    );
    parent.append(this.root);
    const existing = feed.wake();
    if (existing !== null) this.onWake(existing);
    this.update();
  }

  setArt(art: NightArt): void {
    this.art = art;
    this.key = '';
    this.update();
  }

  /** Cheap enough to call every frame; the DOM changes only when what it shows changes. */
  update(): void {
    const feed = this.feed;
    const { phase, tick } = feed.clock();
    const board = feed.board();
    const wake = phase === ONUB_PHASE.night ? feed.wake() : null;
    const dawn = phase === ONUB_PHASE.dawn;

    const line = dawn ? null : this.narrator.line(board.window);
    this.setText(this.narratorEl, line ?? '');
    this.narratorEl.hidden = line === null;

    this.lightsOut.setVisible(!dawn && wake === null);
    this.wakeEl.hidden = wake === null;
    this.dawnEl.hidden = !dawn;

    if (wake !== null) {
      const row = ROLES[wake.windowRole];
      const secs = Math.max(0, Math.ceil((wake.endsTick - tick) / TICK_RATE));
      this.setText(this.wakeClock, fill(C['onub.night.clock'], { s: secs }));
      const key = `${wake.windowRole}|${JSON.stringify(wake.view)}|${JSON.stringify(this.art)}`;
      this.renderAct(wake);
      if (key !== this.key) {
        this.key = key;
        this.setText(this.wakeTitle, fill(C['onub.wake.title'], { role: row?.name ?? wake.windowRole }));
        const scene = this.art.scenes[`onub_scene_${row?.scene ?? ''}`];
        this.wakeEl.style.backgroundImage = scene === undefined ? '' : `url("${scene}")`;
        this.wakeLines.replaceChildren(...this.linesOf(wake));
      }
    } else {
      this.key = '';
      this.sent = null;
      this.legalKey = '';
      this.flow = new ActFlow();
      this.tableKey = '';
    }

    if (dawn) {
      const cloche = board.cloche;
      const names = feed.seats();
      const text =
        cloche === ''
          ? C['onub.dawn.noCloche']
          : fill(C['onub.dawn.cloche'], {
              card: slotLabel(cloche, (i) => names.find((s) => s.id === board.seats[i])?.name ?? '?'),
            });
      this.setText(this.dawnText, text);
    }
  }

  /** The act buttons, the prompt, the card table, the confirm control and what the seat has learned. */
  private renderAct(wake: S2CPayloads['nightWake']): void {
    const feed = this.feed;
    const board = feed.board();
    const flow = this.flow;
    const names = feed.seats();
    const nameOf = (id: string) => names.find((s) => s.id === id)?.name ?? '?';
    const reveals = feed.reveals();
    // The Tourrier's first step is answered but not the end: a new `nightWake` with the second step follows.
    const done =
      this.sent !== null &&
      this.sent.answered &&
      (wake.view.legal.length === 0 || this.sent.act !== 'onub.laminatePeek');
    const acting = !done && this.sent === null;

    const actsKey = `${flow.act?.act ?? ''}|${wake.view.legal.map((a) => a.act).join(',')}|${acting}`;
    if (actsKey !== this.actsEl.dataset.key) {
      this.actsEl.dataset.key = actsKey;
      this.actsEl.replaceChildren(
        ...wake.view.legal.map((a) => {
          const name = a.act.replace(/^onub\./, '');
          const b = h(
            'button',
            {
              type: 'button',
              class: `wdi-btn wdi-btn--ghost${flow.act?.act === a.act ? ' is-selected' : ''}`,
              'data-testid': `act-${a.act}`,
              disabled: !acting,
            },
            (C[`onub.act.${name}.label` as CopyId] as string | undefined) ?? a.act,
          );
          b.addEventListener('click', () => {
            flow.choose(a.act);
            this.update();
          });
          return b;
        }),
      );
    }
    const act = flow.act;
    const name = act?.act.replace(/^onub\./, '') ?? '';
    const promptId = `onub.act.${name}.${flow.picks.length > 0 ? 'pick2' : 'pick'}` as CopyId;
    this.setText(this.promptEl, acting && act !== null && act.picks > 0 ? (C[promptId] as string) : '');
    this.confirm.hidden = wake.view.legal.length === 0 || done;
    this.confirm.disabled = !acting || !flow.complete;
    this.doneEl.hidden = !done;

    // Cards: the dealt role and chosen station are memory; whatever an act showed replaces them.
    const seatIds = board.seats;
    const selfIndex = seatIds.indexOf(feed.selfId);
    const faces = new Map<string, Face>();
    const dealt = feed.dealtRole();
    if (selfIndex >= 0 && dealt !== '')
      faces.set(seatSlot(selfIndex, 'role'), { text: ROLES[dealt]?.name ?? dealt, how: 'dealt' });
    const mine = feed.myPrep();
    if (selfIndex >= 0 && mine !== null)
      faces.set(seatSlot(selfIndex, 'loc'), {
        text: STATION_NAME[mine.station] ?? mine.station,
        how: 'dealt',
      });
    const glow = new Set<string>();
    for (const r of reveals) {
      if (r.kind === 'mate') glow.add(r.of);
      else faces.set(r.slot, { text: this.faceName(r), how: 'seen' });
    }
    for (const m of [...wake.view.mates, ...wake.view.seen.map((x) => x.seat)]) glow.add(m);
    const cloche = wake.view.cloche;
    const tk = JSON.stringify([acting, flow.act?.act, flow.picks, cloche, reveals.length, seatIds, dealt]);
    if (tk !== this.tableKey) {
      this.tableKey = tk;
      this.table.render({
        seats: seatIds.map((id) => ({ id, name: nameOf(id), self: id === feed.selfId })),
        pantryRoles: onubBalance.pantry.roles,
        pantryLocs: onubBalance.pantry.locations,
        faces,
        selectable: acting ? flow.selectable() : new Set(),
        picked: flow.picks,
        cloche,
        glow,
      });
    }

    this.revealEl.hidden = reveals.length === 0;
    const rows = reveals.map((r) => this.revealRow(r, seatIds, nameOf));
    const rk = rows.map((r) => r.textContent).join('|');
    if (rk !== this.revealList.dataset.key) {
      this.revealList.dataset.key = rk;
      this.revealList.replaceChildren(...rows);
    }
  }

  private faceName(r: NightRevealEntry): string {
    return r.kind === 'loc' ? (STATION_NAME[r.value] ?? r.value) : (ROLES[r.value]?.name ?? r.value);
  }

  private revealRow(
    r: NightRevealEntry,
    seatIds: readonly string[],
    nameOf: (id: string) => string,
  ): HTMLElement {
    const value = this.faceName(r);
    let text: string;
    if (r.kind === 'mate') text = fill(C['onub.reveal.mate'], { name: nameOf(r.of), value });
    else if (r.of === this.feed.selfId) text = fill(C['onub.reveal.own'], { value });
    else
      text = fill(C[r.kind === 'loc' ? 'onub.reveal.loc' : 'onub.reveal.role'], {
        card: slotLabel(r.slot, (i) => nameOf(seatIds[i] ?? '')),
        value,
      });
    return h('li', { class: 'wdi-text', 'data-testid': 'night-reveal-entry' }, text);
  }

  private linesOf(wake: NonNullable<ReturnType<OnubFeed['wake']>>): HTMLElement[] {
    const { view } = wake;
    const names = this.feed.seats();
    const nameOf = (id: string) => names.find((s) => s.id === id)?.name ?? '?';
    const out: HTMLElement[] = [];
    const add = (text: string) => out.push(h('p', { class: 'wdi-text' }, text));
    if (view.alone)
      add(wake.windowRole === 'commis' ? C['onub.wake.alone.commis'] : C['onub.wake.alone.champignon']);
    if (view.mates.length > 0) add(fill(C['onub.wake.mates'], { names: view.mates.map(nameOf).join(', ') }));
    if (view.seen.length > 0)
      add(fill(C['onub.wake.seen'], { names: view.seen.map((s) => nameOf(s.seat)).join(', ') }));
    if (view.legal.length === 0 && !view.alone && view.mates.length === 0 && view.seen.length === 0)
      add(C['onub.wake.nothing']);
    if (view.must) add(C['onub.wake.must']);
    return out;
  }

  private setText(node: HTMLElement, text: string): void {
    if (node.textContent !== text) node.textContent = text;
  }

  destroy(): void {
    this.feed.bus.off('nightReveal', this.onReveal);
    this.feed.bus.off('nightWake', this.onWake);
    this.root.remove();
  }
}
