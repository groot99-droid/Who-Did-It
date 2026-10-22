import type { Client } from '@colyseus/core';
import type { StateView } from '@colyseus/schema';
import type { PartyRoom } from '../../rooms/PartyRoom';

/**
 * The god view of the `admin` room (round 6, docs/round6/auto-admin.md 8): every scene, every seat with its
 * `presence` and `priv`, every avatar with its true seat. Pre-seeded by 6Z; Session 6C fills it. `isAdminClient`
 * is the one line `reconcileViews` (sim/Visibility.ts) asks before its own work; it is false in every `party` room.
 */
export function isAdminClient(_room: PartyRoom, _sessionId: string): boolean {
  return false; // 6C: true for the AdminRoom's client
}

export function createAdminView(_room: PartyRoom): StateView {
  throw new Error('sim/auto/AdminView.ts createAdminView: round 6, Session 6C');
}

export function reconcileAdminView(_room: PartyRoom, _client: Client): void {
  throw new Error('sim/auto/AdminView.ts reconcileAdminView: round 6, Session 6C');
}
