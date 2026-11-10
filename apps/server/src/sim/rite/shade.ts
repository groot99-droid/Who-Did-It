import { roles } from '@wdi/content';
import { type DeathCause, Phase, S2C } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { onSim } from '../events/bus';
import { rolesOf } from '../Flow';
import { simOf } from '../RoomSim';
import { sceneKey } from '../World';

/**
 * The martyr's shade (story R2, GDD 3.8 and 3.20, DECISIONS A600 R-Q4). A seat in the Vicar's public look struck by the
 * Knife, cover or not (the martyr follows the look, R-Q3), is a **shade** from its death, not a ghost: it walks like a
 * ghost (`PlayerSim.dead`: through walls and portals, unseen by the living) but keeps a living seat's view, as a seat
 * on the line does (C1): its `killed` names no role, its view holds no ghost and no ghost tag (`Visibility.ts`), and
 * the ghost channel neither reaches it nor takes its lines (`Chat.ts`). One shade per match: the first such death.
 * At the next day phase (or the Final Night) a shade still waiting becomes an ordinary ghost, and only then is it
 * sent every seat's role. A shade whose rite is done comes back instead (`rite.ts`, R4). Room memory only.
 */
interface ShadeMemory {
  /** The match's shade while it waits; null before the death and once it has become a ghost (or returned). */
  seat: string | null;
  /** The seat that was this match's shade, kept after the wait ends: the martyr is one seat per match. */
  martyr: string | null;
  /** The tick the shade died on: a return resumes its cooldowns where they stood. */
  deathTick: number;
}

const memories = new WeakMap<PartyRoom, ShadeMemory>();
const VICAR_LOOK = roles.roles.vicar?.look ?? null;
/** The phases that close a shade's wait: a new day, or the Final Night that replaces one (`rite.ts` hears them). */
export const DAWNS: readonly number[] = [Phase.day, Phase.finalNight];

function memoryOf(room: PartyRoom): ShadeMemory {
  let memory = memories.get(room);
  if (memory) return memory;
  memories.set(room, (memory = { seat: null, martyr: null, deathTick: 0 }));
  const m = memory;
  onSim(room, 'start', () => {
    m.seat = null;
    m.martyr = null;
  });
  return memory;
}

/** Registers the shade's listeners (`runMemorial` calls it once a tick; the first call registers). */
export function watchShades(room: PartyRoom): void {
  memoryOf(room);
}

/** Whether `seat` is the match's waiting shade: dead, with a living seat's view and no ghost channel. */
export const isShade = (room: PartyRoom, seat: string): boolean => memories.get(room)?.seat === seat;

/** The seat that became this match's shade (waiting or not), or null: the martyr the memorial mourns. */
export const martyrSeatOf = (room: PartyRoom): string | null => memories.get(room)?.martyr ?? null;

/** The match's waiting shade, or null. */
export const shadeOf = (room: PartyRoom): string | null => memories.get(room)?.seat ?? null;

/**
 * Called by `markDead` (locked call site) for a death that does not go on the line: makes `seat` the match's shade
 * when it is the first Knife death of the match under the Vicar's public look, and says whether it did.
 */
export function becomesShade(room: PartyRoom, seat: string, cause: DeathCause): boolean {
  const player = room.state.players.get(seat);
  if (cause !== 'knife' || !player || VICAR_LOOK === null || player.look !== VICAR_LOOK) return false;
  const memory = memoryOf(room);
  if (memory.martyr !== null) return false;
  memory.martyr = seat;
  memory.seat = seat;
  memory.deathTick = room.state.tick;
  return true;
}

/** Ends the shade's wait without a ghost (R4's return): its seat and death tick, or null when none waits. */
export function endShade(room: PartyRoom): { seat: string; deathTick: number } | null {
  const memory = memories.get(room);
  const seat = memory?.seat ?? null;
  if (!memory || seat === null) return null;
  memory.seat = null;
  simOf(room).viewsDirty = true;
  return { seat, deathTick: memory.deathTick };
}

/** Ends the wait with no rite done (`rite.ts`, at the next day): the shade is now an ordinary ghost. */
export function expireShade(room: PartyRoom): void {
  const ended = endShade(room);
  if (ended) ghostView(room, ended.seat);
}

/** A ghost's view of the roles, late: a second `killed`, with no cutscene, since the death already played its own. */
export function ghostView(room: PartyRoom, seat: string): void {
  const p = simOf(room).players.get(seat);
  if (!p) return;
  room.clients
    .getById(seat)
    ?.send(S2C.killed, { sceneId: sceneKey(p.sceneIdx), cause: 'knife', roles: rolesOf(room) });
}
