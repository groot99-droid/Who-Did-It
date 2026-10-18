import onubRoles from '@wdi/content/data/roles.onub.json';
import { TICK_RATE } from '@wdi/shared/constants';
import type { OnubFeed } from '../../net/onub';
import { ONUB_PHASE } from '../../net/onubRouter';
import { fill } from '../../ui/copy';
import { ONUB_NIGHT_COPY as C } from '../../ui/copy/onubNight';
import { h } from '../../ui/dom';
import { slotLabel } from '../../ui/onub/slots';
import { LightsOutView } from './LightsOutView';

export { NightSound, type NightAudioOut } from './NightSound';

type CopyId = keyof typeof C;
type RoleRow = { name: string; scene: string };
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

  constructor(
    parent: HTMLElement,
    private readonly feed: OnubFeed,
  ) {
    this.narratorEl = h('p', { class: 'wdi-narrator', 'data-testid': 'narrator', 'aria-live': 'polite' });
    this.wakeTitle = h('h1', { class: 'wdi-display wdi-display--md' });
    this.wakeClock = h('span', { class: 'wdi-chip', 'data-testid': 'onub-clock' });
    this.wakeLines = h('div', { class: 'wdi-stack wdi-stack--tight' });
    this.wakeEl = h(
      'section',
      { class: 'wdi-panel wdi-stack wdi-night-wake', 'data-testid': 'night-wake' },
      h('div', { class: 'wdi-row wdi-row--between' }, this.wakeTitle, this.wakeClock),
      this.wakeLines,
    );
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
      if (key !== this.key) {
        this.key = key;
        this.setText(this.wakeTitle, fill(C['onub.wake.title'], { role: row?.name ?? wake.windowRole }));
        const scene = this.art.scenes[`onub_scene_${row?.scene ?? ''}`];
        this.wakeEl.style.backgroundImage = scene === undefined ? '' : `url("${scene}")`;
        this.wakeLines.replaceChildren(...this.linesOf(wake));
      }
    } else this.key = '';

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
    this.root.remove();
  }
}
