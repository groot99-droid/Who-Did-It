// Round 9 (9T): the Studio's state and its pure helpers. No Phaser, so it is tested.
import mitt from 'mitt';
import { worldMove } from '../input/vectors';
import type { StudioSnapshot } from '../admin/StudioNet';

/** The server keeps the last 50 log lines and so does the client (docs/PROTOCOL.md, studio.log). */
export const LOG_LINES = 50;

export class StudioStore {
  readonly bus = mitt<{ change: undefined }>();
  snapshot: StudioSnapshot | null = null;
  log: string[] = [];
  /** The last refused command's message, '' once a command is accepted by the next snapshot. */
  refused = '';

  applySnapshot(s: StudioSnapshot): void {
    this.snapshot = s;
    this.refused = '';
    this.bus.emit('change', undefined);
  }

  addLog(lines: readonly string[]): void {
    this.log = [...this.log, ...lines].slice(-LOG_LINES);
    this.bus.emit('change', undefined);
  }

  refuse(msg: string): void {
    this.refused = msg;
    this.bus.emit('change', undefined);
  }

  reset(): void {
    this.snapshot = null;
    this.log = [];
    this.refused = '';
    this.bus.emit('change', undefined);
  }
}

export interface MoveState {
  dx: number;
  dy: number;
  sprint: boolean;
}

/** Keyboard state to the world-frame `studio.move` vector (the server normalises it); Shift or Space sprints. */
export function moveOf(pressed: ReadonlySet<string>): MoveState {
  const has = (...c: string[]) => c.some((k) => pressed.has(k));
  const dx = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0);
  const dy = (has('KeyS', 'ArrowDown') ? 1 : 0) - (has('KeyW', 'ArrowUp') ? 1 : 0);
  const w = worldMove({ dx, dy }, { dx: 0, dy: 0 });
  return { dx: w.dx, dy: w.dy, sprint: has('ShiftLeft', 'ShiftRight', 'Space') };
}
