import { economy, routines, type RoutineHold } from '@wdi/content';
import type { PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { handleHold } from '../Hold';
import { count } from '../Inventory';
import { simOf } from '../RoomSim';
import { owesFare } from '../economy/fare';
import { handleSell } from '../economy/shops';
import { interactReady } from '../interact/resolve';
import { sceneIndex } from '../World';
import type { Station } from './routine';

// The chores of an NPC seat (round 10, D1; GDD 3.12 "Chores", LW 1.8): the stations it can work for real, what it
// sells at a counter, and the rule that nothing waits on it. Every action goes through the verb a human uses.

/** The hold of a station: its class's row first, then its kind's (`routines.json` `holds`). */
export const holdOf = (st: Station): RoutineHold | undefined =>
  (st.cls !== undefined ? routines.holds[st.cls] : undefined) ?? routines.holds[st.kind];

const shopAt = (propId: string): string | undefined =>
  Object.keys(economy.shops).find((id) => economy.shops[id]!.prop === propId);

/** The items the seat holds that the counter's shop buys: an NPC sells only what it gathered, crafted or bought. */
export function sellables(player: PlayerState, propId: string): string[] {
  const shopId = shopAt(propId);
  return shopId === undefined ? [] : economy.shops[shopId]!.buys.filter((item) => count(player, item) > 0);
}

/** Whether another seat, human or NPC, runs a hold on the prop: the seat leaves it to them. */
export function otherAt(room: PartyRoom, selfId: string, propId: string): boolean {
  for (const [id, o] of simOf(room).players) if (id !== selfId && o.hold?.targetId === propId) return true;
  return false;
}

/**
 * Whether the station is worth the trip now: a logic-table prop the seat's own tools work and that is not spent, a
 * counter whose shop buys something it holds, and never a prop another seat is working. A station with no hold is a
 * stop.
 */
export function workable(room: PartyRoom, player: PlayerState, st: Station): boolean {
  if (otherAt(room, player.id, st.propId)) return false;
  const hold = holdOf(st);
  if (hold === 'interact') return interactReady(room, player, st.scene, st.propId);
  if (hold === 'shop') return sellables(player, st.propId).length > 0;
  if (hold === 'errand') return owesFare(room, player.id); // round 10, C2b: the Clerk's books, only while owing
  return true;
}

/** At a counter: opens the shop with the human verb, then sells all it holds that the shop buys. */
export function sellAt(room: PartyRoom, id: string, player: PlayerState, st: Station): void {
  const shopId = shopAt(st.propId);
  if (shopId === undefined || simOf(room).players.get(id)?.sceneIdx !== sceneIndex(st.scene)) return;
  handleHold(room, id, { action: 'shop', targetId: st.propId, on: true });
  for (const itemId of sellables(player, st.propId))
    handleSell(room, id, { shopId, itemId, qty: count(player, itemId) });
}
