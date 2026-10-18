import { onubBalance } from '@wdi/content';
import { ErrorCode, type NightRevealEntry, Phase, S2C, mateSlot, nightScript } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { flowOf, refuse, secondsToTicks, setPhase } from './Flow';
import { openMeeting, runMeeting } from './Meeting';
import { completeMustActs, onubWakeView, sendReveal } from './onub/Acts';
import { endPrep, runPrep } from './onub/Prep';
import { type OnubState, isOnub, onubOf } from './onub/state';
import { simOf } from './RoomSim';

/**
 * The quick-mode night Conductor (GDD 3.11, ARCHITECTURE 5.14): the window list, wakes and sleeps, timeouts and
 * the dawn hand-off. Runs every tick after the portals and before the views reconcile (`sim/Step.ts`); a no-op
 * outside the quick-mode night. Every window runs for its full length whether or not anyone woke or acted, so
 * the clock says nothing about the deal.
 */
export function runConductor(room: PartyRoom): void {
  if (!isOnub(room) || room.state.phase !== Phase.night) return;
  const o = onubOf(room);
  if (!o) return;
  const { tick } = room.state;
  if (o.stage === 'window' && tick >= o.stageEndsTick) closeWindow(room, o);
  else if (o.stage === 'fade' && tick >= o.stageEndsTick) openNextWindow(room, o);
}

/** prepReveal -> night (5B): the script from the `script` stream, the nominal night end, the first window. */
function enterNight(room: PartyRoom, o: OnubState): void {
  const { timers, windows } = onubBalance;
  o.script = nightScript(o.deck, windows, room.seeds.get('script'), timers.windowJitterMaxS);
  o.windowIdx = -1;
  o.stage = 'fade';
  o.cloche = '';
  o.wakers = [];
  o.acted.clear();
  o.peeked.clear();
  const nominalS = o.script.reduce((sum, w) => sum + w.seconds + timers.fadeS, 0);
  setPhase(room, Phase.night, nominalS);
  o.stageEndsTick = room.state.tick;
  openNextWindow(room, o);
}

/** The narrator's next call, or dawn after the last fade. */
function openNextWindow(room: PartyRoom, o: OnubState): void {
  if (o.windowIdx + 1 >= o.script.length) return enterDawn(room, o);
  openWindowAt(room, o, o.windowIdx + 1);
}

/** Opens window `idx`: the public narrator call, then every seat dealt its role is woken with its view. */
function openWindowAt(room: PartyRoom, o: OnubState, idx: number): void {
  const w = o.script[idx];
  if (!w) return;
  o.windowIdx = idx;
  o.stage = 'window';
  o.stageEndsTick = room.state.tick + secondsToTicks(w.seconds);
  o.wakers = o.seats.filter((id) => o.dealt.get(id) === w.role);
  o.acted.clear();
  o.peeked.clear();
  room.state.onub.window = w.role;
  for (const id of o.wakers) {
    const view = onubWakeView(room, id);
    if (!view) continue;
    room.clients.getById(id)?.send(S2C.nightWake, { windowRole: w.role, endsTick: o.stageEndsTick, view });
    // The sightings of the opening: the other Spore, the other Commis, the Spores a Levain sees.
    const entries: NightRevealEntry[] = [
      ...view.mates.map((seat) => ({ seat, roleId: w.role })),
      ...view.seen,
    ].map(({ seat, roleId }) => ({
      slot: mateSlot(o.seats.indexOf(seat)),
      kind: 'mate',
      value: roleId,
      of: seat,
    }));
    if (entries.length > 0) sendReveal(room, id, entries);
  }
}

/** The window ends: must-acts are completed by seed, the wakers go back to sleep, the fade starts. */
function closeWindow(room: PartyRoom, o: OnubState): void {
  completeMustActs(room, o);
  for (const id of o.wakers) room.clients.getById(id)?.send(S2C.nightSleep, {});
  o.wakers = [];
  o.acted.clear();
  o.peeked.clear();
  room.state.onub.window = '';
  o.stage = 'fade';
  o.stageEndsTick = room.state.tick + secondsToTicks(onubBalance.timers.fadeS);
}

/** The last fade is over: the Iron Cloche becomes public and dawn begins. */
function enterDawn(room: PartyRoom, o: OnubState): void {
  o.stage = 'done';
  room.state.onub.window = '';
  room.state.onub.cloche = o.cloche;
  setPhase(room, Phase.dawn, onubBalance.timers.dawnS);
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
 * mode. `{phase: 'prepReveal'}` from dusk ends prep; `{phase: 'night'}` from prepReveal starts the night;
 * `{phase: 'dawn'}` from dusk, prepReveal or night runs every remaining step at once (prep timeouts, must-acts by
 * seed, no other act) and opens dawn; `{window: roleId}` in the night closes the open window and opens that one.
 * Anything else is 425 in the wrong phase and 422 when unknown.
 */
export function onubClock(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): boolean {
  if (!isOnub(room)) return false;
  const o = onubOf(room);
  const phase = room.state.phase;
  const wrongPhase = (): void => refuse(room, sessionId, ErrorCode.wrongPhase, 'not now');
  const unknown = (): void => refuse(room, sessionId, ErrorCode.cannot, 'unknown clock');
  if (!o) {
    wrongPhase();
    return true;
  }
  if (typeof payload.window === 'string') {
    if (phase !== Phase.night) wrongPhase();
    else {
      const idx = o.script.findIndex((w) => w.role === payload.window);
      if (idx < 0) unknown();
      else {
        if (o.stage === 'window') closeWindow(room, o);
        openWindowAt(room, o, idx);
      }
    }
    return true;
  }
  const target = payload.phase;
  if (target === 'prepReveal') {
    if (phase !== Phase.dusk) wrongPhase();
    else endPrep(room);
  } else if (target === 'night') {
    if (phase !== Phase.prepReveal) wrongPhase();
    else enterNight(room, o);
  } else if (target === 'dawn') {
    if (phase === Phase.dusk) endPrep(room);
    if (room.state.phase === Phase.prepReveal) enterNight(room, o);
    if (room.state.phase !== Phase.night) {
      wrongPhase();
      return true;
    }
    // Every remaining window runs to its end, must-acts by seed, no other act.
    while (o.stage === 'window' || o.stage === 'fade') {
      if (o.stage === 'window') closeWindow(room, o);
      openNextWindow(room, o);
    }
  } else if (target === undefined) wrongPhase();
  else unknown();
  return true;
}
