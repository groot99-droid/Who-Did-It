import Phaser from 'phaser';
import { setRoute } from '../flags';
import type { LobbySnapshot } from '../net/NetworkService';
import { buildLine, hideBackdrop, showBackdrop } from '../ui/backdrop';
import { type LobbyScreen, mountLobby } from '../ui/Lobby';
import { overlayRoot } from '../ui/dom';
import { getHealth, getNet } from './registry';

export class Lobby extends Phaser.Scene {
  private screen: LobbyScreen | null = null;

  constructor() {
    super('Lobby');
  }

  create(): void {
    showBackdrop({ status: buildLine(getHealth(this)) });
    const net = getNet(this);

    this.screen = mountLobby(overlayRoot(), {
      net,
      onStart: () => net.send('lobby.start', {}),
      onReady: (ready) => net.send('lobby.ready', { ready }),
      onLeave: () => void net.leave(),
      onNpcDifficulty: (level) => net.setNpcDifficulty(level),
      onAddNpc: () => net.addNpc(),
      onRemoveNpc: () => net.removeNpc(),
    });
    if (net.snapshot !== null) this.screen.update(net.snapshot);

    const onLobby = (snapshot: LobbySnapshot) => this.screen?.update(snapshot);
    const onReveal = () => this.scene.start('RoleReveal');
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
      hideBackdrop();
    });
  }
}
