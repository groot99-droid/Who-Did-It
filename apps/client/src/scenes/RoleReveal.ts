import Phaser from 'phaser';
import type { SceneEnterPayload } from '../net/protocol';
import { buildLine, hideBackdrop, showBackdrop } from '../ui/backdrop';
import { h, overlayRoot } from '../ui/dom';
import { mountRoleCard, type RoleCardScreen } from '../ui/RoleCard';
import { REG_WORLD, type WorldFeed } from '../net/world';
import { getHealth, getNet } from './registry';

/**
 * Shows the player's own private card. The payload is held in the net service (for Tab) and the card
 * DOM only. When the server sends `sceneEnter` the match has begun: the world router starts the World
 * scene from it, and this scene sleeps so its card DOM (and Tab) survive into play.
 */
export class RoleReveal extends Phaser.Scene {
  private card: RoleCardScreen | null = null;

  constructor() {
    super('RoleReveal');
  }

  create(): void {
    showBackdrop({ status: buildLine(getHealth(this)) });
    const net = getNet(this);
    const payload = net.roleCard;
    if (payload === null) {
      this.scene.start('Lobby');
      return;
    }
    // Main mode (GDD 3.17): a cover role picks its look here, and sees its Cabal mates' picks live from the feed
    // the world router publishes with the room.
    const feed = () => this.registry.get(REG_WORLD) as WorldFeed | undefined;
    this.card = mountRoleCard(overlayRoot(), payload, {
      onReady: () => net.send('lobby.ready', { ready: true }),
      onPickCover: (lookId) => net.send('role.cover', { lookId }),
      cover: () => feed()?.coverState() ?? { look: '', mates: {} },
      paintTarget: () => feed()?.paintTarget() ?? 0, // round 10, C5
      textures: this.textures,
    });

    const banner = h('p', { class: 'wdi-hint wdi-banner', role: 'status', 'data-testid': 'entered' });
    overlayRoot().append(banner);
    let hideBanner = 0;
    const onEnter = (enter: SceneEnterPayload) => {
      banner.textContent = `The village wakes: ${enter.sceneId}, ${enter.spawn}.`;
      banner.hidden = false;
      window.clearTimeout(hideBanner);
      hideBanner = window.setTimeout(() => (banner.hidden = true), 2500);
      // The world router (net/worldRouter.ts) starts the World scene; this scene only steps aside, once.
      net.bus.off('sceneEnter', onEnter);
      hideBackdrop();
      if (this.scene.isActive()) this.scene.sleep();
    };
    const onLeft = () => this.scene.stop();
    net.bus.on('sceneEnter', onEnter);
    net.bus.on('left', onLeft);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      net.bus.off('sceneEnter', onEnter);
      net.bus.off('left', onLeft);
      window.clearTimeout(hideBanner);
      banner.remove();
      this.card?.destroy();
      this.card = null;
      hideBackdrop();
    });
  }
}
