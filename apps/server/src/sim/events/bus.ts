import { Phase, Winner } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { appendLog } from '../auto/log';

/**
 * The sim event bus (round 6, docs/round6/auto-admin.md 5; docs/round6/bible-seams.md 1): the modules emit what
 * happened (a kill, a death, a clue, a meeting, a vote, an ejection) and `runEvents`, the Step stage after
 * `runPhases`, adds the tick's phase change (with `start` when it leaves the lobby and `end` at game over), then
 * delivers the tick's events in emission order to the match log and the subscribers. The vendettas and the
 * propagation matrix of rounds 7 to 9 are subscribers. An event names seats by seat id, never by avatar handle
 * (DECISIONS A84).
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

/** `onSim(room, ANY_SIM, fn)` hears every kind (the admin room's `admin.event`, the log pane). */
export const ANY_SIM = '*';

interface Bus {
  pending: SimEvent[];
  listeners: Map<string, SimListener[]>;
  /** The phase `runEvents` last saw (the room's phase when the bus was made). */
  phase: number;
}

const buses = new WeakMap<PartyRoom, Bus>();
function busOf(room: PartyRoom): Bus {
  let bus = buses.get(room);
  if (!bus) {
    bus = { pending: [], listeners: new Map(), phase: room.state.phase };
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

/**
 * `phase` (and `start` when the room leaves the lobby) from the change since the last run: `setPhase` lives in the
 * locked `Flow.ts`, so the bus watches the phase instead of hooking it. A change made after the step (the lobby
 * stages of the tick loop) is seen on the next tick; two changes in one tick read as one, `from` the first.
 */
function notePhase(room: PartyRoom, bus: Bus): void {
  const { phase, tick } = room.state;
  const from = bus.phase;
  bus.phase = phase;
  if (from === phase) return;
  if (from === Phase.lobby) {
    const settings = room.state.settings;
    bus.pending.push({
      tick,
      kind: 'start',
      data: { mode: settings.mode, map: settings.map, seats: room.state.players.size },
    });
  }
  bus.pending.push({ tick, kind: 'phase', data: { from, to: phase } });
  if (phase === Phase.gameOver) bus.pending.push({ tick, kind: 'end', data: { winner: winnerName(room) } });
}

const winnerName = (room: PartyRoom): string =>
  Object.entries(Winner).find(([, v]) => v === room.state.winner)?.[0] ?? String(room.state.winner);

/**
 * Step stage after `runPhases` (locked call site in `sim/Step.ts`). An event a listener emits waits for the next
 * tick, so a subscriber never reorders the tick it is reading.
 */
export function runEvents(room: PartyRoom): void {
  const bus = busOf(room);
  notePhase(room, bus);
  if (bus.pending.length === 0) return;
  const events = bus.pending;
  bus.pending = [];
  const any = bus.listeners.get(ANY_SIM) ?? [];
  for (const event of events) {
    appendLog(room, event);
    for (const fn of bus.listeners.get(event.kind) ?? []) fn(event, room);
    for (const fn of any) fn(event, room);
  }
}
