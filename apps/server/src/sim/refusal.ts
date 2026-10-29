import { type ErrorCode, S2C, refusalFrame } from '@wdi/shared';
import type { RefusalArgMap, RefusalFrame, RefusalReason } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';

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
 * Sends one refusal to one client (round 10, A2; docs/round9/failures.md 6.1). Two forms while the `sim/` sites
 * move over (A3): `(reason, args?, extra?)` builds the frame of `refusalFrame`; the legacy `(code, msg)` sends no
 * reason and goes when A3 has moved the last site.
 */
export function sendRefusal<R extends RefusalReason>(
  room: PartyRoom,
  sessionId: string,
  reason: R,
  args?: RefusalArgMap[R],
  extra?: RefusalExtra,
): void;
export function sendRefusal(room: PartyRoom, sessionId: string, problem: Refusal): void;
export function sendRefusal(room: PartyRoom, sessionId: string, code: ErrorCode, msg: string): void;
export function sendRefusal(
  room: PartyRoom,
  sessionId: string,
  first: RefusalReason | ErrorCode | Refusal,
  second?: unknown,
  third?: RefusalExtra,
): void {
  const frame: RefusalFrame | { code: ErrorCode; msg: string } =
    typeof first === 'number'
      ? { code: first, msg: second as string }
      : typeof first === 'object'
        ? refusalFrame(first.reason, first.args as RefusalArgMap[RefusalReason] | undefined, first.extra)
        : refusalFrame(first, second as RefusalArgMap[RefusalReason] | undefined, third);
  room.clients.getById(sessionId)?.send(S2C.error, frame);
}
