import { generateId } from '@colyseus/core';
import type { PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { flowOf } from './Flow';
import { newSeat } from './newSeat';
import { isNpcSeat, registerNpcSeat, releaseNpcSeat } from './Npc';
import { humansOf } from './paintTown';
import { simOf } from './RoomSim';
import { type SeatMap, seatOf, setSeatMap, takeSeatMap } from './seatIds';
import { createPlayerView } from './Visibility';

// Round 10, W1a (seams.md 3 row 25): the re-keying of the seats at Start and back at the reset to the lobby. Only the
// lobby handler and `Win` call it; the lookups the rest of the sim uses stay in `seatIds.ts`, which imports nothing.

/** Whether a deal of `ids` hides its seats: three or more humans, the world match (seams.md 3 row 25). */
export const hidesSeats = (room: PartyRoom, ids: readonly string[]): boolean =>
  humansOf(room, ids).length >= 3;

/** Moves `from`'s seat to the id `to` within one tick: a fresh Player in the same lobby state, and the sim's keys. */
function moveSeat(room: PartyRoom, from: string, to: string): void {
  const old = room.state.players.get(from) as PlayerState;
  const npc = isNpcSeat(room, from);
  room.state.players.delete(from);
  if (npc) releaseNpcSeat(room, from);
  const seat = newSeat(room, to, old.name);
  seat.profile = old.profile;
  seat.connected = old.connected;
  seat.ready = old.ready;
  if (npc) registerNpcSeat(room, to);
  const sim = simOf(room);
  sim.players.delete(from);
  sim.views.delete(from);
  sim.ensure(to);
}

/**
 * Called by `startMatch` after the NPC fill and before the deal: in a world match every seat takes a fresh id and the
 * seats enter `players` in fresh-id order, so neither the ids nor the order says which seats joined as humans. The leader,
 * a pending `debug.deal` and every client's view follow their seats.
 */
export function rekeySeats(room: PartyRoom): void {
  const ids = [...room.state.players.keys()];
  if (!hidesSeats(room, ids)) return;
  const fresh = new Map<string, string>(ids.map((id) => [id, generateId()]));
  const order = [...ids].sort((a, b) => ((fresh.get(a) as string) < (fresh.get(b) as string) ? -1 : 1));
  const map: SeatMap = { bySession: new Map(), bySeat: new Map() };
  for (const id of order) {
    const to = fresh.get(id) as string;
    moveSeat(room, id, to);
    if (!isNpcSeat(room, to)) {
      map.bySession.set(id, to);
      map.bySeat.set(to, id);
    }
  }
  setSeatMap(room, map);
  for (const [, seat] of room.state.players) (seat as PlayerState).priv.seatId = (seat as PlayerState).id;
  room.state.leaderId = fresh.get(room.state.leaderId) ?? '';
  const flow = flowOf(room);
  if (flow.fixedDeal) {
    flow.fixedDeal = Object.fromEntries(
      Object.entries(flow.fixedDeal).map(([id, card]) => [fresh.get(id) ?? id, card]),
    );
  }
  for (const client of room.clients) client.view = createPlayerView(room, seatOf(room, client));
}

/**
 * Called by `resetToLobby` after the seats are cleared: each human seat still held goes back to its session id; the NPC
 * seats keep their ids, which no lobby has shown beside a human's name. The lobby has no `Private.seatId`.
 */
export function restoreSeats(room: PartyRoom): void {
  const map = takeSeatMap(room);
  if (!map) return;
  for (const id of [...room.state.players.keys()]) {
    const back = map.bySeat.get(id);
    if (back !== undefined) moveSeat(room, id, back);
    else (room.state.players.get(id) as PlayerState).priv.seatId = '';
  }
  room.state.leaderId = map.bySeat.get(room.state.leaderId) ?? room.state.leaderId;
  for (const client of room.clients) client.view = createPlayerView(room, client.sessionId);
}
