import type { Client } from '@colyseus/core';
import type { PartyRoom } from '../rooms/PartyRoom';

// Round 10, W1a (seams.md 3 row 25, scope.md 2.1): the hidden seats. In the lobby a seat's id is its client's session id,
// which every client in the lobby has seen beside a name. In a world match every seat, human and NPC, takes a fresh id at
// Start, so no client can link a figure to a name it saw in the lobby; the map between the two lives here, in room
// memory only. The sim only ever sees seat ids: the room's boundary (`seatOf`, `clientOf`) translates.
//
// This module imports nothing at runtime: half the sim reaches it, so it must not pull `Flow` or the deck into their import
// graph (a cycle there deadlocks a test that mocks `Deck`). The re-keying itself lives in `seatRekey.ts`.

export interface SeatMap {
  bySession: Map<string, string>;
  bySeat: Map<string, string>;
}

const maps = new WeakMap<PartyRoom, SeatMap>();

/** The seat id of a client's session: its fresh id in a world match, else the session id itself. */
export function seatOf(room: PartyRoom, client: Pick<Client, 'sessionId'>): string {
  return maps.get(room)?.bySession.get(client.sessionId) ?? client.sessionId;
}

/** The connected client that plays `seatId`, if any; NPC seats have none. */
export function clientOf(room: PartyRoom, seatId: string): Client | undefined {
  return room.clients.getById(maps.get(room)?.bySeat.get(seatId) ?? seatId);
}

/** Records a world match's seat map at Start (`rekeySeats`). */
export function setSeatMap(room: PartyRoom, map: SeatMap): void {
  maps.set(room, map);
}

/** Removes and returns the room's seat map at the reset to the lobby (`restoreSeats`). */
export function takeSeatMap(room: PartyRoom): SeatMap | undefined {
  const map = maps.get(room);
  maps.delete(room);
  return map;
}
