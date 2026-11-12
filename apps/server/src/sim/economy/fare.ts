import { balance, economy, scenes } from '@wdi/content';
import { type RefusalReason, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { emitSim } from '../events/bus';
import { type Refusal, refusal } from '../refusal';
import { type PlayerSim, simOf } from '../RoomSim';
import { isTurned } from '../vendettas/arrival';
import { isVerbPhase, reject, sceneKey } from '../World';
import { balanceOf, movePurse, TOWN } from './purse';
import { inHardship } from './hardship';
import { nearProp } from './reach';

/**
 * Owing the line (round 10, C2; GDD 3.23, docs/round9/world-mode.md 6, followup-4 2.5). Every return on the morning
 * train (`Train.ts`) adds `respawn.fareDebt` to the seat's fare, owed to the Company. While a fare is owed:
 * - the town's wages and sales into the seat's purse pay `respawn.wageMult` of their amount (`purse.ts`, one line);
 *   the fraction a payment leaves is carried to the next, so two 3-Scrip tasks pay 1 and then 2, and the cut part is
 *   never minted, so no coin is made or lost;
 * - the seat pays the whole fare at a bank counter with `act.payRent`, after any rent (`rent.ts`, two lines).
 * - its look's shop (`economy.json` `owner`) asks `respawn.priceMult` more (C2b): the dear stall;
 * - the Clerk's labour errand (C2b), `act.hold {action: 'errand'}` held `respawn.errandS` at a `ledger` prop, clears
 *   one fare; it is always open, whether or not the Clerk stands there (F4 a10).
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

/**
 * Whether the shop is dear (C2b): its owner look is the public look (`Player.look`, fixed when the card closes) of a
 * seat that owes the line, of the Hitman's turned seat or of a seat under a hardship (round 10, C4c, GDD 3.33). Never the drawn avatar's look, so an impersonation never moves the dear stall, and never
 * the card, so a cover is never named. A shop with no owner is never dear.
 */
export function shopIsDear(room: PartyRoom, shopId: string): boolean {
  const owner = economy.shops[shopId]?.owner;
  if (owner === undefined) return false;
  for (const [seat, player] of room.state.players)
    if (player.look === owner && (owesFare(room, seat) || isTurned(room, seat) || inHardship(room, seat)))
      return true;
  return false;
}

/** What the shop asks for one `itemId` now: its price, or `respawn.priceMult` of it, rounded up, while dear. */
export function askOf(room: PartyRoom, shopId: string, itemId: string): number | undefined {
  const ask = economy.prices[itemId]?.ask;
  if (ask === undefined) return undefined;
  return shopIsDear(room, shopId) ? Math.ceil(ask * balance.respawn.priceMult) : ask;
}

/** The `ledger` props of the seat's scene: the Clerk's books, where the errand is worked. */
const ledgersHere = (p: PlayerSim): string[] =>
  (scenes[sceneKey(p.sceneIdx)]?.props ?? []).filter((q) => q.kind === 'ledger').map((q) => q.id);

function errandProblem(room: PartyRoom, seat: string, p: PlayerSim, targetId: string): Refusal | null {
  if (!isVerbPhase(room.state.phase)) return refusal('PHASE_CLOSED');
  if (p.dead || !p.placed) return refusal('NOT_IN_PLAY');
  if (room.state.tick < p.busyUntilTick) return refusal('BUSY');
  if (!ledgersHere(p).includes(targetId)) return refusal('NOTHING_THERE');
  if (!nearProp(room, seat, [targetId])) return refusal('TOO_FAR');
  if (!owesFare(room, seat)) return refusal('NOTHING_OWED');
  return null;
}

/** `act.hold {action: 'errand', targetId, on: true}` (the one branch in `sim/Hold.ts`). */
export function handleErrandHold(room: PartyRoom, seat: string, targetId: unknown): void {
  const p = simOf(room).players.get(seat);
  if (!p || typeof targetId !== 'string' || targetId.length > 64) return;
  const why = errandProblem(room, seat, p, targetId);
  if (why) return reject(room, seat, why);
  if (p.hold?.action === 'errand' && p.hold.targetId === targetId) return;
  p.hold = { action: 'errand', targetId, startTick: room.state.tick };
}

/** One tick of the errand (from `runHolds`): moving or any problem cancels it; the end of the hold clears a fare. */
export function tickErrandHold(room: PartyRoom, seat: string, p: PlayerSim): void {
  const hold = p.hold;
  if (!hold) return;
  if (errandProblem(room, seat, p, hold.targetId) || p.vx !== 0 || p.vy !== 0) {
    p.hold = null;
    return;
  }
  if (room.state.tick - hold.startTick < Math.round(balance.respawn.errandS * TICK_RATE)) return;
  p.hold = null;
  const cleared = Math.min(fareOf(room, seat), balance.respawn.fareDebt);
  setFare(room, seat, fareOf(room, seat) - cleared);
  emitSim(room, { tick: room.state.tick, kind: 'fare.errand', seat, data: { amount: cleared } });
}
