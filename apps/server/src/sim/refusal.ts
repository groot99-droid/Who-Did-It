import { S2C, refusalFrame } from '@wdi/shared';
import type { RefusalArgMap, RefusalFrame, RefusalReason } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { clientOf } from './seatIds';

/** The optional parts of a refusal: a log message (the reason id when absent) and the logic-table interaction. */
export type RefusalExtra = { msg?: string; interaction?: string };

/** A refusal a check returns instead of sending: the reason, its args and the extras (`refusal()` builds one). */
export type Refusal = {
  [R in RefusalReason]: { reason: R; args?: RefusalArgMap[R]; extra?: RefusalExtra };
}[RefusalReason];

/** A refusal for a check to return; `sendRefusal(room, id, refusal(...))` sends it. */
export const refusal = <R extends RefusalReason>(
  reason: R,
  args?: RefusalArgMap[R],
  extra?: RefusalExtra,
): Refusal => ({ reason, args, extra }) as Refusal;

/**
 * Sends one refusal to one client (round 10, A2 and A3; docs/round9/failures.md 6.1): either `(reason, args?, extra?)`
 * or a `Refusal` a check returned. Both build the frame of `refusalFrame`.
 */
export function sendRefusal<R extends RefusalReason>(
  room: PartyRoom,
  sessionId: string,
  reason: R,
  args?: RefusalArgMap[R],
  extra?: RefusalExtra,
): void;
export function sendRefusal(room: PartyRoom, sessionId: string, problem: Refusal): void;
export function sendRefusal(
  room: PartyRoom,
  sessionId: string,
  first: RefusalReason | Refusal,
  second?: unknown,
  third?: RefusalExtra,
): void {
  const frame: RefusalFrame =
    typeof first === 'object'
      ? refusalFrame(first.reason, first.args as RefusalArgMap[RefusalReason] | undefined, first.extra)
      : refusalFrame(first, second as RefusalArgMap[RefusalReason] | undefined, third);
  clientOf(room, sessionId)?.send(S2C.error, frame);
}
