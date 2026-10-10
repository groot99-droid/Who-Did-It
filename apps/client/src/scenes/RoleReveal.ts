import Phaser from 'phaser';
import type { RoleRevealPayload } from '../net/protocol';
import { overlayRoot } from '../ui/dom';
import { mountRoleCard, type RoleCardScreen } from '../ui/RoleCard';
import { Backdrop } from '../view/Backdrop';
import { getHealth, getNet } from './registry';

/** Shows the player's own private card. The payload is held in scene data and the card DOM only. */
export class RoleReveal extends Phaser.Scene {
  private card: RoleCardScreen | null = null;

  constructor() {
    super('RoleReveal');
  }

  create(data: { payload: RoleRevealPayload }): void {
    new Backdrop(this).setHealth(getHealth(this));
    const net = getNet(this);
    this.card = mountRoleCard(overlayRoot(), data.payload, { onReady: () => net.send('role.ready', {}) });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.card?.destroy();
      this.card = null;
    });
  }
}
