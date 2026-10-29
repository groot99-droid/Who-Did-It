import { refusalFrame, S2C, type RefusalReason } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { move, select } from './Inventory';

// Round 10, A12 (GDD 3.30): the inventory screen's two commands, consumed inside `step()` like every other.

const refuse = (room: PartyRoom, seat: string, reason: RefusalReason): void => {
  room.clients.getById(seat)?.send(S2C.error, refusalFrame(reason));
};

const slotArg = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) ? v : -1);

/** `inv.move {from, to}`: any seat with a private view, in any phase; the inventory is its own. */
export function handleInvMove(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const player = room.state.players.get(seat);
  if (!player?.priv) return;
  const why = move(player, slotArg(payload.from), slotArg(payload.to));
  if (why) refuse(room, seat, why);
}

/** `inv.select {slot}`: the held hotbar slot. */
export function handleInvSelect(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const player = room.state.players.get(seat);
  if (!player?.priv) return;
  const why = select(player, slotArg(payload.slot));
  if (why) refuse(room, seat, why);
}
