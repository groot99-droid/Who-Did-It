import { balance, economy, roles } from '@wdi/content';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { isTurned } from '../vendettas/arrival';
import { owesFare } from './fare';

/**
 * What breaks when I'm gone (round 10, C3; GDD 3.23, docs/round9/round10-plan.md 5). Each card's `roles.json`
 * `townWork` names the town work its look does. The work follows the seat's public look (`Player.look`), never its
 * card or the drawn avatar, so a death never reveals a cover and an impersonation never moves it (seams.md row 15):
 * - a look is **gone** when a seat wore it at the deal and no wearer is shown alive on the roster (`Player.alive`,
 *   which a death flips only at the next meeting, A30), so a stall or an altar never reveals a kill before the
 *   meeting. A look no seat wears keeps its work running, so an undealt card's stall stays full;
 * - a look is **thin** while a seat wearing it owes the line (`fare.ts`), or is the Hitman's turned seat (round 10,
 *   C4a: its role goes dormant, GDD 3.33);
 * - else it is **at work**.
 * A `stall` look's shop (`economy.json` `owner`) sells each item from a day's stock: `townWork.stallStock` at work,
 * `respawn.stockMult` of it while thin (`hitman.dormantOutput` for the Hitman's turned seat), none while gone, less
 * what was sold since the day began. A `faith` look's `props` earn no Faith while it is gone (`faith.ts`, one line).
 * The `none` rows are not built yet (their `nfy`).
 */

export type WorkState = 'work' | 'thin' | 'gone';

/** How `look`'s town work runs now. */
export function workOf(room: PartyRoom, look: string): WorkState {
  let worn = false;
  let living = false;
  let owes = false;
  for (const [seat, player] of room.state.players) {
    if (player.look !== look) continue;
    worn = true;
    owes ||= owesFare(room, seat) || isTurned(room, seat);
    if (player.alive) living = true;
  }
  if (!worn) return 'work';
  if (!living) return 'gone';
  return owes ? 'thin' : 'work';
}

/** The props of `faith` looks that are gone now: they earn no Faith. */
export function propsAtRest(room: PartyRoom): Set<string> {
  const rest = new Set<string>();
  for (const role of Object.values(roles.roles)) {
    if (role.townWork.work !== 'faith' || role.look === null) continue;
    if (workOf(room, role.look) === 'gone') for (const prop of role.townWork.props ?? []) rest.add(prop);
  }
  return rest;
}

/**
 * The stock multiplier of a thin look: `respawn.stockMult` while a wearer owes the line, `hitman.dormantOutput` while
 * it is the Hitman's turned seat (C4a). The two are equal (F4 b1), so a dormant stall shows exactly an owing one.
 */
function thinMult(room: PartyRoom, look: string): number {
  let mult = 1;
  for (const [seat, player] of room.state.players) {
    if (player.look !== look) continue;
    if (owesFare(room, seat)) mult = Math.min(mult, balance.respawn.stockMult);
    if (isTurned(room, seat)) mult = Math.min(mult, balance.hitman.dormantOutput);
  }
  return mult;
}

/** A stall's day's stock of each item at work: one per seat, at least `stallStockMin`. */
export const stallStock = (room: PartyRoom): number =>
  Math.max(
    balance.townWork.stallStockMin,
    Math.round(balance.townWork.stallStockPerSeat * room.state.players.size),
  );

/** What each stall sold since the day began, keyed `shopId/itemId`. Room memory keyed by the match's `MatchSeeds`. */
const sales = new WeakMap<object, { round: number; sold: Map<string, number> }>();

function soldToday(room: PartyRoom): Map<string, number> {
  let s = sales.get(room.seeds);
  if (!s || s.round !== room.state.round)
    sales.set(room.seeds, (s = { round: room.state.round, sold: new Map() }));
  return s.sold;
}

/** How many of `itemId` the shop has left today, or undefined for a shop with no `owner` (it never runs out). */
export function stockLeft(room: PartyRoom, shopId: string, itemId: string): number | undefined {
  const owner = economy.shops[shopId]?.owner;
  if (owner === undefined) return undefined;
  const work = workOf(room, owner);
  const full = stallStock(room);
  const cap = work === 'gone' ? 0 : work === 'thin' ? Math.floor(full * thinMult(room, owner)) : full;
  return Math.max(0, cap - (soldToday(room).get(`${shopId}/${itemId}`) ?? 0));
}

/** A sale from the shop's stock: `qty` fewer left today. A shop with no `owner` keeps no count. */
export function takeStock(room: PartyRoom, shopId: string, itemId: string, qty: number): void {
  if (economy.shops[shopId]?.owner === undefined) return;
  const sold = soldToday(room);
  const key = `${shopId}/${itemId}`;
  sold.set(key, (sold.get(key) ?? 0) + qty);
}
