import { Phase, S2C } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { clientOf } from '../seatIds';
import { simOf } from '../RoomSim';

/**
 * The Vicar's Peaceful route (story I9, GDD 3.23, DECISIONS A606; round 10 scope 2.2, the routes table). Met the first
 * time every living, placed seat other than the dealt Vicar is converted (`economy/conversion.ts`), with at least one
 * such seat, before the end trial. A route never ends the match (scope 2.2's rule; owner, 2026-11-11): the route is
 * recorded here, the dealt Vicar alone is told (`S2C.conversion {kind: 'peaceful'}`), and the play goes on. The routes
 * engine and the ledger (W5, W6) read `peacefulOf` when they land, to show it at game over. Room memory only.
 */
interface PeacefulMemory {
  /** The dealt Vicar whose route is met, and the tick it was met on; null until then. */
  met: { seat: string; tick: number } | null;
}

const memories = new WeakMap<PartyRoom, PeacefulMemory>();

function memoryOf(room: PartyRoom): PeacefulMemory {
  let memory = memories.get(room);
  if (!memory) memories.set(room, (memory = { met: null }));
  return memory;
}

/** The met Peaceful route of this match, or null. */
export const peacefulOf = (room: PartyRoom): { seat: string; tick: number } | null =>
  memories.get(room)?.met ?? null;

/** At the match's start (`conversion.ts`'s `start` listener). */
export function resetPeaceful(room: PartyRoom): void {
  memoryOf(room).met = null;
}

/** Every tick: met when every other living, placed seat is converted, before the end trial (the Final Night). */
export function checkPeaceful(room: PartyRoom, vicar: string, converted: ReadonlySet<string>): void {
  const memory = memoryOf(room);
  if (memory.met !== null || room.state.phase === Phase.finalNight) return;
  let others = 0;
  for (const [id, p] of simOf(room).players) {
    if (id === vicar || p.dead || !p.placed) continue;
    if (!converted.has(id)) return;
    others++;
  }
  if (others === 0) return;
  memory.met = { seat: vicar, tick: room.state.tick };
  clientOf(room, vicar)?.send(S2C.conversion, { kind: 'peaceful' });
}
