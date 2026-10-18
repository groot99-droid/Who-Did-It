import Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import onubRoles from '@wdi/content/data/roles.onub.json';
import { type OnubFeed, REG_ONUB } from '../net/onub';
import { overlayRoot } from '../ui/dom';
import { AudioBus } from '../view/AudioBus';
import { manifestImageUrls } from '../view/assets';
import { NightSound, NightView } from '../view/onub/NightView';
import { getFlags, REG_AUDIO } from './registry';

const SCENE_KEYS = Object.keys(onubRoles.scenes).map((id) => `onub_scene_${id}`);

/**
 * The quick-mode night and dawn (GDD 3.11): lights-out for a sleeper, the role scene and card table for a
 * waker, then the dawn panel. The ONUB router starts it on the `phaseChange` to night and keeps it through
 * dawn. A DOM screen over a plain canvas; the scene decides nothing, it draws the published ONUB feed.
 */
export class Night extends Phaser.Scene {
  private view: NightView | null = null;

  constructor() {
    super('Night');
  }

  create(): void {
    const feed = this.registry.get(REG_ONUB) as OnubFeed | undefined;
    if (feed === undefined) {
      this.scene.stop();
      return;
    }
    this.cameras.main.setBackgroundColor(palette.colors.ink);
    const view = new NightView(overlayRoot(), feed);
    this.view = view;

    void manifestImageUrls(getFlags(this).art, import.meta.env.BASE_URL, SCENE_KEYS).then((scenes) => {
      if (this.view === view) view.setArt({ scenes });
    });

    // The bus may not exist yet (quick mode never starts World): make it, as the Meeting's stamp reads it too.
    let audio = this.registry.get(REG_AUDIO) as AudioBus | undefined;
    if (audio === undefined) {
      audio = new AudioBus();
      this.registry.set(REG_AUDIO, audio);
      void audio.load();
    }
    const sound = new NightSound(feed, audio);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      sound.destroy();
      view.destroy();
      this.view = null;
    });
  }

  override update(): void {
    this.view?.update();
  }
}
