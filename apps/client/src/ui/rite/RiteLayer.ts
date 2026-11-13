import balance from '@wdi/content/data/balance.json';
import type Phaser from 'phaser';
import { REG_WORLD, type WorldFeed } from '../../net/world';
import { fill } from '../copy';
import { RITE_COPY as C } from '../copy/rite';
import { h, overlayRoot } from '../dom';
import { Phase } from '@wdi/shared';
import { NO_RITE, type RiteState, inReach, nextRite, secondsLeft } from './rules';

export interface RiteLayer {
  /** E pressed or released; true when the layer took the press (the shade at the Medium, the rite open). */
  use(down: boolean): boolean;
  destroy(): void;
}

type Toast = (text: string, kind: 'interact' | 'hazard' | 'warm', ms: number) => void;

/**
 * The Medium's rite on the shade's screen (story R7, GDD 3.20; UI.md 14.62): a banner while the rite is open, the
 * prompt within `rite.reachTiles` of the Medium, the seconds left while it runs, and a toast when it is done and when
 * the seat returns. Everything follows the private `rite` messages, which reach the shade alone; the Medium itself is
 * drawn like any figure. The server decides every act.
 */
export function mountRiteLayer(
  scene: Phaser.Scene,
  toast: Toast,
  parent: HTMLElement = overlayRoot(),
): RiteLayer | null {
  const feed = scene.registry.get(REG_WORLD) as WorldFeed | undefined;
  return feed ? new Layer(scene, feed, toast, parent) : null;
}

/** The rite site's scene name (data, so the map revamp moves it without code). */
async function placeName(): Promise<string> {
  const { scenes } = await import('@wdi/content');
  const id = balance.rite.site.scene;
  return (scenes as Record<string, { name?: string }>)[id]?.name ?? id.replaceAll('_', ' ');
}

/**
 * The rite's state per feed, so it outlives the World's restarts at every door: the listener is added once, on the
 * feed's first layer, and the lobby clears it.
 */
const memories = new WeakMap<WorldFeed, { state: RiteState }>();
function riteOf(feed: WorldFeed): { state: RiteState } {
  let memory = memories.get(feed);
  if (memory) return memory;
  const m = { state: NO_RITE };
  memories.set(feed, (memory = m));
  feed.bus.on('rite', (msg) => void (m.state = nextRite(m.state, msg)));
  feed.bus.on('phaseChange', (e) => {
    if (e.phase === Phase.lobby) m.state = NO_RITE;
  });
  return memory;
}

/** Whether this feed's seat is a shade with its rite open, under way or done (it survives the World's restarts). */
export function riteShade(feed: WorldFeed): boolean {
  const stage = riteOf(feed).state.stage;
  return stage === 'open' || stage === 'begun' || stage === 'done';
}

class Layer implements RiteLayer {
  private readonly root: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly prompt: HTMLButtonElement;
  private readonly memory: { state: RiteState };
  /** The stage this layer last showed, so a toast plays once per stage. */
  private shown: RiteState['stage'];
  private place = '';
  private near = false;
  private gone = false;
  private readonly offs: Array<() => void> = [];

  constructor(
    scene: Phaser.Scene,
    private readonly feed: WorldFeed,
    private readonly toast: Toast,
    parent: HTMLElement,
  ) {
    this.banner = h('p', {
      class: 'wdi-m5b__toast',
      hidden: true,
      role: 'status',
      'data-testid': 'rite-banner',
    });
    this.prompt = h('button', {
      type: 'button',
      class: 'wdi-m5b__prompt',
      hidden: true,
      'data-testid': 'rite-prompt',
    });
    this.prompt.textContent = C.prompt;
    this.root = h(
      'div',
      { class: 'wdi-root wdi-m5b', 'data-testid': 'rite-layer' },
      this.banner,
      this.prompt,
    );
    parent.append(this.root);
    this.prompt.addEventListener('pointerdown', () => this.use(true));

    this.memory = riteOf(feed);
    this.shown = this.memory.state.stage;
    const onUpdate = () => this.tick();
    scene.events.on('update', onUpdate);
    this.offs.push(() => scene.events.off('update', onUpdate));
    void placeName().then((name) => {
      if (!this.gone) this.place = name;
    });
  }

  private get state(): RiteState {
    return this.memory.state;
  }

  use(down: boolean): boolean {
    if (this.gone || this.state.stage !== 'open' || !this.near) return false;
    if (down) this.feed.hold('rite', this.state.medium, true);
    return true;
  }

  private tick(): void {
    const { stage, medium, endsTick } = this.state;
    if (stage !== this.shown) {
      this.shown = stage;
      if (stage === 'done') this.toast(C.done, 'warm', 6000);
      if (stage === 'returned') this.toast(C.returned, 'warm', 6000);
    }
    const avatars = this.feed.avatars();
    const self = avatars.find((a) => a.handle === this.feed.selfHandle());
    const figure = stage === 'open' ? avatars.find((a) => a.handle === medium) : undefined;
    this.near = !!self && !!figure && inReach(self, figure);
    this.prompt.hidden = !this.near;
    const text =
      stage === 'open'
        ? fill(C['shade.banner'], { place: this.place })
        : stage === 'begun'
          ? fill(C.begun, { s: secondsLeft(endsTick, this.feed.clock().tick) })
          : '';
    if (this.banner.textContent !== text) this.banner.textContent = text;
    this.banner.hidden = text === '';
  }

  destroy(): void {
    this.gone = true;
    for (const off of this.offs) off();
    this.root.remove();
  }
}
