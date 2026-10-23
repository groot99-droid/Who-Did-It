import Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import { type MeetingFeed, REG_MEETING } from '../net/meeting';
import { REG_WORLD, type WorldFeed } from '../net/world';
import { NotebookPanel } from '../view/NotebookPanel';
import { mountMeeting, type MeetingScreen } from '../ui/Meeting';
import { overlayRoot } from '../ui/dom';
import { mountMatchArtSwitch } from '../ui/artStyle/ArtStyleSwitch';
import { drawPortrait } from '../ui/portrait';
import { ART_STYLE_CHANGED } from '../view/artStyle';
import { outsOf } from '../ui/meetingText';
import type { AudioBus } from '../view/AudioBus';
import { REG_AUDIO } from './registry';

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

  /** The screen, so a test can reach its tabs. */
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
    // The Notebook tab shows this player's own entries from the world feed (M | N seam, A38).
    const world = this.registry.get(REG_WORLD) as WorldFeed | undefined;
    if (world) this.screen.addTab('notebook', 'Notebook', (panel) => new NotebookPanel(panel, world));
    const refresh = () => this.screen?.update();
    // The stamp lands with the reveal: one sound for an ejection or any turned-out seat (silent until the
    // audio manifest lists `stamp`, and when the World scene has not published its bus).
    const onResult = (result: Parameters<typeof outsOf>[0]) => {
      const audio = this.registry.get(REG_AUDIO) as AudioBus | undefined;
      if (outsOf(result).length > 0) audio?.play('stamp');
      refresh();
    };
    // A style switch (A79): the portraits are drawn from the textures, so paint them again.
    const onArtStyle = () => this.screen?.repaintPortraits();
    this.game.events.on(ART_STYLE_CHANGED, onArtStyle);
    const artSwitch = mountMatchArtSwitch(overlayRoot());
    feed.bus.on('voteResult', onResult);
    feed.bus.on('chat.msg', refresh);
    feed.bus.on('phaseChange', refresh);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(ART_STYLE_CHANGED, onArtStyle);
      artSwitch.destroy();
      feed.bus.off('voteResult', onResult);
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
