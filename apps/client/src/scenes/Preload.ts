import Phaser from 'phaser';
import { installWorldRouter } from '../net/worldRouter';
import { installArtSwitch } from '../view/artSwap';
import { applyFilters, queueManifest, resolveManifest } from '../view/assets';
import { ensureGreybox } from '../view/greybox';
import { mountLoadingScreen } from '../view/LoadingScreen';
import { MusicBus } from '../view/MusicBus';
import { installMusicDirector } from '../view/MusicDirector';
import { overlayRoot } from '../ui/dom';
import { REG_MUSIC, getFlags, getNet } from './registry';

/**
 * Loads the asset manifest by key (placeholder or real art, ?art=placeholder), draws the greybox tileset
 * and installs the router that starts the World scene when the server sends `sceneEnter`.
 */
export class Preload extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  create(): void {
    const flags = getFlags(this);
    const base = import.meta.env.BASE_URL;
    ensureGreybox(this.textures);
    installArtSwitch(this.game, flags.art, base);
    installWorldRouter(this.game, getNet(this), { mock: flags.mock });
    // Round 6 (locked call sites): the music bus and its director (6L), the loading screen (6K), the admin route (6D).
    this.registry.set(REG_MUSIC, new MusicBus());
    installMusicDirector(this.game, getNet(this));
    const loading = mountLoadingScreen(this, overlayRoot());
    const first = flags.admin ? 'Admin' : 'Landing';
    void resolveManifest(flags.art, base).then(
      (manifest) => {
        queueManifest(this.load, manifest);
        this.load.once(Phaser.Loader.Events.COMPLETE, () => {
          applyFilters(this.textures, manifest);
          loading.destroy();
          this.scene.start(first);
        });
        this.load.start();
      },
      (err) => {
        // No art at all must not block the lobby: the World scene falls back to plain shapes.
        console.warn('[wdi] asset manifest unavailable', err);
        loading.destroy();
        this.scene.start(first);
      },
    );
  }
}
