import Phaser from 'phaser';
import type { SceneEnterPayload } from '../net/protocol';
import { h, overlayRoot } from '../ui/dom';
import { mountRoleCard, type RoleCardScreen } from '../ui/RoleCard';
import { Backdrop } from '../view/Backdrop';
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
    new Backdrop(this).setHealth(getHealth(this));
    const net = getNet(this);
    const payload = net.roleCard;
    if (payload === null) {
      this.scene.start('Lobby');
      return;
    }
    this.card = mountRoleCard(overlayRoot(), payload, {
      onReady: () => net.send('lobby.ready', { ready: true }),
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
    });
  }
}
