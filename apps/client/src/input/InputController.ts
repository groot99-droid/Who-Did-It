import { TICK_RATE } from '@wdi/shared/constants';
import type { MoveCmd } from '../net/world';
import { keyVector } from './vectors';

// Sends `input.move` at 20 Hz from a timer, not from the render loop, so a slow frame or a background tab
// cannot starve or flood the server. The newest state wins on the server; here we only report it.

export interface InputSource {
  /** Current analog vector (touch stick), or zero. */
  vector(): { dx: number; dy: number };
  sprint(): boolean;
  sneak(): boolean;
}

export interface MoveSink {
  sendMove(cmd: MoveCmd): void;
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;

export class InputController {
  private readonly pressed = new Set<string>();
  private timer: number | null = null;
  private seq = 0;
  private lastKey = '';
  private lastSentAt = 0;
  private touch: InputSource | null = null;
  private onInteract: (() => void) | null = null;

  constructor(private readonly sink: MoveSink) {}

  /** Adds the touch controls' state to the keyboard's. */
  attachTouch(source: InputSource): void {
    this.touch = source;
  }

  onUse(handler: () => void): void {
    this.onInteract = handler;
  }

  start(): void {
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', this.release);
    document.addEventListener('visibilitychange', this.visibility);
    this.timer = window.setInterval(this.tick, 1000 / TICK_RATE);
  }

  stop(): void {
    window.removeEventListener('keydown', this.keydown);
    window.removeEventListener('keyup', this.keyup);
    window.removeEventListener('blur', this.release);
    document.removeEventListener('visibilitychange', this.visibility);
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.release();
  }

  /** The command for the current input state. */
  current(): Omit<MoveCmd, 'seq'> {
    const k = keyVector(this.pressed);
    const t = this.touch?.vector() ?? { dx: 0, dy: 0 };
    const dx = k.dx + t.dx;
    const dy = k.dy + t.dy;
    return {
      dx,
      dy,
      sprint: this.pressed.has('Space') || (this.touch?.sprint() ?? false),
      sneak:
        this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight') || (this.touch?.sneak() ?? false),
    };
  }

  private readonly tick = (): void => {
    const now = performance.now();
    const cmd = this.current();
    const moving = cmd.dx !== 0 || cmd.dy !== 0;
    const key = `${cmd.dx.toFixed(2)},${cmd.dy.toFixed(2)},${cmd.sprint},${cmd.sneak}`;
    // While moving, send every tick: the server stops a player whose input goes quiet. A change to
    // standing still is sent once, then a slow heartbeat is enough.
    if (!moving && key === this.lastKey && now - this.lastSentAt < 500) return;
    this.lastKey = key;
    this.lastSentAt = now;
    this.sink.sendMove({ seq: ++this.seq, ...cmd });
  };

  private readonly keydown = (e: KeyboardEvent): void => {
    if (isTyping(e.target)) return;
    if (e.code === 'KeyE' && !e.repeat) this.onInteract?.();
    if (/^(Key[WASD]|Arrow(Up|Down|Left|Right)|Space|Shift(Left|Right))$/.test(e.code)) {
      this.pressed.add(e.code);
      e.preventDefault();
    }
  };

  private readonly keyup = (e: KeyboardEvent): void => {
    this.pressed.delete(e.code);
  };

  /** Lose focus or hide the tab: let go of everything, tell the server once, and do not catch up. */
  private readonly release = (): void => {
    this.pressed.clear();
  };

  private readonly visibility = (): void => {
    this.release();
    // A hidden tab's timer is throttled to about 1 Hz; on return send one fresh state, not a backlog.
    this.lastKey = '';
    this.lastSentAt = 0;
    if (!document.hidden) this.tick();
    else this.sink.sendMove({ seq: ++this.seq, dx: 0, dy: 0, sprint: false, sneak: false });
  };
}
