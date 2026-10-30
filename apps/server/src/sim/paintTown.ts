import { balance, roles } from '@wdi/content';
import { dealDeck, paintTarget } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { returnGuard } from './law/Guards';
import { type Figure, returnFigure, townsfolkMemory } from './townsfolk/figures';
import { isNpcSeat } from './Npc';
import { simOf } from './RoomSim';
import { isOnLine } from './Train';

/**
 * Paint The Town Red (round 10, C5; GDD 3.8, docs/round9/world-mode.md 1.6, followup-4 2.2; seams.md row 18). A party
 * of exactly two humans and at least one NPC seat deals both humans the Killer card (`Deck.ts`). Every NPC seat's
 * death returns on the next morning train, after dark too (`Train.ts`). A Knife kill of an NPC seat by a Killer adds
 * one to that Killer's total and, the first time that Killer kills that seat, one to its unique count; the two share
 * the win when the union of their victims reaches the target, or when the Vicar's seat, the Clerk and both Constables
 * are dead at once (a guard knifed in this mode returns on the next morning's train too). They lose when both are caught (dead for good) or the end trial closes. Until game over the
 * counts live here, in room memory keyed by the match's `MatchSeeds`: no field, line or refusal changes at a kill.
 */

interface PaintState {
  killers: string[];
  /** The unique count the win needs, fixed at the deal. */
  target: number;
  /** Each Killer seat's victims (unique) and its kills (total). */
  victims: Map<string, Set<string>>;
  totals: Map<string, number>;
  /** Each dead guard figure's id and the round it died: it rides the next morning's train back (round 10, C5c). */
  guardDeaths: Map<string, number>;
}

const states = new WeakMap<object, PaintState>();
const stateOf = (room: PartyRoom): PaintState | undefined => states.get(room.seeds);

/** Whether this match is Paint The Town Red. */
export const isPaintTown = (room: PartyRoom): boolean => states.has(room.seeds);

/** The seats of the deal that are human (not NPC seats). */
export const humansOf = (room: PartyRoom, ids: readonly string[]): string[] =>
  ids.filter((id) => !isNpcSeat(room, id));

/** Whether a deal of `ids` is Paint The Town Red: exactly two humans and at least one NPC seat. */
export const paintsTown = (room: PartyRoom, ids: readonly string[]): boolean =>
  humansOf(room, ids).length === 2 && ids.length > 2;

/**
 * The deck with a second Killer card in place of the Accomplice, else the Drifter, else a profession drawn on `rng`
 * (never the Vicar), so a deck of at most two covers stays one (`validate.ts`). A deck with two Killers is unchanged.
 */
export function paintDeck(cards: readonly string[], rng: () => number): string[] {
  const out = [...cards];
  const holdsKnife = (c: string) => roles.roles[c]?.abilities.includes('kill') === true;
  if (out.filter(holdsKnife).length >= 2) return out;
  let at = out.indexOf('accomplice');
  if (at < 0) at = out.indexOf('drifter');
  if (at < 0) {
    const professions = out.flatMap((c, i) => (roles.roles[c]?.plays !== undefined ? [i] : []));
    at = professions[Math.floor(rng() * professions.length)] ?? -1;
  }
  if (at >= 0) out[at] = 'killer';
  return out;
}

/**
 * The Paint deal over `deck` (a deck row): the deck with its second Killer (`paintDeck`), both humans on the Killer
 * cards, and the NPC seats dealt the rest on `rng` with the Vicar always dealt (6Z's ruling: it is a pillar, so the
 * three pillars stand in every match). Pure, so a test can run it over many seeds.
 */
export function paintDeal(
  humans: readonly string[],
  npcs: readonly string[],
  deck: readonly string[],
  rng: () => number,
): { cards: string[]; dealt: Map<string, string>; undealt: string[] } {
  const cards = paintDeck(deck, rng);
  const left = [...cards];
  for (let i = 0; i < 2; i++) left.splice(left.indexOf('killer'), 1);
  const deal = dealDeck(npcs, left, (card) => card === 'vicar', rng);
  const dealt = new Map<string, string>(humans.map((id) => [id, 'killer']));
  for (const [id, card] of deal.dealt) dealt.set(id, card);
  return { cards, dealt, undealt: deal.undealt };
}

