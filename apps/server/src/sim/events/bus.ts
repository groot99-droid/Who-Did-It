import type { PartyRoom } from '../../rooms/PartyRoom';

/**
 * The sim event bus (round 6, docs/round6/auto-admin.md 5; docs/round6/bible-seams.md 1): the modules emit what
 * happened (a kill, a death, a clue, a meeting, a vote, an ejection, a phase, Start, the end) and `runEvents`, the
 * Step stage after `runPhases`, delivers the tick's events to the subscribers and the match log. The vendettas and
 * the propagation matrix of rounds 7 to 9 are subscribers. Pre-seeded by 6Z: `emitSim` collects, `runEvents` is a
 * no-op; Session 6B fills the delivery and the round-6 emitters.
 */
export interface SimEvent {
  tick: number;
  kind: string;
  /** A seat id, never an avatar handle. */
  seat?: string;
  sceneId?: string;
  data?: Record<string, unknown>;
}

export type SimListener = (event: SimEvent, room: PartyRoom) => void;

interface Bus {
  pending: SimEvent[];
  listeners: Map<string, SimListener[]>;
}

const buses = new WeakMap<PartyRoom, Bus>();
function busOf(room: PartyRoom): Bus {
  let bus = buses.get(room);
  if (!bus) {
    bus = { pending: [], listeners: new Map() };
    buses.set(room, bus);
  }
  return bus;
}

export function emitSim(room: PartyRoom, event: SimEvent): void {
  busOf(room).pending.push(event);
}

export function onSim(room: PartyRoom, kind: string, fn: SimListener): void {
  const bus = busOf(room);
  const list = bus.listeners.get(kind) ?? [];
  list.push(fn);
  bus.listeners.set(kind, list);
}

/** The events emitted this tick and not yet delivered (the harness and the tests read them). */
export function pendingSim(room: PartyRoom): readonly SimEvent[] {
  return busOf(room).pending;
}

/** Step stage after `runPhases` (locked call site in `sim/Step.ts`). No-op until 6B delivers and logs. */
export function runEvents(room: PartyRoom): void {
  const bus = busOf(room);
  if (bus.pending.length === 0) return;
  // 6B: deliver to the listeners by kind, append to the auto log, send `admin.event` to an admin client.
  bus.pending = [];
}
