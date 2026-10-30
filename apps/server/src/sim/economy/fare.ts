import { balance } from '@wdi/content';
import type { RefusalReason } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { emitSim } from '../events/bus';
import { balanceOf, movePurse, TOWN } from './purse';

/**
 * Owing the line (round 10, C2; GDD 3.23, docs/round9/world-mode.md 6, followup-4 2.5). Every return on the morning
 * train (`Train.ts`) adds `respawn.fareDebt` to the seat's fare, owed to the Company. While a fare is owed:
 * - the town's wages and sales into the seat's purse pay `respawn.wageMult` of their amount (`purse.ts`, one line);
 *   the fraction a payment leaves is carried to the next, so two 3-Scrip tasks pay 1 and then 2, and the cut part is
 *   never minted, so no coin is made or lost;
 * - the seat pays the whole fare at a bank counter with `act.payRent`, after any rent (`rent.ts`, two lines).
 * Owing the line is not the rent's Indebted status and brings no curfew of its own (R7). The fare is private
 * (`Private.fare`, seams.md 3 row 11); nothing public carries it. Room memory keyed by the match's `MatchSeeds`.
 */

const fares = new WeakMap<object, Map<string, number>>();
/** The fraction of a Scrip each owing seat's cut pay has left over, carried to its next wage or sale. */
const carries = new WeakMap<object, Map<string, number>>();

function faresOf(room: PartyRoom): Map<string, number> {
  let f = fares.get(room.seeds);
  if (!f) fares.set(room.seeds, (f = new Map()));
  return f;
}

function carriesOf(room: PartyRoom): Map<string, number> {
  let c = carries.get(room.seeds);
  if (!c) carries.set(room.seeds, (c = new Map()));
  return c;
}

/** The Scrip `seat` owes the line now. */
export const fareOf = (room: PartyRoom, seat: string): number => fares.get(room.seeds)?.get(seat) ?? 0;

/** Whether `seat` owes the line: its pay is cut until it settles. */
export const owesFare = (room: PartyRoom, seat: string): boolean => fareOf(room, seat) > 0;

function setFare(room: PartyRoom, seat: string, fare: number): void {
  if (fare > 0) faresOf(room).set(seat, fare);
  else {
    faresOf(room).delete(seat);
    carriesOf(room).delete(seat);
  }
  const priv = room.state.players.get(seat)?.priv;
  if (priv) priv.fare = Math.min(0xffff, fare);
}

/** A return on the morning train: one more fare owed. */
export function addFare(room: PartyRoom, seat: string): void {
  const fare = fareOf(room, seat) + balance.respawn.fareDebt;
  setFare(room, seat, fare);
  emitSim(room, { tick: room.state.tick, kind: 'fare.owed', seat, data: { fare } });
}

/**
 * What a town wage or sale of `amount` pays `seat`: the whole of it unless the seat owes the line, else
 * `respawn.wageMult` of it plus the fraction carried from its last cut payment, rounded down, with the new fraction kept.
 */
export function cutPay(room: PartyRoom, seat: string, amount: number): number {
  if (!owesFare(room, seat)) return amount;
  const due = amount * balance.respawn.wageMult + (carriesOf(room).get(seat) ?? 0);
  const paid = Math.floor(due + 1e-9);
  carriesOf(room).set(seat, Math.max(0, due - paid));
  return paid;
}

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
