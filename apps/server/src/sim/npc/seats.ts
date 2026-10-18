import { generateId } from '@colyseus/core';
import { balance } from '@wdi/content';
import { names } from '@wdi/content/server';
import { MAX_PLAYERS, type PlayerState, type Rng, pickNpcNames } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { newSeat } from '../../rooms/handlers/lobby';
import { registerNpcSeat, scheduleLobbyReady } from '../Npc';

// The NPC seats (GDD 3.12). Session 5H owns this file; the round-5 pre-seed moved these bodies here unchanged from
// `rooms/handlers/lobby.ts`, whose calls stay there and are locked (`deck/wire.md` 8.1, ruling X5). Both calls draw
// the names from the match's `npcNames` stream (`sim/seeds.ts`).

/**
 * Adds one NPC seat in the lobby: a session-shaped id, connected, a pool name, Ready after a delay (GDD 3.12). `id` exists for
 * tests that seat NPCs under fixed ids; the locked calls in `lobby.ts` never pass it.
 */
export function addNpcSeat(room: PartyRoom, rng: Rng, id: string = generateId()): string | null {
  if (room.state.players.size >= MAX_PLAYERS) return null;
  const taken = [...room.state.players.values()].map((p: PlayerState) => p.name);
  const [name] = pickNpcNames(names.pool, taken, 1, rng);
  // Never Ready the moment it appears: it turns Ready `npc.ready.delayS` later, the way a human clicks (GDD 3.12).
  newSeat(room, id, name as string).ready = false;
  registerNpcSeat(room, id);
  scheduleLobbyReady(room, id);
  return id;
}

/** Fills the party up to `players.min` with NPC seats; called by `startMatch` before the deal. */
export function fillNpcSeats(room: PartyRoom, rng: Rng): void {
  while (room.state.players.size < balance.players.min) if (addNpcSeat(room, rng) === null) break;
}
