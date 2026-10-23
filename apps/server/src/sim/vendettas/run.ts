import type { PartyRoom } from '../../rooms/PartyRoom';
import { onSim } from '../events/bus';
import { isOnub } from '../onub/state';
import { onMeetingConversion, runConversion } from './conversion';
import { runSabotage } from './sabotage';
import { privateVendetta, vendettaHolders, vendettaOf } from './state';

/**
 * The vendettas' Step stage (round 7, GDD 3.20), Session 7H: the conditions each holder's vendetta watches, once per
 * tick after the tick's events are delivered (`runVendettas`, after `runEvents` in `sim/Step.ts`), and the bus
 * kinds they react to, subscribed once per room. A vendetta's own events reach the bus for the next tick.
 */

const subscribed = new WeakSet<PartyRoom>();

function subscribe(room: PartyRoom): void {
  if (subscribed.has(room)) return;
  subscribed.add(room);
  onSim(room, 'meeting', (_e, r) => onMeetingConversion(r));
}

export function runVendettas(room: PartyRoom): void {
  subscribe(room);
  if (isOnub(room)) return;
  // The card's goal line (`Private.vendetta`), written here because the deal fills the Cabal mates after the draw.
  for (const [id, player] of room.state.players) {
    const line = player.priv ? privateVendetta(room, id) : '';
    if (player.priv && player.priv.vendetta !== line) player.priv.vendetta = line;
  }
  for (const seat of vendettaHolders(room).keys()) {
    const kind = vendettaOf(room, seat)?.kind;
    if (kind === 'conversion') runConversion(room, seat);
    else if (kind === 'sabotage') runSabotage(room, seat);
  }
}
