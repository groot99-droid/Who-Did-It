import { balance } from '@wdi/content';
import type { RefusalReason } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { emitSim } from '../events/bus';
import { balanceOf, movePurse, TOWN } from './purse';

/**
 * Owing the line (round 10, C2; GDD 3.23, docs/round9/world-mode.md 6, followup-4 2.5). Every return on the morning
 * train (`Train.ts`) adds `respawn.fareDebt` to the seat's fare, owed to the Company. While a fare is owed:
 * - the town's wages and sales into the seat's purse pay `respawn.wageMult` of their amount, rounded down, and the
 *   rest stays with the town (`purse.ts`, one line), so no coin is made or lost;
 * - the seat pays the whole fare at a bank counter with `act.payRent`, after any rent (`rent.ts`, two lines).
 * Owing the line is not the rent's Indebted status and brings no curfew of its own (R7). The fare is private
 * (`Private.fare`, seams.md 3 row 11); nothing public carries it. Room memory keyed by the match's `MatchSeeds`.
 */

const fares = new WeakMap<object, Map<string, number>>();

function faresOf(room: PartyRoom): Map<string, number> {
  let f = fares.get(room.seeds);
  if (!f) fares.set(room.seeds, (f = new Map()));
  return f;
}

/** The Scrip `seat` owes the line now. */
export const fareOf = (room: PartyRoom, seat: string): number => fares.get(room.seeds)?.get(seat) ?? 0;

/** Whether `seat` owes the line: its pay is cut until it settles. */
export const owesFare = (room: PartyRoom, seat: string): boolean => fareOf(room, seat) > 0;

function setFare(room: PartyRoom, seat: string, fare: number): void {
  if (fare > 0) faresOf(room).set(seat, fare);
  else faresOf(room).delete(seat);
  const priv = room.state.players.get(seat)?.priv;
  if (priv) priv.fare = Math.min(0xffff, fare);
}

/** A return on the morning train: one more fare owed. */
export function addFare(room: PartyRoom, seat: string): void {
  const fare = fareOf(room, seat) + balance.respawn.fareDebt;
  setFare(room, seat, fare);
  emitSim(room, { tick: room.state.tick, kind: 'fare.owed', seat, data: { fare } });
}

/** What a town wage or sale of `amount` pays an owing seat: `respawn.wageMult` of it, rounded down. */
export const cutPay = (room: PartyRoom, seat: string, amount: number): number =>
  owesFare(room, seat) ? Math.floor(amount * balance.respawn.wageMult) : amount;

/**
 * At a bank counter, after the rent (`handlePayRent` checks the counter and the phase): the whole fare moves to the
 * town, or nothing does. Returns null when it was paid, else why not.
 */
export function payFare(room: PartyRoom, seat: string): RefusalReason | null {
  const fare = fareOf(room, seat);
  if (fare === 0) return 'NOTHING_OWED';
  if (balanceOf(room, seat) < fare) return 'NEED_SCRIP';
  if (movePurse(room, seat, TOWN, fare, 'rent') !== fare) return 'NEED_SCRIP';
  setFare(room, seat, 0);
  emitSim(room, { tick: room.state.tick, kind: 'fare.paid', seat, data: { amount: fare } });
  return null;
}
