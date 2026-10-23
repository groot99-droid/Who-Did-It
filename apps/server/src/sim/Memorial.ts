import { Phase, S2C } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { type SimEvent, onSim } from './events/bus';
import { flowOf } from './Flow';
import { isOnub } from './onub/state';

/**
 * The Vicar's martyrdom (round 7, GDD 3.20, docs/round7/vendettas.md 3): when the seat whose card is the Vicar dies
 * by the Knife, the next meeting's reveal sends `cutscene { id: MEMORIAL_VICAR, scope: 'all' }` to everyone, once per
 * match, and remembers the seat as `flow.ascendedVicarCandidate` for round 8. Never in the quick mode. It listens on
 * the sim bus: the `death` event and the `phase` event into the reveal.
 */
export const MEMORIAL_VICAR = 'memorialVicar';
const VICAR = 'vicar';

interface MemorialMemory {
  /** The Vicar seat killed by the Knife and not yet mourned. */
  pending: string | null;
  played: boolean;
}

const memories = new WeakMap<PartyRoom, MemorialMemory>();

export function runMemorial(room: PartyRoom): void {
  if (memories.has(room)) return;
  const memory: MemorialMemory = { pending: null, played: false };
  memories.set(room, memory);
  onSim(room, 'start', () => {
    memory.pending = null;
    memory.played = false;
  });
  onSim(room, 'death', (e) => onDeath(room, memory, e));
  onSim(room, 'phase', (e) => {
    if (e.data?.to === Phase.reveal) onReveal(room, memory);
  });
}

function onDeath(room: PartyRoom, memory: MemorialMemory, e: SimEvent): void {
  if (memory.played || isOnub(room) || e.seat === undefined || e.data?.cause !== 'knife') return;
  if (room.state.players.get(e.seat)?.priv?.role.roleId === VICAR) memory.pending = e.seat;
}

function onReveal(room: PartyRoom, memory: MemorialMemory): void {
  if (memory.pending === null || memory.played || isOnub(room)) return;
  memory.played = true;
  flowOf(room).ascendedVicarCandidate = memory.pending;
  memory.pending = null;
  room.broadcast(S2C.cutscene, { id: MEMORIAL_VICAR, scope: 'all' });
}
