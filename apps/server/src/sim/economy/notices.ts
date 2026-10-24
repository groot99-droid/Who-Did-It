import { ErrorCode, Phase } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { emitSim } from '../events/bus';
import { simOf } from '../RoomSim';
import { isVerbPhase, reject } from '../World';
import { dropNotice, ledgerOf, noticeLine, systemLine } from './rumours';

/**
 * `act.notice {itemId, op}` (round 8, GDD 3.23), Session 8D: a Blackmail Notice is shown at a meeting (a public
 * line), burnt, or fenced at the black market (with the purse). `itemId` is the notice's Notebook entry id. A seat
 * never burns a notice that names its own look: only an Indulgence cleanses its own name.
 */

const isMeeting = (phase: number) => phase === Phase.meetingDiscussion || phase === Phase.meetingVote;

/** The lines of UI.md 14.35 that the server writes. */
export const NOTICE_COPY = {
  shown: (name: string, line: string) => `${name} lays a notice on the table: ${line}`,
  ownName: 'Only an Indulgence clears your own name.',
} as const;

export function handleNotice(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const { itemId, op } = payload;
  if (typeof itemId !== 'string' || itemId.length > 64) return;
  const player = room.state.players.get(seat);
  const p = simOf(room).players.get(seat);
  const notice = ledgerOf(room).notices.get(itemId);
  if (!player || !p || p.dead) return reject(room, seat, ErrorCode.cannot, 'not now');
  if (!notice || notice.holder !== seat) return reject(room, seat, ErrorCode.cannot, 'no such notice');
  const phase = room.state.phase;
  if (op === 'show') {
    if (!isMeeting(phase)) return reject(room, seat, ErrorCode.wrongPhase, 'only at a meeting');
    dropNotice(room, itemId);
    systemLine(room, NOTICE_COPY.shown(player.name, noticeLine(notice)));
    emitSim(room, { tick: room.state.tick, kind: 'notice.shown', seat, data: { noticeId: itemId } });
    return;
  }
  if (op === 'burn') {
    if (!isVerbPhase(phase) && !isMeeting(phase)) return reject(room, seat, ErrorCode.wrongPhase, 'not now');
    if (notice.look === player.look) return reject(room, seat, ErrorCode.cannot, NOTICE_COPY.ownName);
    dropNotice(room, itemId);
    emitSim(room, { tick: room.state.tick, kind: 'notice.burnt', seat, data: { noticeId: itemId } });
    return;
  }
  // `fence` waits for the purse (8C's `movePurse`).
  reject(room, seat, ErrorCode.cannot, 'cannot do that');
}
