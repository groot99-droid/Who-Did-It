import Phaser from 'phaser';
import { installWorldRouter } from '../net/worldRouter';
import { applyFilters, queueManifest, resolveManifest } from '../view/assets';
import { ensureGreybox } from '../view/greybox';
import { getFlags, getNet } from './registry';

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
    installWorldRouter(this.game, getNet(this), { mock: flags.mock });
    void resolveManifest(flags.art, base).then(
      (manifest) => {
        queueManifest(this.load, manifest);
        this.load.once(Phaser.Loader.Events.COMPLETE, () => {
          applyFilters(this.textures, manifest);
          this.scene.start('Landing');
        });
        this.load.start();
      },
      (err) => {
        // No art at all must not block the lobby: the World scene falls back to plain shapes.
        console.warn('[wdi] asset manifest unavailable', err);
        this.scene.start('Landing');
      },
    );
  }
}
