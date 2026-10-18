import type { PartyRoom } from '../rooms/PartyRoom';

// Avatars and handles (GDD 3.17, round-5 `deck/wire.md` 4.1). Session 5F owns this file; the round-5 pre-seed
// holds the hooks below with stub bodies, called from their locked sites (wire.md 8.1). 5F keeps the handle
// memory (seat <-> handle, the transit tails, the used set, the disguises) in room memory here, never in a schema.

/**
 * After the movement stage every tick (`Step.ts`): copies each placed seat's presence onto its current avatar,
 * with `lookOf`, `height`, the ghost bit and the ghost-only `seat`. Pre-seed stub: no-op (`SceneState.avatars`
 * stays empty).
 */
export function publishAvatars(room: PartyRoom): void {
  void room;
}

/**
 * A new handle for `seat` in its current scene: from `enterScene` (every crossing and placement; `transit` leaves
 * the old avatar at the door until its transit ends) and from `markDead`; it first settles or deletes the seat's
 * disguise. Pre-seed stub: no-op.
 */
export function rehandle(room: PartyRoom, seat: string, transit: boolean): void {
  void room;
  void seat;
  void transit;
}

/**
 * The seat behind a handle a `target: 'player'` act names (Kill, Bandage): a current handle in the actor's scene,
 * or a transit tail there; null for anything else. Pre-seed stub: returns `handle` when it is a seat id, else
 * null, so Kill and Bandage still take seat ids until 5F lands.
 */
export function resolveHandle(room: PartyRoom, actorSeat: string, handle: unknown): string | null {
  void actorSeat;
  return typeof handle === 'string' && room.state.players.has(handle) ? handle : null;
}
