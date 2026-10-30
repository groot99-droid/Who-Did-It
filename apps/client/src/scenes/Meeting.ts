import Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import { type MeetingFeed, REG_MEETING } from '../net/meeting';
import { REG_WORLD, type WorldFeed } from '../net/world';
import { NotebookPanel } from '../view/NotebookPanel';
import { mountMeeting, type MeetingScreen } from '../ui/Meeting';
import { CIVIC_COPY } from '../ui/copy/civic';
import { NOTES_COPY } from '../ui/copy/notes';
import { mountMeetingNotes } from '../ui/meetingNotes';
import { mountMeetingPapers } from '../ui/econ/meetingPapers';
import { overlayRoot } from '../ui/dom';
import { drawPortrait } from '../ui/portrait';
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
    // Round 8, 8D (GDD 3.23): presenting a Seal or an Indulgence, and showing or burning a notice.
    if (world)
      this.screen.addTab('papers', CIVIC_COPY['papers.tab'], (panel) => mountMeetingPapers(panel, world));
    // Round 8, 8T (GDD 3.8): the meeting notes, which carry no speaker.
    this.screen.addTab('notes', NOTES_COPY['meeting.tab.notes'], (panel) => mountMeetingNotes(panel, feed));
    const refresh = () => this.screen?.update();
    // The stamp lands with the reveal: one sound for an ejection or any turned-out seat (silent until the
    // audio manifest lists `stamp`, and when the World scene has not published its bus).
    const onResult = (result: Parameters<typeof outsOf>[0]) => {
      const audio = this.registry.get(REG_AUDIO) as AudioBus | undefined;
      if (outsOf(result).length > 0) audio?.play('stamp');
      refresh();
    };
    // No art switch over the meeting (round 10, S5, A534): the style is fixed from Start to game over.
    feed.bus.on('voteResult', onResult);
    feed.bus.on('chat.msg', refresh);
    feed.bus.on('phaseChange', refresh);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
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
