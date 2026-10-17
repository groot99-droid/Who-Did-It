import { Phase, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { npcMemory, syncNpcCount, type NpcDebugCommand } from './npc/memory';
import { readyOnRoleCard, runMeetingVotes } from './npc/meeting';
import { runOnubNpc } from './npc/onub';
import { runWorldNpc } from './npc/world';
import { isOnub } from './onub/state';
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
  for (const cmd of mem.debug.splice(0)) if (typeof cmd.walk === 'boolean') mem.walk = cmd.walk;
  if (mem.ids.size === 0) return;

  if (state.phase !== mem.phase) {
    mem.phase = state.phase;
    // A new role card starts a match; a new discussion draws a fresh vote delay. Memory of bodies and
    // suspicion lasts the match.
    if (state.phase === Phase.roleReveal) mem.brains.clear();
    if (state.phase === Phase.meetingDiscussion) {
      for (const brain of mem.brains.values()) {
        brain.voteAtTick = -1;
        brain.flee = null;
        brain.path = null;
      }
    }
  }

  const sim = simOf(room);
  const quick = isOnub(room);
  for (const id of mem.order) {
    const player = state.players.get(id) as PlayerState;
    const p = sim.players.get(id);
    if (!p) continue;
    const brain = mem.brain(id);
    // Quick mode hands every phase but the role card to its own brain (round 5, 5E).
    if (state.phase === Phase.roleReveal) readyOnRoleCard(room, mem, brain, player);
    else if (quick) runOnubNpc(room, mem, brain, player, p);
    else if (state.phase === Phase.meetingDiscussion || state.phase === Phase.meetingVote) {
      runMeetingVotes(room, mem, brain, player, p, false);
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
  mem.phase = -1;
  for (const id of mem.ids) {
    const player = room.state.players.get(id);
    if (player) player.ready = true;
  }
  if (mem.ids.has(room.state.leaderId)) {
    const human = [...room.clients][0]?.sessionId;
    room.state.leaderId = human && room.state.players.has(human) ? human : '';
  }
  syncNpcCount(room);
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
  const walk = (payload as Record<string, unknown>).walk;
  const cmd: NpcDebugCommand = typeof walk === 'boolean' ? { walk } : {};
  npcMemory(room).debug.push(cmd);
}
