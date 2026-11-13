import type { StateView } from '@colyseus/schema';
import type { PartyRoom } from '../../rooms/PartyRoom';

// The snares' room memory and the hold's read (round 10, K6; GDD 3.5), apart from `sim/snares.ts` so that `body/run.ts`
// can ask whether a snare holds a seat without importing the verb module, whose imports lead back to the body stage.

export interface SetSnare {
  sceneIdx: number;
  tx: number;
  ty: number;
  layer: string;
  /** Walkers on the tile when it was set (the layer first); each is safe until it steps off. */
  clear: Set<string>;
}

export interface SnareMemory {
  match: unknown;
  seq: number;
  snares: Map<string, SetSnare>;
  /** A held seat or figure id -> the tick its hold ends. */
  held: Map<string, number>;
  /** Per client: the scene its view holds and the snares added to it. */
  views: Map<string, { view: StateView; scene: string | null; ids: Set<string> }>;
}

const memories = new WeakMap<PartyRoom, SnareMemory>();
export function memoryOf(room: PartyRoom): SnareMemory {
  let mem = memories.get(room);
  if (!mem) {
    mem = { match: room.seeds, seq: 0, snares: new Map(), held: new Map(), views: new Map() };
    memories.set(room, mem);
  }
  return mem;
}

/** Whether a snare holds this seat or figure now (`body/run.ts` stops a held seat's feet; a Rope frees it). */
export const heldBySnare = (room: PartyRoom, id: string): boolean =>
  (memories.get(room)?.held.get(id) ?? 0) > room.state.tick;
