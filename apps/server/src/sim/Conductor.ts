import { onubBalance, onubFor } from '@wdi/content';
import { ErrorCode, LOFT_SCENE_INDEX, Phase, type PlayerState, S2C, nightScript } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { refuse, secondsToTicks, setPhase } from './Flow';
import { openMeeting, runMeeting } from './Meeting';
import { isNpcSeat } from './Npc';
import { type OnubState, commitAct, isOnub, onubOf, planNpcAct, seededDeadPick } from './Onub';
import { enterScene } from './Portals';
import { simOf } from './RoomSim';

/**
 * The quick-mode night Conductor (GDD 3.11, ARCHITECTURE 5.14, A39): the window list, wakes and sleeps,
 * timeouts and the dawn hand-off. Runs every tick after the portals and before the views reconcile
 * (`sim/Step.ts`); a no-op in the main mode. Every wake and every sleep happens here and sets
 * `viewsDirty`, so a sleeper's view never holds a waker's presence.
 */
export function runConductor(room: PartyRoom): void {
  const o = onubOf(room);
  if (!o || !isOnub(room) || room.state.phase !== Phase.night) return;
  if (room.state.tick < o.stageEndsTick) return;
  if (o.stage === 'window') return closeWindow(room, o);
  if (o.stage !== 'fade') return;
  const next = o.windowIdx + 1;
  if (next >= o.script.length) finishNight(room, o);
  else openWindow(room, o, next);
}

const nightSeconds = (script: { seconds: number }[]): number =>
  script.reduce((sum, w) => sum + w.seconds + onubBalance.timers.fadeS, 0);

/** dusk -> night: unset plates are set, every seat goes to the loft, the script is built, the night is timed. */
function enterNight(room: PartyRoom, o: OnubState): void {
  const sim = simOf(room);
  const state = room.state;
  for (const id of o.dealt.keys()) o.plateSet.add(id);
  o.script = nightScript(
    onubFor(o.dealt.size).deck,
    onubBalance.windows,
    o.rng,
    onubBalance.timers.windowJitterMaxS,
  );
  o.traces = o.script
    .map((w) => onubBalance.windows.find((d) => d.role === w.role)?.traceText ?? '')
    .filter((text) => text !== '');
  state.players.forEach((player: PlayerState, id: string) => {
    const p = sim.players.get(id);
    if (!p) return;
    player.sceneId = LOFT_SCENE_INDEX;
    p.sceneHidden = true;
    sleep(room, id);
  });
  o.windowIdx = -1;
  o.stage = 'fade';
  o.stageEndsTick = state.tick;
  setPhase(room, Phase.night, nightSeconds(o.script));
  sim.viewsDirty = true;
}

/** A seat goes (back) to the loft: no scene, no input, `nightSleep` to its client. */
function sleep(room: PartyRoom, id: string): void {
  const p = simOf(room).players.get(id);
  if (!p) return;
  p.sceneIdx = LOFT_SCENE_INDEX;
  p.input = null;
  p.hold = null;
  room.commands.clearMove(id);
  room.clients.getById(id)?.send(S2C.nightSleep, {});
}

/** Wakes the seats whose DEALT role is the window's (NPC seats included) at the bakery door. */
function openWindow(room: PartyRoom, o: OnubState, idx: number): void {
  const sim = simOf(room);
  const window = o.script[idx];
  if (!window) return;
  o.windowIdx = idx;
  o.stage = 'window';
  o.acted.clear();
  o.npcPlans.clear();
  o.stageEndsTick = room.state.tick + secondsToTicks(window.seconds);
  o.wakers = [...o.dealt].filter(([, role]) => role === window.role).map(([id]) => id);
  for (const id of o.wakers) {
    const player = room.state.players.get(id);
    const p = sim.players.get(id);
    if (!player || !p) continue;
    // A seat that left stays in the list so its mandatory act still happens, but is never moved.
    if (!player.connected && !isNpcSeat(room, id)) continue;
    enterScene(room, player, p, 'bakery', 'door', false, false);
    room.clients
      .getById(id)
      ?.send(S2C.nightWake, { windowRole: window.role, endsTick: o.stageEndsTick, spawn: 'door' });
    if (isNpcSeat(room, id)) planNpcAct(room, o, id);
  }
  sim.viewsDirty = true;
}

