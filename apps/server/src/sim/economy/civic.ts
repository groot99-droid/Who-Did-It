import type { PartyRoom } from '../../rooms/PartyRoom';
import { onSim } from '../events/bus';
import { sealShield } from './faith';
import { runRent } from './rent';
import { syncHq } from './hq';
import { gazette, onDeliveryRumours, runRumours } from './rumours';

/**
 * Session 8D's loops inside `runEconomy` (round 8, GDD 3.23; docs/round8/seams.md 5): 8C's Step stage calls
 * `runCivic` once per tick, and the meeting start calls `civicMeetingStart`. The bus kinds they hear are
 * subscribed once per room.
 */

const subscribed = new WeakSet<PartyRoom>();

function subscribe(room: PartyRoom): void {
  if (subscribed.has(room)) return;
  subscribed.add(room);
  onSim(room, 'train.delivery', (_e, r) => onDeliveryRumours(r));
}

export function runCivic(room: PartyRoom): void {
  subscribe(room);
  runRumours(room);
  runRent(room);
  syncHq(room);
}

/** Meeting start (locked hooks of seams.md 5: `sealShield(room)` and `gazette(room)`). */
export function civicMeetingStart(room: PartyRoom): void {
  sealShield(room);
  gazette(room);
}
