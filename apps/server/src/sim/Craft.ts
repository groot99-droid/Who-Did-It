import { ErrorCode } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { reject } from './World';

/**
 * Crafting (round 6, M5b, GDD 3.14; docs/round6/m5b-data.md 2.1): the `craft` hold at a station prop of the recipe's
 * kind within `doors.reachTiles`; the inputs are taken from the inventory (`sim/Inventory.ts`, 6F) when the hold's
 * cast has run. Pre-seeded by 6Z; Session 6F fills it.
 */

/** `act.hold {action: 'craft', targetId: recipeId}` (locked call site in `sim/Hold.ts`). Refuses until 6F. */
export function handleCraft(room: PartyRoom, sessionId: string, _recipeId: string): void {
  reject(room, sessionId, ErrorCode.cannot, 'cannot do that'); // 6F
}
