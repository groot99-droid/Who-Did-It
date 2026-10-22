import { ErrorCode } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { reject } from './World';

/**
 * Resource nodes and gathering (round 6, M5b, GDD 3.14; docs/round6/m5b-data.md 2.1): the node pool per match from
 * `seeds.get('nodes')`, the respawn timers and the `gather` hold. Pre-seeded by 6Z; Session 6F fills it.
 */

/** Step stage in place of `runAiAndHazards`, after `runDecay` (locked call site in `sim/Step.ts`). No-op until 6F. */
export function runResources(_room: PartyRoom): void {
  // 6F: tick the respawns, re-validate the gather holds, complete the ones whose cast has run
}

/** `act.hold {action: 'gather', targetId}` (locked call site in `sim/Hold.ts`). Refuses until 6F. */
export function handleGather(room: PartyRoom, sessionId: string, _targetId: string): void {
  reject(room, sessionId, ErrorCode.cannot, 'cannot do that'); // 6F
}
