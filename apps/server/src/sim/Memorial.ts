import { roles } from '@wdi/content';
import { Phase, S2C } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { type SimEvent, onSim } from './events/bus';
import { flowOf } from './Flow';

/**
 * The Vicar's martyrdom (round 7, GDD 3.20, docs/round7/vendettas.md 3, A113). Everything public follows the look
 * (CLAUDE.md, role secrecy): when a seat whose public look is the Vicar's dies by the Knife, cover or not, the next
 * meeting's reveal sends `cutscene { id: MEMORIAL_VICAR, scope: 'all' }` to everyone, once per match. The Ascended
 * Vicar candidacy follows the dealt card and stays private: the seat dealt the Vicar that dies by the Knife becomes
 * `flow.ascendedVicarCandidate` at that reveal, for round 8. It listens on the sim bus: the `death` event and the
 * `phase` event into the reveal.
 *
 * The martyr's due (GDD 3.20, the owner's rule, A131): a Knife death is a Killer's strike (`Kill.ts` is its only
 * source), so the seat the film mourns, chosen by the look like the film, becomes the match's martyr at that reveal,
 * and each real task its ghost finishes from then on counts `tasks.martyrWeight` times on the bar (`Minigames.ts`).
 */
export const MEMORIAL_VICAR = 'memorialVicar';
const VICAR = 'vicar';

interface MemorialMemory {
  /** The seat killed by the Knife under the Vicar's look, waiting for the reveal's film. */
  mourned: string | null;
  played: boolean;
  /** The seat dealt the Vicar killed by the Knife, not yet named the candidate. */
  candidate: string | null;
  /** This match's martyr from its reveal on, with the real tasks it had finished by then. */
  martyr: Martyr | null;
}

export interface Martyr {
  seat: string;
  doneBefore: number;
}

const memories = new WeakMap<PartyRoom, MemorialMemory>();

export function runMemorial(room: PartyRoom): void {
  if (memories.has(room)) return;
  const memory: MemorialMemory = { mourned: null, played: false, candidate: null, martyr: null };
  memories.set(room, memory);
  onSim(room, 'start', () => {
    memory.mourned = null;
    memory.played = false;
    memory.candidate = null;
    memory.martyr = null;
  });
  onSim(room, 'death', (e) => onDeath(room, memory, e));
  onSim(room, 'phase', (e) => {
    if (e.data?.to === Phase.reveal) onReveal(room, memory);
  });
}

function onDeath(room: PartyRoom, memory: MemorialMemory, e: SimEvent): void {
  const player = e.seat === undefined ? undefined : room.state.players.get(e.seat);
  if (!player || e.data?.cause !== 'knife') return;
  if (player.look !== '' && player.look === roles.roles[VICAR]?.look) memory.mourned = e.seat!;
  if (player.priv?.role.roleId === VICAR) memory.candidate = e.seat!;
}

/** The match's martyr, once its reveal has come; null before it and in a match without one. */
export function martyrOf(room: PartyRoom): Martyr | null {
  return memories.get(room)?.martyr ?? null;
}

function onReveal(room: PartyRoom, memory: MemorialMemory): void {
  if (memory.candidate !== null) flowOf(room).ascendedVicarCandidate = memory.candidate;
  memory.candidate = null;
  const seat = memory.mourned;
  if (seat === null || memory.played) return;
  const tasks = room.state.players.get(seat)?.priv?.tasks ?? [];
  memory.martyr = { seat, doneBefore: [...tasks].filter((t) => t.done && !t.fake).length };
  memory.mourned = null;
  memory.played = true;
  room.broadcast(S2C.cutscene, { id: MEMORIAL_VICAR, scope: 'all' });
}
