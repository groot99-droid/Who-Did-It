import { economy } from '@wdi/content';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { emitSim } from '../events/bus';
import { canExchange, exchange } from '../Inventory';
import { mapIdOfRoom } from '../MapSites';
import { isVerbPhase, reject } from '../World';
import { tiersOf } from './perks';
import { balanceOf, movePurse, TOWN } from './purse';
import { nearProp } from './reach';

/**
 * HQ tiers (round 8, GDD 3.23, docs/round8/economy.md 3), Session 8D. `act.hq {stationId}` at the station's `hq_` prop
 * of the room's map buys its next tier for the tier's Scrip and materials. The right follows the public look (A131): a
 * seat walking in the station's look may invest, whether it was dealt that card or wears it as a cover. A tier is public
 * (`GameState.hq`), and nothing public names the buyer.
 */

/**
 * The perks of a bought tier switch on through `perks.ts`, so buying waited for the owner's sign-off of the tiers and
 * perks (A139 (9)). The owner approved them as proposed on 2026-10-24; tests may still shut the gate.
 */
export const hqGate = { open: true };

/** `act.hq {stationId}`: the next tier, paid whole (Scrip and materials) or not at all. */
export function handleHq(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const { stationId } = payload;
  const player = room.state.players.get(seat);
  if (!player?.priv || typeof stationId !== 'string') return;
  if (!hqGate.open) return reject(room, seat, 'NFY', { feature: 'the headquarters' });
  if (!isVerbPhase(room.state.phase)) return reject(room, seat, 'PHASE_CLOSED');
  const station = Object.hasOwn(economy.hq.stations, stationId) ? economy.hq.stations[stationId] : undefined;
  const prop = station?.props[mapIdOfRoom(room)];
  if (!station || !prop || !nearProp(room, seat, [prop]))
    return reject(room, seat, 'NO_COUNTER', { kind: 'station' });
  if (player.look !== station.look) return reject(room, seat, 'NOT_YOURS', { what: 'build' });
  const bought = tiersOf(room).get(stationId) ?? 0;
  const tier = station.tiers[bought];
  if (!tier) return reject(room, seat, 'ALREADY_DONE', { what: 'built' });
  if (balanceOf(room, seat) < tier.scrip) return reject(room, seat, 'NEED_SCRIP');
  if (!canExchange(player, tier.materials, [])) return reject(room, seat, 'NEED_MATERIALS');
  if (movePurse(room, seat, TOWN, tier.scrip, 'hq') !== tier.scrip) return;
  exchange(player, tier.materials, []);
  tiersOf(room).set(stationId, bought + 1);
  syncHq(room);
  emitSim(room, {
    tick: room.state.tick,
    kind: 'hq.tier',
    seat,
    data: { stationId, tier: bought + 1, by: seat },
  });
}

/**
 * `GameState.hq` mirrors `tiersOf` (once per tick in `runCivic`, and at a purchase): a new match's tier memory is empty,
 * so the public map clears with it.
 */
export function syncHq(room: PartyRoom): void {
  const tiers = tiersOf(room);
  const hq = room.state.hq;
  for (const id of [...hq.keys()]) if (!tiers.get(id)) hq.delete(id);
  for (const [id, tier] of tiers) if (tier > 0 && hq.get(id) !== tier) hq.set(id, tier);
}
