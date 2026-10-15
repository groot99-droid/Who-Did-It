import type { PartyRoom } from '../rooms/PartyRoom';
import { simOf } from './RoomSim';

/** Validates the shape of an `act.enterPortal` payload and hands it to `runPortals`' queue. */
export function queuePortal(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const id = payload.portalId;
  if (typeof id !== 'string' || id.length === 0 || id.length > 40) return;
  simOf(room).portalRequests.push({ sessionId, portalId: id });
}
