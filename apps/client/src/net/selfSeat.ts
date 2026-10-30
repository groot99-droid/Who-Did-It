import type { Room } from '@colyseus/sdk';

interface SeatsLike {
  players?: { forEach(cb: (p: { priv?: { seatId?: string } }) => void): void };
}

/**
 * Round 10, W1a (seams.md 3 row 25): this client's seat id. In a world match the seats take fresh ids at Start and the
 * own seat's id arrives only in its `Private.seatId`, the one `priv` this client's view holds; in the lobby, and before
 * the first patch, the seat id is the session id.
 */
export function selfSeatId(room: Room): string {
  let id = '';
  (room.state as SeatsLike | undefined)?.players?.forEach((p) => {
    if (id === '' && p.priv?.seatId) id = p.priv.seatId;
  });
  return id || room.sessionId;
}