/** The window's end: NPC plans and the Sot's seeded pick are applied, then everyone sleeps (before the fade). */
function closeWindow(room: PartyRoom, o: OnubState): void {
  const window = o.script[o.windowIdx];
  const def = onubBalance.windows.find((d) => d.role === window?.role);
  for (const id of o.wakers) {
    if (o.acted.has(id)) continue;
    const plan = o.npcPlans.get(id);
    if (plan) {
      commitAct(
        room,
        o,
        id,
        plan.abilityId,
        plan.targetId2 ? [plan.targetId, plan.targetId2] : [plan.targetId],
      );
    } else if (def?.onTimeout === 'seededPick' && def.acts[0]) {
      commitAct(room, o, id, def.acts[0].act, [seededDeadPick(o)]);
    }
  }
  for (const id of o.wakers) sleep(room, id);
  o.wakers = [];
  o.stage = 'fade';
  o.stageEndsTick = room.state.tick + secondsToTicks(onubBalance.timers.fadeS);
  simOf(room).viewsDirty = true;
}

/** Last fade done: the dawn, everyone still in the loft. */
function finishNight(room: PartyRoom, o: OnubState): void {
  if (o.stage === 'window') closeWindow(room, o);
  o.stage = 'done';
  setPhase(room, Phase.dawn, onubBalance.timers.dawnS);
}

/**
 * The quick-mode phase stage (`runPhases` hands over): dusk -> night -> dawn -> meeting -> reveal. The night
 * itself is the Conductor's. The only meeting quick mode opens is the dawn one, so every request and death
 * queued by the main-mode verbs is dropped; a leaver abstains (`connected` is read where it matters).
 */
export function runOnubPhases(room: PartyRoom): void {
  const sim = simOf(room);
  sim.deaths.length = 0;
  sim.meetingRequests.length = 0;
  const o = onubOf(room);
  const { phase, tick, phaseEndsTick } = room.state;
  if (!o) return;
  if (phase === Phase.dusk && tick >= phaseEndsTick) enterNight(room, o);
  else if (phase === Phase.dawn && tick >= phaseEndsTick) {
    openMeeting(room, { reason: 'dawn', callerId: '' });
  } else if (phase === Phase.meetingDiscussion || phase === Phase.meetingVote || phase === Phase.reveal) {
    runMeeting(room);
  }
}

/**
 * `debug.clock` in quick mode (WDI_DEBUG): `{phase: 'night'}` starts the night now, `{phase: 'dawn'}` ends
 * it, `{window: <roleId>}` jumps the Conductor to that window (the current wakers sleep on the same tick
 * the next ones wake). Returns true when the command was meant for quick mode.
 */
export function onubClock(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): boolean {
  const o = onubOf(room);
  if (!isOnub(room) || !o) return false;
  const phase = room.state.phase;
  const { window, phase: name } = payload;
  if (window !== undefined) {
    const idx = o.script.findIndex((w) => w.role === window);
    if (phase !== Phase.night) refuse(room, sessionId, ErrorCode.wrongPhase, 'not now');
    else if (idx < 0) refuse(room, sessionId, ErrorCode.cannot, 'no such window');
    else {
      if (o.stage === 'window') closeWindow(room, o);
      openWindow(room, o, idx);
    }
  } else if (name === 'night' && phase === Phase.dusk) enterNight(room, o);
  else if (name === 'dawn' && (phase === Phase.dusk || phase === Phase.night)) {
    if (phase === Phase.dusk) enterNight(room, o);
    finishNight(room, o);
  } else if (name === 'night' || name === 'dawn') refuse(room, sessionId, ErrorCode.wrongPhase, 'not now');
  else if (name !== undefined) refuse(room, sessionId, ErrorCode.cannot, 'unknown phase');
  return true;
}
