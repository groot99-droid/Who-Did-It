import { ErrorCode, type OnubWakeView } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { refuse } from '../Flow';

// The night acts (GDD 3.11 "The Baking Cycle", ARCHITECTURE 5.14): validation, the card table, the act log and
// the wake view. Session 5B owns this file; the pre-seed holds the signatures of contract 4.3 with stub bodies.

/**
 * `act.ability` with a night act id, from `handleOnubAbility`: 425 outside `Phase.night`, outside an open window
 * or for a seat not dealt the window's role; 422 for an act not of this window, `onlyIfAlone` and not alone,
 * `actTargetsProblem` or a second act.
 */
export function handleOnubAct(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  void payload;
  refuse(room, sessionId, ErrorCode.wrongPhase, 'not now'); // stub until 5B lands
}

/** The view the seat would be sent now (`nightWake.view`); null while it is not awake. */
export function onubWakeView(room: PartyRoom, seatId: string): OnubWakeView | null {
  void room;
  void seatId;
  return null; // stub until 5B lands
}
