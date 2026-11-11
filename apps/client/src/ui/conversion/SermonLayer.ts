import type Phaser from 'phaser';
import { REG_WORLD, type WorldFeed } from '../../net/world';
import { fill } from '../copy';
import { CONVERSION_COPY as C } from '../copy/conversion';
import { h, overlayRoot } from '../dom';
import { PREACH_HOLD_MS, canPreach, heardLine, sermonSecondsLeft } from './rules';

export interface SermonLayer {
  /** E pressed or released; true when the layer took the press (a seat in the Vicar look at the bell, by day). */
  use(down: boolean): boolean;
  destroy(): void;
}

type Toast = (text: string, kind: 'interact' | 'hazard' | 'warm', ms: number) => void;

/**
 * Conversion on the seat's own screen (story I9b, GDD 3.23; UI.md 14.57). A seat in the Vicar's look standing by the
 * bell by day sees "Hold E: preach a sermon": a tap of E still rings the bell, E held `PREACH_HOLD_MS` (or a tap on
 * the prompt) sends `act.hold sermon`, and a banner counts the sermon down. The private `conversion` messages give
 * the toasts (the preacher's count, the seat's own conversion, the Peaceful route), and the dealt Vicar's view shows
 * its converted count, a number only. The server decides every act.
 */
export function mountSermonLayer(
  scene: Phaser.Scene,
  toast: Toast,
  ring: () => void,
  bell: () => { x: number; y: number; reach: number } | null,
  parent: HTMLElement = overlayRoot(),
): SermonLayer | null {
  const feed = scene.registry.get(REG_WORLD) as WorldFeed | undefined;
  return feed ? new Layer(scene, feed, toast, ring, bell, parent) : null;
}

/** The tick this feed's seat last preached to the end, kept per feed so it outlives the World's restarts. */
const preached = new WeakMap<WorldFeed, { tick: number }>();
function preachedOf(feed: WorldFeed): { tick: number } {
  let m = preached.get(feed);
  if (!m) preached.set(feed, (m = { tick: -1 }));
  return m;
}

class Layer implements SermonLayer {
  private readonly root: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly prompt: HTMLButtonElement;
  private readonly count: HTMLElement;
  private readonly memory: { tick: number };
  private able = false;
  /** The tick a sermon was asked for, or -1. */
  private startTick = -1;
  private pressTimer: number | null = null;
  private gone = false;
  private readonly offs: Array<() => void> = [];

  constructor(
    scene: Phaser.Scene,
    private readonly feed: WorldFeed,
    private readonly toast: Toast,
    private readonly ring: () => void,
    private readonly bell: () => { x: number; y: number; reach: number } | null,
    parent: HTMLElement,
  ) {
    this.banner = h('p', {
      class: 'wdi-m5b__toast',
      hidden: true,
      role: 'status',
      'data-testid': 'sermon-banner',
    });
    this.prompt = h('button', {
      type: 'button',
      class: 'wdi-m5b__prompt',
      hidden: true,
      'data-testid': 'sermon-prompt',
    });
    this.prompt.textContent = C.prompt;
    // The count is a pill pinned under the goal strip (it only ever shows on the dealt Vicar's view).
    this.count = h('p', {
      class: 'wdi-purse wdi-converted',
      hidden: true,
      role: 'status',
      'data-testid': 'converted-count',
    });
    this.root = h(
      'div',
      { class: 'wdi-root wdi-m5b', 'data-testid': 'sermon-layer' },
      this.banner,
      this.prompt,
      this.count,
    );
    parent.append(this.root);
    this.prompt.addEventListener('pointerdown', () => this.preach());
    this.memory = preachedOf(feed);

    const onConversion = (m: { kind: string; heard?: number }) => {
      if (m.kind === 'sermon') {
        this.memory.tick = this.feed.clock().tick;
        this.startTick = -1;
        this.toast(heardLine(m.heard ?? 0), 'warm', 6000);
      } else if (m.kind === 'converted') this.toast(C.converted, 'warm', 6000);
      else if (m.kind === 'peaceful') this.toast(C.peaceful, 'warm', 8000);
    };
    const onError = () => void (this.startTick = -1); // a refused sermon never began
    feed.bus.on('conversion', onConversion);
    feed.bus.on('error', onError);
    this.offs.push(
      () => feed.bus.off('conversion', onConversion),
      () => feed.bus.off('error', onError),
    );
    const onUpdate = () => this.tick();
    scene.events.on('update', onUpdate);
    this.offs.push(() => scene.events.off('update', onUpdate));
  }

  use(down: boolean): boolean {
    if (this.gone) return false;
    if (down) {
      if (!this.able || this.startTick >= 0) return false;
      this.pressTimer = window.setTimeout(() => {
        this.pressTimer = null;
        this.preach();
      }, PREACH_HOLD_MS);
      return true;
    }
    if (this.pressTimer === null) return this.startTick >= 0; // a release after the sermon began changes nothing
    window.clearTimeout(this.pressTimer); // a tap: the bell, as before
    this.pressTimer = null;
    this.ring();
    return true;
  }

  private preach(): void {
    if (this.gone || !this.able || this.startTick >= 0) return;
    this.startTick = this.feed.clock().tick;
    this.feed.hold('sermon', 'bell', true);
  }

  private tick(): void {
    const clock = this.feed.clock();
    const self = this.feed.avatars().find((a) => a.handle === this.feed.selfHandle());
    const me = this.feed.snapshot().find((p) => p.id === this.feed.selfId);
    const bell = this.bell();
    const nearBell = !!self && !!bell && Math.hypot(self.x - bell.x, self.y - bell.y) <= bell.reach;
    this.able = canPreach({
      look: me?.look ?? '',
      phase: clock.phase,
      dead: this.feed.dead(),
      nearBell,
      tick: clock.tick,
      preachedTick: this.memory.tick,
    });
    if (this.startTick >= 0 && !this.able) this.startTick = -1; // left the bell or the day: the server ended it
    this.prompt.hidden = !this.able || this.startTick >= 0;
    const text =
      this.startTick >= 0 ? fill(C.preaching, { s: sermonSecondsLeft(this.startTick, clock.tick) }) : '';
    if (this.banner.textContent !== text) this.banner.textContent = text;
    this.banner.hidden = text === '';
    const n = this.feed.converted();
    const countText = n > 0 ? fill(C.count, { n }) : '';
    if (this.count.textContent !== countText) this.count.textContent = countText;
    this.count.hidden = countText === '';
  }

  destroy(): void {
    this.gone = true;
    if (this.pressTimer !== null) window.clearTimeout(this.pressTimer);
    for (const off of this.offs) off();
    this.root.remove();
  }
}
