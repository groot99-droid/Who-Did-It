import type { SimEventWire } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';

/**
 * The auto match log (round 6, docs/round6/auto-admin.md 4): every sim event of a match, by seat id and tick, never
 * by avatar handle, and a hash of it so two runs with the same seeds can be compared. Pre-seeded by 6Z; Session 6B
 * fills it.
 */
export function appendLog(_room: PartyRoom, _event: SimEventWire): void {
  throw new Error('sim/auto/log.ts appendLog: round 6, Session 6B');
}

export function logHash(_room: PartyRoom): string {
  throw new Error('sim/auto/log.ts logHash: round 6, Session 6B');
}
