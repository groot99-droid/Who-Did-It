import { WORLD_COPY as C } from '../ui/copy';
import { h } from '../ui/dom';
import '../ui/theme/tokens.css';
import '../ui/theme/components.css';
import { edgeCue } from './Hud';

// The quick-mode loft (GDD 3.11, A21, A39) as DOM, built from public/mockups/loft.html and the theme's
// `.wdi-loft`, `.wdi-bedrolls` and `.wdi-bedroll`. It shows one occupied bedroll per seat of the roster and
// nothing about where anyone is: no clock, no HUD, no input. The art is optional: the manifest's backdrop and
// bedroll images replace the CSS bedrolls when present.

export interface LoftSeat {
  id: string;
  name: string;
}

export interface LoftArt {
  backdrop?: string | undefined;
  bedroll?: string | undefined;
  bedrollSelf?: string | undefined;
}

const BEDROLL_W = 56;
const BEDROLL_H = 92;

export class LoftView {
  readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private signature = '';
  private art: LoftArt = {};

  constructor(
    parent: HTMLElement,
    private readonly base = import.meta.env.BASE_URL,
  ) {
    this.list = h('ul', { class: 'wdi-bedrolls' });
    this.root = h(
      'div',
      { class: 'wdi-root wdi-loft', 'data-testid': 'loft' },
      h('p', { class: 'wdi-eyebrow' }, C['loft.eyebrow']),
      h('h1', { class: 'wdi-display wdi-display--lg', style: 'color: var(--wdi-text)' }, C['loft.title']),
      h('p', { class: 'wdi-text', style: 'max-width: 36ch; text-align: center' }, C['loft.text']),
      this.list,
      h('p', { class: 'wdi-hint' }, C['loft.hint']),
    );
    parent.append(this.root);
  }

  /** Applies the manifest images (CSS backgrounds); a missing one keeps the theme's CSS stand-in. */
  setArt(art: LoftArt): void {
    this.art = art;
    if (art.backdrop !== undefined) {
      const s = this.root.style;
      s.backgroundImage = `url("${art.backdrop}")`;
      s.backgroundSize = 'cover';
      s.backgroundPosition = 'center';
    }
    this.signature = '';
  }

  /** One bedroll per seat, in roster order; every one is occupied all night and `selfId`'s is marked. */
  setSeats(seats: LoftSeat[], selfId: string): void {
    const sig = `${selfId}|${seats.map((s) => `${s.id}:${s.name}`).join(',')}|${JSON.stringify(this.art)}`;
    if (sig === this.signature) return;
    this.signature = sig;
    this.list.replaceChildren(...seats.map((s) => this.bedroll(s, s.id === selfId)));
  }

  private bedroll(seat: LoftSeat, own: boolean): HTMLElement {
    const url = own ? (this.art.bedrollSelf ?? this.art.bedroll) : this.art.bedroll;
    const blanket =
      url === undefined
        ? h('span', { class: 'wdi-bedroll__blanket', 'aria-hidden': 'true' })
        : h('span', {
            'aria-hidden': 'true',
            style: `display:block;width:${BEDROLL_W}px;height:${BEDROLL_H}px;background:url("${url}") center / contain no-repeat`,
          });
    return h(
      'li',
      {
        class: own ? 'wdi-bedroll is-self' : 'wdi-bedroll',
        'data-testid': `bedroll-${seat.id}`,
        'aria-label': C['loft.bedroll'].replace('{name}', seat.name),
      },
      blanket,
      seat.name,
    );
  }

  /**
   * A muffled pulse from a random screen edge: a cool ring with no label, so it tells a sleeper nothing
   * about where or what. `rand` is the scene's local RNG (never the server's).
   */
  creak(rand: () => number, ms = 1800): HTMLElement {
    const { clientWidth: w, clientHeight: hgt } = this.root;
    const along = 0.15 + rand() * 0.7;
    const side = Math.floor(rand() * 4);
    const m = 24;
    const x = side === 0 ? m : side === 1 ? w - m : along * w;
    const y = side === 2 ? m : side === 3 ? hgt - m : along * hgt;
    const angle = Math.atan2(x - w / 2, -(y - hgt / 2));
    const cue = edgeCue(this.root, this.base, x, y, angle, undefined, true);
    window.setTimeout(() => cue.remove(), ms);
    return cue;
  }

  destroy(): void {
    this.root.remove();
  }
}
