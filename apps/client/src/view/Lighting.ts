import { TICK_RATE, TILE_PX } from '@wdi/shared/constants';
import balance from '@wdi/content/data/balance.json';
import { h } from '../ui/dom';

/** Darkness outside the vision circle (look only; the radii are balance.json `vision`, GDD 3.7). */
const ALPHA_DAY = 0.4;
const ALPHA_NIGHT = 0.9;

const PHASE = { grace: 2, day: 3, dusk: 4, night: 5, finalNight: 11 } as const;

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));

/**
 * The night mask: a screen-space vignette centred on you with a radius of `vision.dayTiles` by day and
 * `vision.nightTiles` at night, easing between the two through dusk. Client-side only, like V1's darkness
 * (A30); a DOM layer under the HUD so it needs nothing from the renderer.
 */
export class Lighting {
  readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = h('div', { class: 'wdi-night-mask', 'aria-hidden': 'true', 'data-testid': 'night-mask' });
    parent.append(this.root);
  }

  /** 0 in full day, 1 at night; dusk eases between them over its length. */
  static darkness(phase: number, ticksLeft: number): number {
    if (phase === PHASE.night || phase === PHASE.finalNight) return 1;
    if (phase === PHASE.dusk)
      return 1 - Math.min(1, Math.max(0, ticksLeft / (balance.phases.duskS * TICK_RATE)));
    return 0;
  }

  /**
   * `sx`/`sy` are you in screen pixels, `zoom` the camera zoom. Hidden when `visible` is false (a meeting,
   * the lobby) so the mask never leaks onto other screens.
   */
  update(visible: boolean, sx: number, sy: number, zoom: number, darkness: number): void {
    this.root.hidden = !visible;
    if (!visible) return;
    const tiles = lerp(balance.vision.dayTiles, balance.vision.nightTiles, darkness);
    const s = this.root.style;
    s.setProperty('--lx', `${sx.toFixed(1)}px`);
    s.setProperty('--ly', `${sy.toFixed(1)}px`);
    s.setProperty('--lr', `${(tiles * TILE_PX * zoom).toFixed(1)}px`);
    s.setProperty('--la', String(lerp(ALPHA_DAY, ALPHA_NIGHT, darkness).toFixed(2)));
    this.root.classList.toggle('is-night', darkness >= 1);
  }

  setHidden(hidden: boolean): void {
    this.root.hidden = hidden;
  }

  destroy(): void {
    this.root.remove();
  }
}
