import { balance } from '@wdi/content';
import { TICK_RATE, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { noteRefusal, postNote } from '../../sim/Chat';
import { type MeetingStat, flowOf } from '../../sim/Flow';
import { publicFacts } from './facts';
import { templateNote } from './templates';

/** One NPC seat's notes for one meeting: the ticks it means to write at, earliest first. */
interface NotePlan {
  meeting: MeetingStat;
  ticks: number[];
}

const plans = new WeakMap<PartyRoom, Map<string, NotePlan>>();

/**
 * An NPC seat's meeting notes (GDD 3.8, 3.25), called once a tick for every living NPC seat in the discussion and
 * the vote (the hook in `sim/npc/meeting.ts`). On its first call of a meeting the seat draws how many notes it means
 * to write (`talk.npc.notesPerMeeting`) and when (`talk.npc.windowFrac` of the discussion plus the vote time), from
 * its own `talk` stream and whatever its card; a note the human limits refuse waits for the next tick.
 */
export function runNpcNotes(room: PartyRoom, player: PlayerState): void {
  const meeting = flowOf(room).current;
  if (meeting === null) return;
  const id = player.id;
  let seats = plans.get(room);
  if (!seats) plans.set(room, (seats = new Map()));
  let plan = seats.get(id);
  const tick = room.state.tick;
  if (plan?.meeting !== meeting) {
    plan = { meeting, ticks: drawTicks(room, id, tick) };
    seats.set(id, plan);
  }
  const next = plan.ticks[0];
  if (next === undefined || tick < next || noteRefusal(room, id) !== null) return;
  const text = templateNote(publicFacts(room, id), room.seeds.get('talk', id));
  if (postNote(room, id, text)) plan.ticks.shift();
}

function drawTicks(room: PartyRoom, id: string, tick: number): number[] {
  const rng = room.seeds.get('talk', id);
  const { notesPerMeeting: count, windowFrac: f } = balance.talk.npc;
  const n = count.min + Math.floor(rng() * (count.max - count.min + 1));
  const span = Math.max(0, room.state.phaseEndsTick - tick) + balance.phases.voteS * TICK_RATE;
  const ticks: number[] = [];
  for (let i = 0; i < n; i++) ticks.push(tick + Math.round(span * (f.min + rng() * (f.max - f.min))));
  return ticks.sort((a, b) => a - b);
}
