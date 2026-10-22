import Phaser from 'phaser';
import { setRoute } from '../flags';
import { buildIsStale, REFRESH_MESSAGE } from '../health';
import { mountLanding } from '../ui/Landing';
import { overlayRoot, type Screen } from '../ui/dom';
import { Backdrop } from '../view/Backdrop';
import type { MusicBus } from '../view/MusicBus';
import { REG_MUSIC, getFlags, getHealth, getNet } from './registry';

export class Landing extends Phaser.Scene {
  private screen: Screen | null = null;

  constructor() {
    super('Landing');
  }

  create(): void {
    new Backdrop(this).setHealth(getHealth(this));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.screen?.destroy());

    const net = getNet(this);
    const flags = getFlags(this);

    const enterLobby = (code: string) => {
      setRoute(`lobby/${code}`);
      this.scene.start('Lobby');
    };

    const show = () => {
      this.screen = mountLanding(overlayRoot(), {
        joinCode: flags.joinCode,
        music: this.registry.get(REG_MUSIC) as MusicBus | undefined,
        onCreate: async (name) => enterLobby(await net.create(name)),
        onJoin: async (code, name) => enterLobby(await net.join(code, name)),
        explainFailure: async () => (!flags.mock && (await buildIsStale()) ? REFRESH_MESSAGE : null),
      });
    };

    // A reload on #/lobby/CODE rejoins through the stored reconnection token, if there is one.
    if (flags.resumeCode !== null) {
      const code = flags.resumeCode;
      void net.resume(code).then((ok) => {
        if (!this.scene.isActive()) return;
        if (ok) return enterLobby(code);
        setRoute('');
        show();
      });
    } else {
      show();
    }
  }
}
