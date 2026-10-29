import { economy } from '@wdi/content';
import { Phase } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { emitSim } from '../events/bus';
import { simOf } from '../RoomSim';
import { isVerbPhase, reject } from '../World';
import { spendIndulgence } from './faith';
import { perkMul } from './perks';
import { TOWN, movePurse } from './purse';
import { nearProp } from './reach';
import { dropNotice, ledgerOf, noticeLine, systemLine } from './rumours';

/**
 * `act.notice {itemId, op}` (round 8, GDD 3.23), Session 8D: a Blackmail Notice is shown at a meeting (a public
 * line), burnt, or fenced at the black market for Scrip. `itemId` is the notice's Notebook entry id. A seat
 * burns a notice that names its own look only by spending an Indulgence.
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
  if (!player || !p || p.dead) return reject(room, seat, 'NOT_IN_PLAY');
  if (!notice || notice.holder !== seat) return reject(room, seat, 'NOTHING_THERE');
  const phase = room.state.phase;
  if (op === 'show') {
    if (!isMeeting(phase)) return reject(room, seat, 'PHASE_CLOSED', { until: 'meeting' });
    dropNotice(room, itemId);
    systemLine(room, NOTICE_COPY.shown(player.name, noticeLine(notice)));
    emitSim(room, { tick: room.state.tick, kind: 'notice.shown', seat, data: { noticeId: itemId } });
    return;
  }
  if (op === 'burn') {
    if (!isVerbPhase(phase) && !isMeeting(phase)) return reject(room, seat, 'PHASE_CLOSED');
    if (notice.look === player.look && !spendIndulgence(room, seat)) return reject(room, seat, 'OWN_NAME');
    dropNotice(room, itemId);
    emitSim(room, { tick: room.state.tick, kind: 'notice.burnt', seat, data: { noticeId: itemId } });
    return;
  }
  if (op !== 'fence') return;
  if (!isVerbPhase(phase)) return reject(room, seat, 'PHASE_CLOSED');
  if (!nearProp(room, seat, economy.notices.blackMarkets))
    return reject(room, seat, 'NO_COUNTER', { kind: 'buyer' });
  dropNotice(room, itemId);
  const price = Math.round(economy.notices.fencePrice * perkMul(room, seat, 'fenceGain'));
  movePurse(room, TOWN, seat, price, 'fence');
  emitSim(room, { tick: room.state.tick, kind: 'notice.fenced', seat, data: { noticeId: itemId } });
}