/** The deal's start: the two Killer seats and the target (`paintTarget`, `@wdi/shared`). */
export function beginPaintTown(room: PartyRoom, killers: readonly string[], npcSeats: number): void {
  const target = paintTarget(balance.paintTown.winUnique, npcSeats);
  states.set(room.seeds, {
    killers: [...killers],
    target,
    victims: new Map(),
    totals: new Map(),
    guardDeaths: new Map(),
  });
  for (const seat of killers) {
    const priv = room.state.players.get(seat)?.priv;
    if (priv) priv.paintTown = true;
  }
}

/** A death (`markDead`): a Knife kill of an NPC seat by a Killer counts. Nothing is sent. */
export function onPaintDeath(room: PartyRoom, victim: string, cause: string, killer?: string): void {
  const s = stateOf(room);
  if (!s || cause !== 'knife' || killer === undefined || !s.killers.includes(killer)) return;
  if (!isNpcSeat(room, victim)) return;
  s.totals.set(killer, (s.totals.get(killer) ?? 0) + 1);
  let mine = s.victims.get(killer);
  if (!mine) s.victims.set(killer, (mine = new Set()));
  mine.add(victim);
}

/** A guard's death (the Knife, `Kill.ts`): it counts toward the pillars only, never unique or total. */
export function onGuardDeath(room: PartyRoom, f: Figure): void {
  stateOf(room)?.guardDeaths.set(f.id, room.state.round);
}

/** The morning train's arrival of `round` (`Train.ts`): every guard dead since an earlier round is back at its post. */
export function returnGuards(room: PartyRoom, round: number): void {
  const s = stateOf(room);
  if (!s) return;
  for (const [id, died] of [...s.guardDeaths]) {
    if (died >= round) continue;
    s.guardDeaths.delete(id);
    const f = townsfolkMemory(room).figures.get(id);
    if (!f?.dead) continue;
    returnFigure(room, f);
    returnGuard(f);
  }
}

/** Whether a Killer seat is caught: dead for good (dead and not waiting on the line). */
export function isCaught(room: PartyRoom, seat: string): boolean {
  return simOf(room).players.get(seat)?.dead === true && !isOnLine(room, seat);
}

/** The combined unique count: every NPC seat either Killer has killed. */
function uniqueOf(s: PaintState): number {
  const all = new Set<string>();
  for (const v of s.victims.values()) for (const seat of v) all.add(seat);
  return all.size;
}

/** Whether the three pillars are dead at once: the Vicar's seat, the Clerk and both Constables (guard figures). */
function pillarsDown(room: PartyRoom): boolean {
  const sim = simOf(room);
  let vicar = false;
  for (const [seat, player] of room.state.players)
    if (player.priv.role.roleId === 'vicar') vicar ||= sim.players.get(seat)?.dead === true;
  if (!vicar) return false;
  const guards = [...townsfolkMemory(room).figures.values()].filter(
    (f) => f.kind === 'clerk' || f.kind === 'constable',
  );
  const kinds = new Set(guards.map((f) => f.kind));
  return kinds.has('clerk') && kinds.has('constable') && guards.every((f) => f.dead);
}

/** The match's outcome in this mode (`evaluateWin`): the Killers' win, the Village's, or none yet. */
export function paintWinner(room: PartyRoom): 'paintTown' | 'village' | null {
  const s = stateOf(room);
  if (!s) return null;
  if (uniqueOf(s) >= s.target || pillarsDown(room)) return 'paintTown';
  return s.killers.every((seat) => isCaught(room, seat)) ? 'village' : null;
}

/** The game-over frame's `paintTown` (seams.md row 18): the target and each Killer's counts. */
export function paintGameOver(
  room: PartyRoom,
): { target: number; killers: { seatId: string; unique: number; total: number }[] } | undefined {
  const s = stateOf(room);
  if (!s) return undefined;
  return {
    target: s.target,
    killers: s.killers.map((seatId) => ({
      seatId,
      unique: s.victims.get(seatId)?.size ?? 0,
      total: s.totals.get(seatId) ?? 0,
    })),
  };
}
