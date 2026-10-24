import balance from '@wdi/content/data/balance.json';
import economy from '@wdi/content/data/economy.json';
import { TILE_PX } from '@wdi/shared/constants';
import type Phaser from 'phaser';
import { REG_WORLD, type WorldFeed } from '../../net/world';
import { loadSceneNames } from '../../view/sceneNames';
import { fill } from '../copy';
import { CIVIC_COPY as C, stationName } from '../copy/civic';
import { h, overlayRoot } from '../dom';
import { nearest } from '../M5bLayer';
import { type CivicPanel, mountCivic } from './CivicPanel';
import { type CivicSpot, civicSpots } from './rows';

const REACH_PX = balance.doors.reachTiles * TILE_PX;

export interface CivicLayer {
  /** E pressed or released; true when the layer took the press (a civic prop in reach). */
  use(down: boolean): boolean;
  destroy(): void;
}

/**
 * The civic layer over the World (round 8, GDD 3.23; UI.md 14.35), Session 8D: the prompt at an altar, the mailbag, a
 * tally rack, the back room, an HQ station or a bank counter in reach. The mailbag and the rack are holds (E held,
 * `feed.hold`); the others open the civic panel. The server decides every act.
 */
export function mountCivicLayer(scene: Phaser.Scene, parent: HTMLElement = overlayRoot()): CivicLayer | null {
  const feed = scene.registry.get(REG_WORLD) as WorldFeed | undefined;
  return feed ? new Layer(scene, feed, parent) : null;
}

const promptOf = (s: CivicSpot): string =>
  s.kind === 'hq' ? fill(C['prompt.hq'], { station: stationName(s.stationId ?? '') }) : C[`prompt.${s.kind}`];

class Layer implements CivicLayer {
  private readonly root: HTMLElement;
  private readonly prompt: HTMLButtonElement;
  private readonly panel: CivicPanel;
  private spots: CivicSpot[] = [];
  private target: CivicSpot | null = null;
  private sceneName: (index: number) => string = () => '';
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
      'data-testid': 'civic-prompt',
    });
    this.root = h('div', { class: 'wdi-root wdi-m5b', 'data-testid': 'civic-layer' }, this.prompt);
    parent.append(this.root);
    const self = () => feed.snapshot().find((p) => p.id === feed.selfId);
    this.panel = mountCivic(this.root, {
      numbers: {
        faith: economy.faith,
        fencePrice: economy.notices.fencePrice,
        stations: economy.hq.stations,
      },
      faith: () => feed.faith(),
      purse: () => feed.purse(),
      look: () => self()?.look ?? '',
      hqTiers: () => feed.hqTiers(),
      inventory: () => feed.inventory(),
      notebook: () => feed.notebook(),
      sceneName: (i) => this.sceneName(i),
      send: (type, payload) => feed.civic(type, payload),
    });
    this.prompt.addEventListener('pointerdown', () => this.use(true));
    this.prompt.addEventListener('pointerup', () => this.use(false));

    const onUpdate = () => this.tick();
    scene.events.on('update', onUpdate);
    this.offs.push(() => scene.events.off('update', onUpdate));
    const sleep = () => (this.root.hidden = true);
    const wake = () => (this.root.hidden = false);
    scene.events.on('sleep', sleep);
    scene.events.on('wake', wake);
    this.offs.push(
      () => scene.events.off('sleep', sleep),
      () => scene.events.off('wake', wake),
    );
    void loadSceneNames().then((name) => (this.sceneName = name));
    const sceneId = (scene as unknown as { sceneId?: string }).sceneId ?? '';
    if (sceneId)
      void import('@wdi/content').then(({ scenes }) => {
        const props = (scenes as unknown as Record<string, { props?: SpotProp[] }>)[sceneId]?.props ?? [];
        if (!this.gone) this.spots = civicSpots(props, economy);
      });
  }

  use(down: boolean): boolean {
    if (this.gone || this.root.hidden) return false;
    const t = this.target;
    if (!t) return false;
    if (this.feed.dead()) return true;
    if (t.kind === 'mailbag' || t.kind === 'rack') this.feed.hold(t.kind, t.propId, down);
    else if (down) this.panel.show(t);
    return true;
  }

  private tick(): void {
    const me = this.feed.snapshot().find((p) => p.id === this.feed.selfId)?.presence;
    const t = me && !this.feed.dead() ? nearest(me, this.spots, REACH_PX) : null;
    if (t !== this.target) {
      this.target = t;
      this.prompt.hidden = !t;
      this.prompt.textContent = t ? promptOf(t) : '';
      this.panel.close();
    }
    this.panel.update();
  }

  destroy(): void {
    this.gone = true;
    for (const off of this.offs) off();
    this.panel.destroy();
    this.root.remove();
  }
}

type SpotProp = { id: string; kind: string; x: number; y: number };
