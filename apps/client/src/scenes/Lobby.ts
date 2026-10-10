import Phaser from 'phaser';
import { setRoute } from '../flags';
import type { LobbySnapshot } from '../net/NetworkService';
import type { RoleRevealPayload } from '../net/protocol';
import { type LobbyScreen, mountLobby } from '../ui/Lobby';
import { overlayRoot } from '../ui/dom';
import { Backdrop } from '../view/Backdrop';
import { getHealth, getNet } from './registry';

export class Lobby extends Phaser.Scene {
  private screen: LobbyScreen | null = null;

  constructor() {
    super('Lobby');
  }

  create(): void {
    new Backdrop(this).setHealth(getHealth(this));
    const net = getNet(this);

    this.screen = mountLobby(overlayRoot(), {
      onStart: () => net.send('lobby.start', {}),
      onLeave: () => void net.leave(),
    });
    if (net.snapshot !== null) this.screen.update(net.snapshot);

    const onLobby = (snapshot: LobbySnapshot) => this.screen?.update(snapshot);
    const onReveal = (payload: RoleRevealPayload) => this.scene.start('RoleReveal', { payload });
    const onLeft = () => {
      setRoute('');
      this.scene.start('Landing');
    };
    net.bus.on('lobby', onLobby);
    net.bus.on('roleReveal', onReveal);
    net.bus.on('left', onLeft);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      net.bus.off('lobby', onLobby);
      net.bus.off('roleReveal', onReveal);
      net.bus.off('left', onLeft);
      this.screen?.destroy();
      this.screen = null;
    });
  }
}
