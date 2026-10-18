import onubBalance from '@wdi/content/data/balance.onub.json';
import type { OnubFeed } from '../../net/onub';

/** The part of `AudioBus` the night uses. */
export interface NightAudioOut {
  play(key: 'door_open' | 'door_close' | 'creak'): void;
  playLoop(key: 'storm'): void;
  stopLoop(key: 'storm'): void;
}

export interface NightSoundOptions {
  rand?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
}

/**
 * Everything a page hears at night (GDD 3.11, onub-contract.md 6, "Audio at night"): the sleepers' sound bed
 * (a storm loop and muffled creaks at random gaps from a local RNG) plus the narrator's call for each change
 * of `OnubBoard.window`. It subscribes to the board only. A waker's page hears exactly this: it never
 * listens to `nightWake`, `nightReveal` or `nightSleep` (invariant O9).
 */
export class NightSound {
  private last: string;
  private timer: unknown = null;
  private readonly rand: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (id: unknown) => void;
  private readonly onBoard = (board: { window: string }) => {
    if (board.window === this.last) return;
    this.last = board.window;
    this.out.play(board.window === '' ? 'door_close' : 'door_open');
  };

  constructor(
    private readonly feed: OnubFeed,
    private readonly out: NightAudioOut,
    opts: NightSoundOptions = {},
  ) {
    this.rand = opts.rand ?? Math.random;
    this.setTimer = opts.setTimer ?? ((fn, ms) => window.setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((id) => window.clearTimeout(id as number));
    this.last = feed.board().window;
    feed.bus.on('board', this.onBoard);
    out.playLoop('storm');
    this.pulse();
  }

  private pulse(): void {
    const { sleeperPulseMinS: lo, sleeperPulseMaxS: hi } = onubBalance.timers;
    this.timer = this.setTimer(
      () => {
        this.out.play('creak');
        this.pulse();
      },
      (lo + this.rand() * (hi - lo)) * 1000,
    );
  }

  destroy(): void {
    this.feed.bus.off('board', this.onBoard);
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.out.stopLoop('storm');
  }
}
