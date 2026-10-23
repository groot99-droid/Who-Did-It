import balance from '@wdi/content/data/balance.json';
import economy from '@wdi/content/data/economy.json';
import { TILE_PX } from '@wdi/shared/constants';
import type Phaser from 'phaser';
import { REG_WORLD, type WorldFeed } from '../../net/world';
import { fill } from '../copy';
import { SCRIP_COPY as C, shopName } from '../copy/scrip';
import { h, overlayRoot } from '../dom';
import { nearest } from '../M5bLayer';
import { shopCounters, type CounterSpot } from './counters';
import { mountShop, type ShopPanel } from './ShopPanel';

const REACH_PX = balance.doors.reachTiles * TILE_PX;

export interface ShopLayer {
  /** E pressed or released; true when the layer took the press (a shop counter in reach). */
  use(down: boolean): boolean;
  destroy(): void;
}

/**
 * The shops' layer over the World (round 8, GDD 3.23; UI.md 14.34.1), Session 8C: the prompt at a counter in reach,
 * the `shop` hold that E or a tap on it sends, and the shop panel that `shop.open` opens. The server decides every
 * trade; a refusal comes back as the World's usual error line.
 */
export function mountShopLayer(scene: Phaser.Scene, parent: HTMLElement = overlayRoot()): ShopLayer | null {
  const feed = scene.registry.get(REG_WORLD) as WorldFeed | undefined;
  return feed ? new Layer(scene, feed, parent) : null;
}

class Layer implements ShopLayer {
  private readonly root: HTMLElement;
  private readonly prompt: HTMLButtonElement;
  private readonly panel: ShopPanel;
  private counters: CounterSpot[] = [];
  private target: CounterSpot | null = null;
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
      'data-testid': 'shop-prompt',
    });
    this.root = h('div', { class: 'wdi-root wdi-m5b', 'data-testid': 'shop-layer' }, this.prompt);
    parent.append(this.root);
    this.panel = mountShop(this.root, {
      purse: () => feed.purse(),
      inventory: () => feed.inventory(),
      buy: (shopId, itemId, qty) => feed.buy(shopId, itemId, qty),
      sell: (shopId, itemId, qty) => feed.sell(shopId, itemId, qty),
    });
    this.prompt.addEventListener('click', () => this.use(true));

    const onUpdate = () => this.tick();
    scene.events.on('update', onUpdate);
    this.offs.push(() => scene.events.off('update', onUpdate));
    const onOpen = (o: Parameters<ShopPanel['show']>[0]) => this.panel.show(o);
    feed.bus.on('shopOpen', onOpen);
    this.offs.push(() => feed.bus.off('shopOpen', onOpen));
    const sleep = () => (this.root.hidden = true);
    const wake = () => (this.root.hidden = false);
    scene.events.on('sleep', sleep);
    scene.events.on('wake', wake);
    this.offs.push(
      () => scene.events.off('sleep', sleep),
      () => scene.events.off('wake', wake),
    );
    const sceneId = (scene as unknown as { sceneId?: string }).sceneId ?? '';
    if (sceneId)
      void import('@wdi/content').then(({ scenes }) => {
        const props =
          (scenes as unknown as Record<string, { props?: CounterSpotProp[] }>)[sceneId]?.props ?? [];
        if (!this.gone) this.counters = shopCounters(props, economy.shops);
      });
  }

  use(down: boolean): boolean {
    if (this.gone || this.root.hidden || !this.target) return false;
    if (down && !this.feed.dead()) this.feed.hold('shop', this.target.propId, true);
    return true;
  }

  private tick(): void {
    const me = this.feed.snapshot().find((p) => p.id === this.feed.selfId)?.presence;
    const t = me && !this.feed.dead() ? nearest(me, this.counters, REACH_PX) : null;
    if (t !== this.target) {
      this.target = t;
      this.prompt.hidden = !t;
      this.prompt.textContent = t ? fill(C['prompt.shop'], { shop: shopName(t.shopId) }) : '';
      if (!t) this.panel.close();
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

type CounterSpotProp = { id: string; kind: string; x: number; y: number };
