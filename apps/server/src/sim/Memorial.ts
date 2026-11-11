import { balance } from '@wdi/content';
import { Phase, S2C, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { type SimEvent, onSim } from './events/bus';
import { runConversion } from './economy/conversion';
import { runRite } from './rite/rite';
import { martyrSeatOf, watchShades } from './rite/shade';

/**
 * The Vicar's martyrdom (round 7, GDD 3.20, docs/round7/vendettas.md 3, A113). Everything public follows the look
 * (CLAUDE.md, role secrecy): when a seat whose public look is the Vicar's dies by the Knife, cover or not, the next
 * meeting's reveal sends `cutscene { id: MEMORIAL_VICAR, scope: 'all' }` to everyone, once per match. It listens on
 * the sim bus: the `death` event and the `phase` event into the reveal. (Story R4, A600 R-Q8: the next-match Ascended
 * Vicar candidacy, `flow.ascendedVicarCandidate`, is gone; the martyr returns the next day of the same match.)
 *
 * The martyr's due (GDD 3.20, the owner's rule, A131): a Knife death is a Killer's strike (`Kill.ts` is its only
 * source), so the seat the film mourns, chosen by the look like the film, is the match's martyr. Story R4 (A600 R-Q6):
 * only a martyr the Medium's rite brought back has the due: from its return (`startMartyrWindow`, `rite/return.ts`)
 * each real task it finishes in the `tasks.martyrS` seconds after counts `tasks.martyrWeight` times on the bar
 * (`Minigames.ts`; the owner's ten minutes, A121). The window's end is snapshotted on the tick it passes.
 *
 * Story R2 (A600): from its death the martyr is a shade (`rite/shade.ts`), which names it: the first Knife death of
 * the match under the Vicar's look.
 */
export const MEMORIAL_VICAR = 'memorialVicar';

interface MemorialMemory {
  /** The seat killed by the Knife under the Vicar's look, waiting for the reveal's film. */
  mourned: string | null;
  played: boolean;
  /** This match's returned martyr from its return on, with the real tasks it had finished by then. */
  martyr: Martyr | null;
}

export interface Martyr {
  seat: string;
  /** Real tasks finished before the return: they count as any ghost's. */
  doneBefore: number;
  /** The first tick past the window. */
  untilTick: number;
  /** Real tasks finished by the window's end, set on the tick it passes; later ones count as the seat's own. */
  doneAtEnd: number | null;
}

const memories = new WeakMap<PartyRoom, MemorialMemory>();

export function runMemorial(room: PartyRoom): void {
  watchShades(room); // story R2: the martyr's shade
  runRite(room); // story R3: the Medium at the rite site, and the rite
  runConversion(room); // story I9: conversion, the sermon, the Peaceful route
  const known = memories.get(room);
  if (known) {
    closeWindow(room, known.martyr);
    return;
  }
  const memory: MemorialMemory = { mourned: null, played: false, martyr: null };
  memories.set(room, memory);
  onSim(room, 'start', () => {
    memory.mourned = null;
    memory.played = false;
    memory.martyr = null;
  });
  onSim(room, 'death', (e) => onDeath(room, memory, e));
  onSim(room, 'phase', (e) => {
    if (e.data?.to === Phase.reveal) onReveal(room, memory);
  });
}

function onDeath(room: PartyRoom, memory: MemorialMemory, e: SimEvent): void {
  if (e.data?.cause !== 'knife' || e.seat === undefined) return;
  // Story R2: the mourned seat is the match's shade, the first Knife death under the Vicar's look (`rite/shade.ts`).
  if (!memory.played && martyrSeatOf(room) === e.seat) memory.mourned = e.seat;
}

/** The match's returned martyr, once the rite has brought it back; null before and in a match without one. */
export function martyrOf(room: PartyRoom): Martyr | null {
  return memories.get(room)?.martyr ?? null;
}

function realDone(room: PartyRoom, seat: string): number {
  const tasks = room.state.players.get(seat)?.priv?.tasks ?? [];
  return [...tasks].filter((t) => t.done && !t.fake).length;
}

function closeWindow(room: PartyRoom, martyr: Martyr | null): void {
  if (martyr && martyr.doneAtEnd === null && room.state.tick >= martyr.untilTick)
    martyr.doneAtEnd = realDone(room, martyr.seat);
}

/** Story R4: the martyr's due opens at its return (`rite/return.ts`). */
export function startMartyrWindow(room: PartyRoom, seat: string): void {
  const memory = memories.get(room);
  if (!memory || memory.martyr !== null) return;
  memory.martyr = {
    seat,
    doneBefore: realDone(room, seat),
    untilTick: room.state.tick + Math.round(balance.tasks.martyrS * TICK_RATE),
    doneAtEnd: null,
  };
}

function onReveal(room: PartyRoom, memory: MemorialMemory): void {
  const seat = memory.mourned;
  if (seat === null || memory.played) return;
  memory.mourned = null;
  memory.played = true;
  room.broadcast(S2C.cutscene, { id: MEMORIAL_VICAR, scope: 'all' });
}
