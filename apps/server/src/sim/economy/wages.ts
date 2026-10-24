import { balance, quests } from '@wdi/content';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { type SimEvent, onSim } from '../events/bus';
import { TOWN, movePurse } from './purse';

/**
 * Wages (round 8, GDD 3.23; docs/round8/economy.md 2), Session 8C: the town pays a finished task and a quest turn-in.
 * A task pays on 7M's `taskDone` (A133), heard on the bus. A fake task pays exactly as a real one, so a purse never
 * tells a Cabal seat from a worker (GDD 3.5). A quest pays its `scrip` once its state reads done, read from the
 * seat's own quest list, so `sim/Quests.ts` (locked) needs no line.
 */

const subscribed = new WeakSet<PartyRoom>();

/** The quests already paid this match, `<seat>:<questId>`, keyed by the match's `MatchSeeds`. */
const paid = new WeakMap<object, Set<string>>();

function paidOf(room: PartyRoom): Set<string> {
  let s = paid.get(room.seeds);
  if (!s) paid.set(room.seeds, (s = new Set()));
  return s;
}

/** The bus's `taskDone`: one wage to the seat, real or fake alike. */
export function onTaskDone(room: PartyRoom, event: SimEvent): void {
  if (event.seat) movePurse(room, TOWN, event.seat, balance.economy.taskWage, 'wage');
}

/** `runEconomy`: subscribes once per room, then pays each quest turned in since the last tick. */
export function runWages(room: PartyRoom): void {
  if (!subscribed.has(room)) {
    subscribed.add(room);
    onSim(room, 'taskDone', (e, r) => onTaskDone(r, e));
  }
  const done = paidOf(room);
  for (const [seat, player] of room.state.players) {
    for (const q of player.priv?.quests ?? []) {
      if (!q.done || done.has(`${seat}:${q.id}`)) continue;
      done.add(`${seat}:${q.id}`);
      const scrip = quests.quests[q.id]?.scrip ?? 0;
      if (scrip > 0) movePurse(room, TOWN, seat, scrip, 'wage');
    }
  }
}
