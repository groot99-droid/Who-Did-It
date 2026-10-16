import Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import balance from '@wdi/content/data/balance.json';
import { TICK_RATE } from '@wdi/shared/constants';
import { REG_MEETING, type MeetingFeed } from '../net/meeting';
import { mountGameOver, type GameOverScreen } from '../ui/GameOver';
import { overlayRoot } from '../ui/dom';
import { MEETING_PHASE } from '../ui/meetingText';
import { getNet } from './registry';

/**
 * Shows the winner and every seat's role and faction, with a countdown to the lobby. The router returns the
 * party to the lobby when the server's phase does; this scene only counts down.
 */
export class GameOver extends Phaser.Scene {
  private screen: GameOverScreen | null = null;
  private endsAt = 0;

  constructor() {
    super('GameOver');
  }

  create(): void {
    const feed = this.registry.get(REG_MEETING) as MeetingFeed | undefined;
    const over = feed?.over();
    if (feed === undefined || over === null || over === undefined) {
      this.scene.stop();
      return;
    }
    this.cameras.main.setBackgroundColor(palette.colors.ink);
    // The server's phase clock when it runs the game-over phase, else the balance length from now.
    const clock = feed.clock();
    const left =
      clock.phase === MEETING_PHASE.gameOver && clock.phaseEndsTick > clock.tick
        ? (clock.phaseEndsTick - clock.tick) / TICK_RATE
        : balance.phases.gameOverS;
    this.endsAt = performance.now() + left * 1000;
    this.screen = mountGameOver(overlayRoot(), {
      over,
      roster: feed.roster(),
      selfId: feed.selfId,
      seconds: left,
      onLeave: () => void getNet(this).leave(),
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.screen?.destroy();
      this.screen = null;
    });
  }

  override update(): void {
    this.screen?.setSeconds((this.endsAt - performance.now()) / 1000);
  }
}
