// The pure side of the admin page (docs/round6/auto-admin.md 8): which scenes get a viewport, how the grid divides the
// canvas, what a seat's label says and the store the DOM panels and the viewports both read. No Phaser, no DOM.
import mitt, { type Emitter } from 'mitt';
import type { AdminSeat, InvariantFailure, SimEventWire } from '@wdi/shared/protocol';
import type { AdminSnapshot } from './AdminNet';

/** The grid holds at most this many viewports; more occupied scenes queue in the inspector (seams.md 8). */
export const MAX_VIEWPORTS = 6;
/** The log pane keeps this many event rows. */
export const MAX_EVENTS = 200;

/** A seat as the inspector shows it: the wire's fields, plus the two lists the wire does not carry yet. */
export type InspectedSeat = AdminSeat & { inventory?: readonly string[]; notebook?: readonly string[] };

export interface Cell {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Columns and rows for `n` viewports: 1 fills the canvas, 2 side by side, 3 to 4 a 2x2, 5 to 6 a 3x2. */
export function gridShape(n: number): { cols: number; rows: number } {
  const count = Math.max(1, Math.min(MAX_VIEWPORTS, n));
  const cols = count === 1 ? 1 : count <= 4 ? 2 : 3;
  return { cols, rows: Math.ceil(count / cols) };
}

/** The cells of `keys` (at most six) on a canvas of `width` by `height`: 426x360 each for six on 1280x720. */
export function gridCells(keys: readonly string[], width: number, height: number): Cell[] {
  const shown = keys.slice(0, MAX_VIEWPORTS);
  if (shown.length === 0) return [];
  const { cols, rows } = gridShape(shown.length);
  const w = Math.floor(width / cols);
  const h = Math.floor(height / rows);
  return shown.map((key, i) => ({ key, x: (i % cols) * w, y: Math.floor(i / cols) * h, w, h }));
}

/** The label drawn over a seat in a viewport: its name, true role and, when it wears a cover, whose look it has. */
export function labelOf(seat: AdminSeat): string {
  const cover = seat.coverOf === undefined ? '' : ` (as ${seat.look})`;
  return `${seat.name}: ${seat.roleId}${cover}${seat.dead ? ' †' : ''}`;
}

/** The scene each seat stands in, in the order the viewports keep: first seen first, a scene leaves when it empties. */
export function nextOrder(previous: readonly string[], seats: readonly AdminSeat[]): string[] {
  const occupied = new Set(seats.map((s) => s.sceneId));
  const kept = previous.filter((id) => occupied.has(id));
  const known = new Set(kept);
  for (const s of seats) {
    if (!known.has(s.sceneId)) {
      known.add(s.sceneId);
      kept.push(s.sceneId);
    }
  }
  return kept;
}

/** The yaw (radians clockwise from world north, as `Presence.yaw`) of a step from (x0, y0) to (x1, y1). */
export const yawOfStep = (dx: number, dy: number): number => Math.atan2(dx, -dy);

export type StoreEvents = { change: undefined; reset: undefined };

/** Everything the panels and the viewports share; one instance per admin page. */
export class AdminStore {
  readonly bus: Emitter<StoreEvents> = mitt<StoreEvents>();
  snapshot: AdminSnapshot | null = null;
  events: SimEventWire[] = [];
  failures: InvariantFailure[] = [];
  selected: string | null = null;
  followed: string | null = null;
  /** Occupied scenes in viewport order (see `nextOrder`); the first six have a viewport. */
  order: string[] = [];
  /** Wall time (ms) of the last snapshot, for the viewports' interpolation. */
  receivedAt = 0;

  applySnapshot(snap: AdminSnapshot, now: number): void {
    this.snapshot = snap;
    this.receivedAt = now;
    this.order = nextOrder(this.order, snap.seats);
    for (const f of snap.invariants) this.addFailure(f);
    if (this.followed !== null && !snap.seats.some((s) => s.id === this.followed)) this.followed = null;
    this.bus.emit('change');
  }

  addEvents(events: readonly SimEventWire[]): void {
    this.events = [...this.events, ...events].slice(-MAX_EVENTS);
    this.bus.emit('change');
  }

  addFailure(f: InvariantFailure): void {
    if (this.failures.some((x) => x.name === f.name && x.tick === f.tick && x.detail === f.detail)) return;
    this.failures = [...this.failures, f];
    this.bus.emit('change');
  }

  /** Reset clears the failure rows (they stay until then) and the event stream. */
  reset(): void {
    this.failures = [];
    this.events = [];
    this.followed = null;
    this.bus.emit('reset');
    this.bus.emit('change');
  }

  seat(id: string | null): InspectedSeat | null {
    if (id === null) return null;
    return this.snapshot?.seats.find((x) => x.id === id) ?? null;
  }

  select(id: string | null): void {
    this.selected = id;
    this.bus.emit('change');
  }

  follow(id: string | null): void {
    this.followed = id;
    this.bus.emit('change');
  }

  /** Swaps a queued scene into the grid: it takes the first slot. */
  pin(sceneId: string): void {
    this.order = [sceneId, ...this.order.filter((id) => id !== sceneId)];
    this.bus.emit('change');
  }

  /** The scenes with a viewport right now: the followed seat's scene alone, else the first six. */
  visibleScenes(): string[] {
    if (this.followed !== null) {
      const at = this.snapshot?.seats.find((s) => s.id === this.followed)?.sceneId;
      if (at !== undefined) return [at];
    }
    return this.order.slice(0, MAX_VIEWPORTS);
  }

  queuedScenes(): string[] {
    return this.followed !== null ? this.order : this.order.slice(MAX_VIEWPORTS);
  }
}
