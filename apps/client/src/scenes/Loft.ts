import Phaser from 'phaser';
import onubBalance from '@wdi/content/data/balance.onub.json';
import { REG_INPUT, REG_WORLD, type WorldFeed } from '../net/world';
import { overlayRoot } from '../ui/dom';
import { AudioBus } from '../view/AudioBus';
import { LoftView } from '../view/LoftView';
import { manifestImageUrls } from '../view/assets';
import { REG_AUDIO, getFlags } from './registry';

const MIN_MS = onubBalance.timers.sleeperPulseMinS * 1000;
const MAX_MS = onubBalance.timers.sleeperPulseMaxS * 1000;
const ART_KEYS = ['loft_backdrop', 'prop_bedroll', 'prop_bedroll_self'] as const;

/**
 * The quick-mode loft (GDD 3.11, A21, A39): a sleeper's dark view with one bedroll per seat and local
 * noise pulses, no clock, no HUD and no input. Registered in `main.ts`; the router starts it on
 * `nightSleep` and stops it on a wake, a meeting or the return to the lobby. It reads the roster's names
 * only, never a `sceneId`: where anyone sleeps or wakes must not show here.
 */
export class Loft extends Phaser.Scene {
  private view: LoftView | null = null;
  private feed: WorldFeed | null = null;
  private pulse = 0;

  constructor() {
    super('Loft');
  }

  create(): void {
    this.feed = (this.registry.get(REG_WORLD) as WorldFeed | undefined) ?? null;
    (this.registry.get(REG_INPUT) as { stop(): void } | undefined)?.stop();
    const view = new LoftView(overlayRoot());
    this.view = view;
    this.refreshSeats();

    void manifestImageUrls(getFlags(this).art, import.meta.env.BASE_URL, ART_KEYS).then((urls) => {
      if (this.view !== view) return;
      view.setArt({
        backdrop: urls.loft_backdrop,
        bedroll: urls.prop_bedroll,
        bedrollSelf: urls.prop_bedroll_self,
      });
      this.refreshSeats();
    });

    const audio: AudioBus = this.registry.get(REG_AUDIO) ?? new AudioBus();
    if (!this.registry.has(REG_AUDIO)) {
      this.registry.set(REG_AUDIO, audio);
      void audio.load().then(() => audio.playLoop('storm'));
    } else audio.playLoop('storm');

    // A muffled creak from a random edge, at a random gap (a local RNG: nothing here is the server's).
    const schedule = () => {
      this.pulse = window.setTimeout(
        () => {
          view.creak(Math.random);
          audio.play('creak');
          schedule();
        },
        MIN_MS + Math.random() * (MAX_MS - MIN_MS),
      );
    };
    schedule();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.clearTimeout(this.pulse);
      audio.stopLoop('storm');
      view.destroy();
      this.view = null;
    });
  }

  override update(): void {
    this.refreshSeats();
  }

  private refreshSeats(): void {
    const feed = this.feed;
    if (!feed || !this.view) return;
    this.view.setSeats(
      feed.snapshot().map(({ id, name }) => ({ id, name })),
      feed.selfId,
    );
  }
}
