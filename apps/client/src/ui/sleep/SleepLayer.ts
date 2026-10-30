import balance from '@wdi/content/data/balance.json';
import { TILE_PX } from '@wdi/shared/constants';
import type Phaser from 'phaser';
import { REG_WORLD, type WorldFeed } from '../../net/world';
import { fill } from '../copy';
import { SLEEP_COPY as C } from '../copy/sleep';
import { h, overlayRoot } from '../dom';
import { nearest } from '../M5bLayer';
import { type BedSpot, bedSpots, canLieDown, countParts, sleptThrough } from './rules';

const REACH_PX = balance.doors.reachTiles * TILE_PX;
const THROUGH_MS = 5000;

export interface SleepLayer {
  /** E pressed or released; true when the layer took the press (a bed in reach at dusk or night). */
  use(down: boolean): boolean;
  destroy(): void;
}

/**
 * The sleeping layer over the World (round 10, GDD 3.32; UI.md 14.46), A8: the prompt at a bed in reach, the asleep
 * overlay with the count of active players in bed (never who), and the "You slept through" line when the night ended
 * under the sleeper. The server decides every act; a sleeper's first input wakes it there, so the overlay only
 * follows `Private.asleep`.
 */
export function mountSleepLayer(scene: Phaser.Scene, parent: HTMLElement = overlayRoot()): SleepLayer | null {
  const feed = scene.registry.get(REG_WORLD) as WorldFeed | undefined;
  return feed ? new Layer(scene, feed, parent) : null;
}

const promptOf = (s: BedSpot): string =>
  s.kind === 'innBed' ? fill(C['prompt.innBed'], { n: balance.sleep.innBedScrip }) : C[`prompt.${s.kind}`];

class Layer implements SleepLayer {
  private readonly root: HTMLElement;
  private readonly prompt: HTMLButtonElement;
  private readonly veil: HTMLElement;
  private readonly count: HTMLElement;
  private readonly through: HTMLElement;
  private spots: BedSpot[] = [];
  private target: BedSpot | null = null;
  private was = false;
  private throughTimer: ReturnType<typeof setTimeout> | null = null;
  private gone = false;
  private readonly offs: Array<() => void> = [];

  constructor(
    scene: Phaser.Scene,
    private readonly feed: WorldFeed,
    parent: HTMLElement,
  ) {
    this.prompt = h('button', {
      type: 'button',
      class: 'wdi-m5b__prompt',
      hidden: true,
      'data-testid': 'sleep-prompt',
    });
    this.count = h('p', { class: 'wdi-sleep__count', 'data-testid': 'sleep-count' });
    this.veil = h(
      'div',
      { class: 'wdi-sleep__veil', hidden: true, role: 'status', 'data-testid': 'sleep-veil' },
      h('h2', { class: 'wdi-sleep__title' }, C['asleep.title']),
      this.count,
      h('p', { class: 'wdi-sleep__hint' }, C['asleep.hint']),
    );
    this.through = h(
      'p',
      {
        class: 'wdi-m5b__toast wdi-sleep__through',
        hidden: true,
        role: 'status',
        'data-testid': 'sleep-through',
      },
      C['asleep.through'],
    );
    this.root = h(
      'div',
      { class: 'wdi-root wdi-m5b wdi-sleep', 'data-testid': 'sleep-layer' },
      this.veil,
      this.through,
      this.prompt,
    );
    parent.append(this.root);
    this.prompt.addEventListener('pointerdown', () => this.use(true));

    const onUpdate = () => this.tick();
    scene.events.on('update', onUpdate);
    this.offs.push(() => scene.events.off('update', onUpdate));
    const sceneId = (scene as unknown as { sceneId?: string }).sceneId ?? '';
    if (sceneId)
      void import('@wdi/content').then(({ scenes }) => {
        const props = (scenes as unknown as Record<string, { props?: SpotProp[] }>)[sceneId]?.props ?? [];
        if (!this.gone) this.spots = bedSpots(props);
      });
  }

  use(down: boolean): boolean {
    if (this.gone || this.feed.sleeping().asleep) return false; // a sleeper's key goes to the server, which wakes it
    const t = this.target;
    if (!t) return false;
    if (down) this.feed.hold('sleep', t.propId, true);
    return true;
  }

  private tick(): void {
    const { asleep, inBed, inBedOf } = this.feed.sleeping();
    const phase = this.feed.clock().phase;
    this.veil.hidden = !asleep;
    const parts = countParts(inBed, inBedOf);
    this.count.textContent = parts ? fill(C['asleep.count'], parts) : '';
    if (sleptThrough(this.was, asleep, phase)) this.showThrough();
    this.was = asleep;

    const me = this.feed.snapshot().find((p) => p.id === this.feed.selfId)?.presence;
    const t =
      me && !asleep && !this.feed.dead() && canLieDown(phase) ? nearest(me, this.spots, REACH_PX) : null;
    if (t !== this.target) {
      this.target = t;
      this.prompt.hidden = !t;
      this.prompt.textContent = t ? promptOf(t) : '';
    }
  }

  private showThrough(): void {
    this.through.hidden = false;
    if (this.throughTimer) clearTimeout(this.throughTimer);
    this.throughTimer = setTimeout(() => (this.through.hidden = true), THROUGH_MS);
  }

  destroy(): void {
    this.gone = true;
    for (const off of this.offs) off();
    if (this.throughTimer) clearTimeout(this.throughTimer);
    this.root.remove();
  }
}

type SpotProp = { id: string; kind: string; x: number; y: number };
