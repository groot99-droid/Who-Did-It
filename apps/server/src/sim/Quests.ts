import { ErrorCode } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { reject } from './World';

/**
 * Quests (round 6, M5b, GDD 3.16; docs/round6/m5b-data.md 2.3): givers are scene statics; `quest.accept` and
 * `quest.turnIn` go through the command queue; the own `Private.quests` holds the state; rewards go through
 * `sim/Inventory.ts`. A `contract` quest (round 7) refuses. Pre-seeded by 6Z; Session 6H fills it.
 */

/** Step stage after `runMobs` (locked call site in `sim/Step.ts`). No-op until 6H. */
export function runQuests(_room: PartyRoom): void {
  // 6H: progress fetch quests from the inventory
}

/** `quest.accept {questId}` (locked call site in `sim/Commands.ts`). Refuses until 6H. */
export function handleQuestAccept(
  room: PartyRoom,
  sessionId: string,
  _payload: Record<string, unknown>,
): void {
  reject(room, sessionId, ErrorCode.cannot, 'cannot do that'); // 6H
}

/** `quest.turnIn {questId}` (locked call site in `sim/Commands.ts`). Refuses until 6H. */
export function handleQuestTurnIn(
  room: PartyRoom,
  sessionId: string,
  _payload: Record<string, unknown>,
): void {
  reject(room, sessionId, ErrorCode.cannot, 'cannot do that'); // 6H
}
