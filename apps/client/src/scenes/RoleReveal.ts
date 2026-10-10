import Phaser from 'phaser';
import type { SceneEnterPayload } from '../net/protocol';
import { h, overlayRoot } from '../ui/dom';
import { mountRoleCard, type RoleCardScreen } from '../ui/RoleCard';
import { Backdrop } from '../view/Backdrop';
import { getHealth, getNet } from './registry';

/**
 * Shows the player's own private card. The payload is held in the net service (for Tab) and the card
 * DOM only. When the server sends `sceneEnter` the match has begun; the World scene starts from it.
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

    const banner = h('p', { class: 'hint', role: 'status', 'data-testid': 'entered' });
    overlayRoot().append(banner);
    const onEnter = (enter: SceneEnterPayload) => {
      banner.textContent = `The village wakes: ${enter.sceneId}, ${enter.spawn}.`;
      // World arrives with M2; start it as soon as the scene is registered.
      if (this.scene.manager.keys['World'] !== undefined) this.scene.start('World', { enter });
    };
    net.bus.on('sceneEnter', onEnter);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      net.bus.off('sceneEnter', onEnter);
      banner.remove();
      this.card?.destroy();
      this.card = null;
    });
  }
}
