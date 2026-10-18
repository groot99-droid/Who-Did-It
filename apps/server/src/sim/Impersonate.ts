import { ErrorCode } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { reject } from './World';

// Impersonate (GDD 3.17, round-5 `deck/wire.md` 4.5). Session 5F owns this file; the round-5 pre-seed holds the
// hooks below with stub bodies, called from their locked sites (wire.md 8.1). The numbers are `balance.json`
// `impersonate` (applyWindowS, durationS, cooldownS).

/**
 * A stage right after `runCommands` (`Step.ts`): cancels pending disguises that time out, asks applied ones to
 * drop, and applies or drops them only on a tick when the seat is alone in its scene. Pre-seed stub: no-op.
 */
export function runImpersonation(room: PartyRoom): void {
  void room;
}

/**
 * Ends `seat`'s disguise; true when it was applied (the caller in `handleKill` then sends the `vfx` puff). Called
 * from `handleKill` for every strike `validateKill` accepts, from `runImpersonation` and from inside
 * `enterScene`. Pre-seed stub: there are no disguises, returns false.
 */
export function endImpersonation(room: PartyRoom, seat: string): boolean {
  void room;
  void seat;
  return false;
}

/** From `openMeeting`, before the placements: every disguise ends, with no `vfx`. Pre-seed stub: no-op. */
export function onMeetingOpenDisguise(room: PartyRoom): void {
  void room;
}

/**
 * `act.ability {abilityId: 'impersonate', targetId: <seat id>}` (`handleAbility`, `Actions.ts`). Pre-seed stub:
 * refused 422 "cannot do that", as every unknown ability is today.
 */
export function handleImpersonate(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  void payload;
  reject(room, seat, ErrorCode.cannot, 'cannot do that');
}
