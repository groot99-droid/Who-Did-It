import { ErrorCode, Phase } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { flowOf, refuse } from './Flow';
import { openMeeting, runMeeting } from './Meeting';
import { runPrep } from './onub/Prep';
import { type OnubState, isOnub, onubOf } from './onub/state';
import { simOf } from './RoomSim';

/**
 * The quick-mode night Conductor (GDD 3.11, ARCHITECTURE 5.14): the window list, wakes and sleeps, timeouts and
 * the dawn hand-off. Runs every tick after the portals and before the views reconcile (`sim/Step.ts`); a no-op
 * in the main mode. Session 5B owns this file; the pre-seed is the skeleton of contract 4.3.
 */
export function runConductor(room: PartyRoom): void {
  void room; // stub until 5B lands
}

/** prepReveal -> night (5B): the script from the `script` stream, the nominal night end, the first window. */
function enterNight(room: PartyRoom, o: OnubState): void {
  void room;
  void o; // stub until 5B lands
}

/**
 * The quick-mode phase stage (`runPhases` hands over): dusk -> prepReveal -> night -> dawn -> the Rush -> CRUST
 * -> reveal. The night itself is the Conductor's. The only meeting quick mode opens is the dawn one, so every
 * request and death queued by the main-mode verbs is dropped; a leaver is still counted.
 */
export function runOnubPhases(room: PartyRoom): void {
  const sim = simOf(room);
  for (const e of sim.deaths) if (e.cause === 'vanished') flowOf(room).vanished++; // bugs.md: leavers counted
  sim.deaths.length = 0;
  sim.meetingRequests.length = 0;
  const o = onubOf(room);
  if (!o) return;
  const { phase, tick, phaseEndsTick } = room.state;
  // The hand-offs: 5A's `runPrep` ends prep and sets Phase.prepReveal, 5B's `enterNight` starts the night.
  if (phase === Phase.dusk) runPrep(room);
  else if (phase === Phase.prepReveal && tick >= phaseEndsTick) enterNight(room, o);
  else if (phase === Phase.dawn && tick >= phaseEndsTick) openMeeting(room, { reason: 'dawn', callerId: '' });
  else if (phase === Phase.meetingDiscussion || phase === Phase.meetingVote || phase === Phase.reveal) {
    runMeeting(room);
  }
}

/**
 * `debug.clock` in quick mode (WDI_DEBUG, contract 4.5). Returns true when the command was meant for quick
 * mode. Stub until 5B lands: every quick-mode clock command is refused.
 */
export function onubClock(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): boolean {
  if (!isOnub(room)) return false;
  void payload;
  refuse(room, sessionId, ErrorCode.wrongPhase, 'not now');
  return true;
}
