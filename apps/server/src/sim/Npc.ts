import { balance } from '@wdi/content';
import { Phase, TICK_RATE, npcDelayTicks, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import {
  type Brain,
  type NpcDebugCommand,
  type NpcMemory,
  npcMemory,
  playRng,
  syncNpcCount,
  timingRng,
} from './npc/memory';
import { runHive } from './npc/hive';
import { readyOnRoleCard, runMeetingVotes } from './npc/meeting';
import { drawPersonas, releaseClaims } from './npc/routine';
import { runWorldNpc } from './npc/world';
import { simOf } from './RoomSim';
import { isWorldPhase } from './World';

/**
 * The NPC stage (GDD 3.12, A39, A41): writes `PlayerSim.input` for every NPC seat and calls the verbs
 * (`runAction`, `queuePortal`, `handleVote`) directly, inside the step. Runs after `syncRoster` and
 * before `applyInputs` (`sim/Step.ts`). NPC state is room memory of `sim/npc/memory.ts`.
 */
export function runNpcs(room: PartyRoom): void {
  const mem = npcMemory(room);
  const state = room.state;
  for (const id of [...mem.ids]) if (!state.players.has(id)) releaseNpcSeat(room, id);
  runHive(room); // round 8, 8R: the public blackboard and its triggers (one line, granted by 6Z)
  for (const cmd of mem.debug.splice(0)) {
    if (typeof cmd.walk === 'boolean') mem.walk = cmd.walk;
    if (typeof cmd.routine === 'boolean') mem.routine = cmd.routine;
  }
  if (mem.ids.size === 0) return;

  if (state.phase !== mem.phase) {
    mem.phase = state.phase;
    // A new role card starts a match: the brains are forgotten and each seat draws its persona. A new discussion
    // draws a fresh vote delay and ends every visit. Memory of bodies and suspicion lasts the match.
    if (state.phase === Phase.roleReveal) {
      mem.brains.clear();
      mem.claims.clear();
      drawPersonas(room, mem);
    }
    if (state.phase === Phase.meetingDiscussion) {
      for (const [id, brain] of mem.brains) {
        brain.voteAtTick = -1;
        brain.voteRolls = null;
        brain.flee = null;
        brain.path = null;
        brain.act = null;
        brain.striking = false;
        brain.aloneWith = null;
        brain.aloneSinceTick = -1;
        releaseClaims(mem, id);
      }
    }
    if (state.phase === Phase.grace || state.phase === Phase.immunity) {
      for (const brain of mem.brains.values()) brain.placementPending = true;
    }
    if (state.phase === Phase.dusk || state.phase === Phase.finalNight) {
      drawNightPowerTicks(room, mem);
    }
  }

  const sim = simOf(room);
  for (const id of mem.order) {
    const player = state.players.get(id) as PlayerState;
    const p = sim.players.get(id);
    if (!p) continue;
    const brain = mem.brain(id);
    // The Last Shot tick is drawn once, on the first tick the seat is seen dead (every NPC, whatever its card): that
    // tick plus a `lastShotS` delay, the tick an aiming NPC Gamekeeper fires at (npc.md 6, 9).
    if (p.dead && brain.lastShotAtTick < 0) {
      brain.lastShotAtTick =
        state.tick +
        npcDelayTicks(
          timingRng(room, id),
          balance.npc.nightPower.lastShotS.min,
          balance.npc.nightPower.lastShotS.max,
          TICK_RATE,
        );
    }
    if (state.phase === Phase.lobby) readyInLobby(room, brain, player);
    else if (state.phase === Phase.roleReveal) readyOnRoleCard(room, mem, brain, player);
    else if (state.phase === Phase.meetingDiscussion || state.phase === Phase.meetingVote) {
      runMeetingVotes(room, mem, brain, player, p);
    } else if (isWorldPhase(state.phase)) runWorldNpc(room, mem, brain, player, p);
  }
}

/**
 * Called by `resetToLobby` after every field is cleared: NPC seats stay seated, are readied again and keep
 * their mark (A39); the brain is forgotten and the lead goes back to a human if the reset left it on a seat.
 */
export function resetNpcsForLobby(room: PartyRoom): void {
  const mem = npcMemory(room);
  mem.brains.clear();
  mem.claims.clear();
  mem.phase = -1;
  for (const id of mem.ids) {
    const player = room.state.players.get(id);
    if (!player) continue;
    // Like a human, an NPC seat turns Ready a moment after the lobby appears (GDD 3.12 "Seats").
    player.ready = false;
    scheduleLobbyReady(room, id);
  }
  if (mem.ids.has(room.state.leaderId)) {
    const human = [...room.clients][0]?.sessionId;
    room.state.leaderId = human && room.state.players.has(human) ? human : '';
  }
  syncNpcCount(room);
}

/** Draws the tick an NPC seat in the lobby turns Ready: `npc.ready.delayS` after now, from its own timing stream. */
export function scheduleLobbyReady(room: PartyRoom, id: string): void {
  const d = balance.npc.ready.delayS;
  npcMemory(room).brain(id).lobbyReadyAtTick =
    room.state.tick + npcDelayTicks(timingRng(room, id), d.min, d.max, TICK_RATE);
}

function readyInLobby(room: PartyRoom, brain: Brain, player: PlayerState): void {
  if (player.ready) return;
  if (brain.lobbyReadyAtTick < 0) scheduleLobbyReady(room, player.id);
  if (room.state.tick >= brain.lobbyReadyAtTick) player.ready = true;
}

/**
 * The night-power tick and pick, drawn by every NPC on the first tick of each dusk and each Final Night hunt
 * (npc.md 6): 5G's NPC night powers read them. The tick is `npc.nightPower.windowFrac` of dusk plus night (or of the
 * hunt) after the phase starts; the pick is a uniform in [0, 1).
 */
function drawNightPowerTicks(room: PartyRoom, mem: NpcMemory): void {
  const f = balance.npc.nightPower.windowFrac;
  const span =
    (room.state.phase === Phase.finalNight
      ? balance.finalNight.huntS
      : balance.phases.duskS + balance.phases.nightS) * TICK_RATE;
  for (const id of mem.order) {
    const brain = mem.brain(id);
    brain.nightPowerAtTick =
      room.state.tick + Math.round(span * (f.min + timingRng(room, id)() * (f.max - f.min)));
    brain.nightPowerPick = playRng(room, id)();
  }
}

/** Whether `id` is an NPC seat of this room (room memory, never on the wire). */
export function isNpcSeat(room: PartyRoom, id: string): boolean {
  return npcMemory(room).ids.has(id);
}

/** Marks a freshly seated player as an NPC (the seat itself is `handlers/lobby.ts` `newSeat`). */
export function registerNpcSeat(room: PartyRoom, id: string): void {
  const mem = npcMemory(room);
  if (mem.ids.has(id)) return;
  mem.ids.add(id);
  mem.order.push(id);
  syncNpcCount(room);
}

/** Forgets an NPC mark: its seat was removed, a human took it, or the roster no longer holds it. */
export function releaseNpcSeat(room: PartyRoom, id: string): void {
  const mem = npcMemory(room);
  mem.ids.delete(id);
  mem.brains.delete(id);
  const at = mem.order.indexOf(id);
  if (at >= 0) mem.order.splice(at, 1);
  syncNpcCount(room);
}

/** The most recently added NPC seat, or undefined when none is seated. */
export function newestNpcSeat(room: PartyRoom): string | undefined {
  return npcMemory(room).order.at(-1);
}

/** `debug.npc` (WDI_DEBUG only): queued by the message callback, applied by the next `runNpcs`. */
export function pushNpcDebug(room: PartyRoom, payload: unknown): void {
  if (payload === null || typeof payload !== 'object') return;
  const { walk, routine } = payload as Record<string, unknown>;
  const cmd: NpcDebugCommand = {};
  if (typeof walk === 'boolean') cmd.walk = walk;
  if (typeof routine === 'boolean') cmd.routine = routine;
  npcMemory(room).debug.push(cmd);
}
