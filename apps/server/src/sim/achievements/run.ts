import { achievements, type Achievement } from '@wdi/content';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { ANY_SIM, onSim, type SimEvent } from '../events/bus';

/**
 * Achievements (round 10, E1; GDD 3.28). One bus subscriber per room: every event of a tick is read once the bus
 * delivers it in `step()` (`runAchievements`, a Step stage after `runEvents`), never in a message callback. A step is a
 * pattern on one bus kind; steps are done in order, and a step counts only after the one before it. Progress is the
 * room's memory for the match, per seat. The `achv` message goes to the earning seat's own client and nowhere else, and
 * draws no random number.
 */

/** `achv` (S2C, private): the earner's client alone. `step` is steps done, `steps` the steps in all. */
export const ACHV_MSG = 'achv';
export interface AchvPayload {
  id: string;
  step: number;
  steps: number;
  done: boolean;
}

interface Progress {
  /** Steps finished. */
  step: number;
  /** Matching events seen toward the current step. */
  seen: number;
  done: boolean;
}

interface Memory {
  progress: Map<string, Map<string, Progress>>;
}

const memories = new WeakMap<PartyRoom, Memory>();
const list: readonly Achievement[] = Object.values(achievements.achievements);
/** Achievements by the bus kinds their steps name, to skip the rest at once. */
const byKind = new Map<string, Achievement[]>();
for (const a of list)
  for (const kind of new Set(a.steps.map((s) => s.on))) byKind.set(kind, [...(byKind.get(kind) ?? []), a]);

/** The seats that `who` names for an event: only those with a client, since an NPC seat earns nothing. */
function seatsOf(room: PartyRoom, who: string, ev: SimEvent): string[] {
  if (who === 'seat') return ev.seat === undefined ? [] : [ev.seat];
  if (who === 'humans')
    return room.clients.map((c) => c.sessionId).filter((id) => room.state.players.has(id));
  const named = ev.data?.[who.slice('data.'.length)];
  return typeof named === 'string' ? [named] : [];
}

const matches = (where: Record<string, unknown>, ev: SimEvent): boolean =>
  Object.entries(where).every(([k, v]) => ev.data?.[k] === v);

function hear(room: PartyRoom, memory: Memory, ev: SimEvent): void {
  // A new match (the bus's `start`) starts every achievement's steps again; the device keeps only what was earned.
  if (ev.kind === 'start') memory.progress.clear();
  for (const a of byKind.get(ev.kind) ?? []) {
    // The current step of each seat differs, so find the seats from every step that names this kind.
    const seats = new Set(a.steps.filter((s) => s.on === ev.kind).flatMap((s) => seatsOf(room, s.who, ev)));
    for (const seat of seats) {
      const client = room.clients.getById(seat);
      if (client === undefined) continue;
      const mine = memory.progress.get(seat) ?? new Map<string, Progress>();
      memory.progress.set(seat, mine);
      const p = mine.get(a.id) ?? { step: 0, seen: 0, done: false };
      mine.set(a.id, p);
      if (p.done) continue;
      const step = a.steps[p.step]!;
      if (step.on !== ev.kind || !matches(step.where, ev) || !seatsOf(room, step.who, ev).includes(seat))
        continue;
      if (++p.seen < step.count) continue;
      p.step++;
      p.seen = 0;
      p.done = p.step >= a.steps.length;
      const payload: AchvPayload = { id: a.id, step: p.step, steps: a.steps.length, done: p.done };
      client.send(ACHV_MSG, payload);
    }
  }
}

/** The Step stage: subscribes once per room, then the bus delivers into `hear` inside `runEvents`. */
export function runAchievements(room: PartyRoom): void {
  if (memories.has(room)) return;
  const memory: Memory = { progress: new Map() };
  memories.set(room, memory);
  onSim(room, ANY_SIM, (ev) => hear(room, memory, ev));
}
