import { balance, scenes } from '@wdi/content';
import { S2C } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { isJailed, untilDawnS } from '../law/Jail';
import { simOf } from '../RoomSim';
import { arrivalLineSent } from '../vendettas/arrival';
import { isVerbPhase, reject, sceneKey } from '../World';
import { owesFare } from './fare';
import { rentHardships } from './hardship';
import { nearProp } from './reach';

/**
 * The Clerk's rent ledger (round 10, C4d; GDD 3.33, followup-4 2.6 b5 and 2.7; seams.md 3 row 37). `ledger.read
 * {propId}` at a `ledger` prop in reach (HollowMere's `bk.ledger`) is queued by `runCommands` and answered at once,
 * to the reader alone, with every rent hardship of the match so far (`hardship.ts`), oldest first, as the day it
 * struck and the struck seat's `Player.look` then: never a seat, a handle, a name, a card, a cover, another kind of
 * hardship or a real boarding. Every reader at a tick gets the same rows and the server keeps nothing of who read;
 * reading it takes the trip, as no public state carries it. The read has no hold, clip or noise. NPC seats read it too
 * (`npc/routine.ts`): at each trip they pick, a draw on their own stream sends one to the books, `hardship.readLedger`
 * `after` the Hitman's arrival line (public) and `before` it, so a stop at the Clerk's books marks no one (seams.md 6).
 */

/** Whether `propId` is a `ledger` prop of the seat's scene. */
const ledgerHere = (sceneIdx: number, propId: string): boolean =>
  (scenes[sceneKey(sceneIdx)]?.props ?? []).some((q) => q.kind === 'ledger' && q.id === propId);

/** The ledger's rows now: the same for every reader. */
export const ledgerRows = (room: PartyRoom): Array<{ day: number; lookId: string }> =>
  rentHardships(room).map((r) => ({ day: r.round, lookId: r.look }));

/** `ledger.read {propId}`: refuses with the shared reasons, or sends the ledger to the reader. */
export function handleLedgerRead(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const propId = payload.propId;
  if (typeof propId !== 'string') return reject(room, sessionId, 'BAD_REQUEST');
  const p = simOf(room).players.get(sessionId);
  if (!p || p.dead || !p.placed) return reject(room, sessionId, 'NOT_IN_PLAY');
  if (!isVerbPhase(room.state.phase)) return reject(room, sessionId, 'PHASE_CLOSED');
  if (isJailed(room, sessionId))
    return reject(room, sessionId, 'IN_JAIL', { untilDawn: untilDawnS(room, sessionId) });
  if (!ledgerHere(p.sceneIdx, propId) || !nearProp(room, sessionId, [propId]))
    return reject(room, sessionId, 'TOO_FAR');
  room.clients.getById(sessionId)?.send(S2C.ledger, { propId, rows: ledgerRows(room) });
}

/** The NPC seats on their way to read the ledger (`npc/routine.ts`). Server memory only. */
const readers = new WeakMap<object, Set<string>>();

/** Whether the NPC seat `seat` is on its way to read the ledger: the books are a station for it (`npc/chores.ts`). */
export const goesToReadLedger = (room: PartyRoom, seat: string): boolean =>
  readers.get(room.seeds)?.has(seat) === true;

/** At a trip the NPC seat picks (`npc/routine.ts`): one draw on its own stream may send it to read the ledger. */
export function drawLedgerRead(room: PartyRoom, seat: string, rng: () => number): void {
  const chance = balance.hardship.readLedger[arrivalLineSent(room) ? 'after' : 'before'];
  if (chance <= 0 || goesToReadLedger(room, seat) || owesFare(room, seat) || rng() >= chance) return;
  let set = readers.get(room.seeds);
  if (!set) readers.set(room.seeds, (set = new Set()));
  set.add(seat);
}

/** The NPC seat reached the books (`npc/routine.ts`): it reads for the errand's length, then goes on. */
export const readLedgerDone = (room: PartyRoom, seat: string): void =>
  void readers.get(room.seeds)?.delete(seat);
