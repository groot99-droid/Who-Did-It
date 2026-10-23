import type { PartyRoom } from '../../rooms/PartyRoom';
import { onSim } from '../events/bus';
import { isOnub } from '../onub/state';
import { onMeetingConversion, runConversion } from './conversion';
import { onArriveContract, onDeathContract, onKillContract } from './contract';
import { onDeliveryHeist, runHeist } from './heist';
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
  onSim(room, 'train.delivery', (_e, r) => onDeliveryHeist(r));
  onSim(room, 'train.arrive', (_e, r) => onArriveContract(r));
  onSim(room, 'kill', (e, r) => onKillContract(r, e));
  onSim(room, 'death', (e, r) => onDeathContract(r, e));
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
    const v = vendettaOf(room, seat);
    // A vendetta is its Killer card's: a seat no longer holding that card (a fixture's re-deal) runs none of it.
    if (!v || room.state.players.get(seat)?.priv?.role.roleId !== v.role) continue;
    if (v.kind === 'conversion') runConversion(room, seat);
    else if (v.kind === 'sabotage') runSabotage(room, seat);
    else if (v.kind === 'heist') runHeist(room, seat);
  }
}
