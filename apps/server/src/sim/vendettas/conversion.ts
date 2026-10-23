import { balance } from '@wdi/content';
import { TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { flowOf } from '../Flow';
import { simOf } from '../RoomSim';
import { isWorldPhase } from '../World';
import { activeBody, emitStep, progressOf } from './progress';
import { vendettaHolders, vendettaOf } from './state';

/**
 * Conversion, the Zealot against the Vicar (GDD 3.20): world-phase time shared with the seat dealt the Vicar sows
 * the doubt; the next meeting's tally does not count the Vicar's vote. Session 7H.
 */

const VICAR = 'vicar';

/** The seat dealt the Vicar card, or null. */
export function vicarSeat(room: PartyRoom): string | null {
  for (const [id, player] of room.state.players) if (player.priv?.role.roleId === VICAR) return id;
  return null;
}

const vicarGone = (room: PartyRoom, vicar: string): boolean => simOf(room).players.get(vicar)?.dead === true;

function lapse(room: PartyRoom, seat: string): void {
  emitStep(room, seat, 'vendetta.conversion.lapsed');
  progressOf(room, seat).over = true;
}

/** Step stage (`runVendettas`): the shared time, the sowing and the lapse. */
export function runConversion(room: PartyRoom, seat: string): void {
  const prog = progressOf(room, seat);
  if (prog.over || prog.sown) return;
  const vicar = vicarSeat(room);
  if (vicar === null || vicarGone(room, vicar)) return lapse(room, seat);
  if (!isWorldPhase(room.state.phase)) return;
  const me = activeBody(room, seat);
  const them = activeBody(room, vicar);
  if (!me || !them || me.sceneIdx !== them.sceneIdx) return;
  prog.sharedTicks++;
  if (prog.sharedTicks < balance.vendettas.conversion.shareS * TICK_RATE) return;
  prog.sown = true;
  emitStep(room, seat, 'vendetta.conversion.sown');
}

/** The bus's `meeting` (a meeting has opened): a sown doubt silences the Vicar's vote at this one. */
export function onMeetingConversion(room: PartyRoom): void {
  const index = flowOf(room).meetings.length - 1;
  const vicar = vicarSeat(room);
  for (const seat of vendettaHolders(room).keys()) {
    if (vendettaOf(room, seat)?.kind !== 'conversion') continue;
    const prog = progressOf(room, seat);
    if (prog.over || !prog.sown || simOf(room).players.get(seat)?.dead !== false) continue;
    if (vicar === null || vicarGone(room, vicar)) {
      lapse(room, seat);
      continue;
    }
    prog.doubtMeeting = index;
    emitStep(room, seat, 'vendetta.conversion.doubt');
  }
}

/** Whether `voter`'s vote counts in this meeting's tally (the one-line hook in `sim/Meeting.ts`). */
export function countsVote(room: PartyRoom, voter: string): boolean {
  if (voter !== vicarSeat(room)) return true;
  const index = flowOf(room).meetings.length - 1;
  for (const seat of vendettaHolders(room).keys())
    if (progressOf(room, seat).doubtMeeting === index) return false;
  return true;
}
