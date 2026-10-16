import Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import { type MeetingFeed, REG_MEETING } from '../net/meeting';
import { mountMeeting, type MeetingScreen } from '../ui/Meeting';
import { overlayRoot } from '../ui/dom';
import { drawPortrait } from '../ui/portrait';

/**
 * The meeting: a DOM screen over a plain canvas. Started by the router on `meetingStart`, left standing
 * through the reveal, and stopped by the router when the `sceneEnter` after the reveal arrives (or on game
 * over). The scene reads the published meeting feed and never decides anything about the vote.
 */
export class Meeting extends Phaser.Scene {
  private screen: MeetingScreen | null = null;

  constructor() {
    super('Meeting');
  }

  /** The Notebook tab is wired here at integration: `screen.addTab('notebook', 'Notebook', (el) => new NotebookPanel(el, worldFeed))`. */
  get tabs(): MeetingScreen | null {
    return this.screen;
  }

  create(): void {
    const feed = this.registry.get(REG_MEETING) as MeetingFeed | undefined;
    if (feed === undefined) {
      this.scene.stop();
      return;
    }
    this.cameras.main.setBackgroundColor(palette.colors.ink);
    this.screen = mountMeeting(overlayRoot(), {
      feed,
      drawPortrait: (canvas, look, name) => drawPortrait(canvas, this.textures, look, name),
    });
    const refresh = () => this.screen?.update();
    feed.bus.on('voteResult', refresh);
    feed.bus.on('chat.msg', refresh);
    feed.bus.on('phaseChange', refresh);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      feed.bus.off('voteResult', refresh);
      feed.bus.off('chat.msg', refresh);
      feed.bus.off('phaseChange', refresh);
      this.screen?.destroy();
      this.screen = null;
    });
  }

  override update(): void {
    this.screen?.update();
  }
}
