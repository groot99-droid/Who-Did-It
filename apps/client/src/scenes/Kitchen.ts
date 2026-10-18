import Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import { type OnubFeed, REG_ONUB } from '../net/onub';
import { overlayRoot } from '../ui/dom';
import { mountPrep, type PrepScreen } from '../view/onub/PrepView';

const colorOf = (hex: string) => Number.parseInt(hex.slice(1), 16);
const KITCHEN_KEY = 'onub_kitchen';

/**
 * The quick-mode kitchen (GDD 3.11): Evening Prep and the prep board. The ONUB router starts it on the
 * `phaseChange` to dusk and keeps it through prepReveal. The canvas holds the owner's overview art
 * (`onub_kitchen`, four quadrants of 320 x 180 art px), or a labelled greybox until 5M's key loads; the four
 * room buttons, the rooms, the hand and the board are the DOM of `view/onub/PrepView.ts` laid over it.
 */
export class Kitchen extends Phaser.Scene {
  private screen: PrepScreen | null = null;

  constructor() {
    super('Kitchen');
  }

  create(): void {
    const feed = this.registry.get(REG_ONUB) as OnubFeed | undefined;
    if (feed === undefined) {
      this.scene.stop();
      return;
    }
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(palette.colors.ink);
    if (this.textures.exists(KITCHEN_KEY)) {
      this.add.image(width / 2, height / 2, KITCHEN_KEY).setDisplaySize(width, height);
    } else {
      this.drawGreybox(width, height);
    }
    this.screen = mountPrep(overlayRoot(), feed);
    const refresh = () => this.screen?.update();
    feed.bus.on('phaseChange', refresh);
    feed.bus.on('board', refresh);
    feed.bus.on('nightReveal', refresh);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      feed.bus.off('phaseChange', refresh);
      feed.bus.off('board', refresh);
      feed.bus.off('nightReveal', refresh);
      this.screen?.destroy();
      this.screen = null;
    });
  }

  override update(): void {
    this.screen?.update();
  }

  /** Four labelled quadrants in the order of the art plan 5.4: fridge, mixer / proofing, oven. */
  private drawGreybox(width: number, height: number): void {
    const tints = [palette.colors.moon, palette.colors.slate, palette.colors.lantern, palette.colors.blood];
    tints.forEach((tint, i) => {
      const x = (i % 2) * (width / 2);
      const y = Math.floor(i / 2) * (height / 2);
      this.add
        .rectangle(x, y, width / 2, height / 2, colorOf(tint), 0.35)
        .setOrigin(0)
        .setStrokeStyle(2, colorOf(palette.colors.ink));
    });
  }
}
