import { TICK_RATE } from '@wdi/shared/constants';
import type { MoveCmd } from '../net/world';
import { keyVector, worldMove } from './vectors';

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
  /** Key code -> handler(down). Held keys get a final `false` when focus is lost. */
  private readonly bindings = new Map<string, (down: boolean) => void>();
  private readonly down = new Set<string>();

  constructor(private sink: MoveSink) {}

  /** A new match brings a new feed; the controller outlives the World scene, so repoint it. */
  setSink(sink: MoveSink): void {
    this.sink = sink;
  }

  /** Adds the touch controls' state to the keyboard's. */
  attachTouch(source: InputSource): void {
    this.touch = source;
  }

  /** Calls `handler(true)` on keydown (never on auto-repeat) and `handler(false)` on keyup or blur. */
  bind(code: string, handler: (down: boolean) => void): void {
    this.bindings.set(code, handler);
  }

  /** Drops every binding (a held key is released first); the World scene rebinds on each start. */
  unbindAll(): void {
    this.releaseBound();
    this.bindings.clear();
  }

  /** Idempotent: the World scene calls it on every start, the router's `stop()` ends it between screens. */
  start(): void {
    if (this.timer !== null) return;
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

  /** The command for the current input state: screen-axis keys and stick turned into the world frame (SPRITES 10.8). */
  current(): Omit<MoveCmd, 'seq'> {
    const { dx, dy } = worldMove(keyVector(this.pressed), this.touch?.vector() ?? { dx: 0, dy: 0 });
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
    const bound = this.bindings.get(e.code);
    if (bound && !e.repeat && !this.down.has(e.code) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      this.down.add(e.code);
      bound(true);
    }
    if (/^(Key[WASD]|Arrow(Up|Down|Left|Right)|Space|Shift(Left|Right))$/.test(e.code)) {
      this.pressed.add(e.code);
      e.preventDefault();
    }
  };

  private readonly keyup = (e: KeyboardEvent): void => {
    this.pressed.delete(e.code);
    if (this.down.delete(e.code)) this.bindings.get(e.code)?.(false);
  };

  private releaseBound(): void {
    for (const code of this.down) this.bindings.get(code)?.(false);
    this.down.clear();
  }

  /** Lose focus or hide the tab: let go of everything, tell the server once, and do not catch up. */
  private readonly release = (): void => {
    this.pressed.clear();
    this.releaseBound();
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
