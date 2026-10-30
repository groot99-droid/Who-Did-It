import { balance, roles } from '@wdi/content';
import { S2C } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { isNpcSeat } from '../Npc';
import { simOf } from '../RoomSim';
import { isOnLine } from '../Train';
import { offerContract } from './contract';
import { holdVendetta, vendettaHolders, vendettaOf } from './state';

/**
 * The Hitman's arrival (round 10, C4a; GDD 3.33, docs/round9/world-mode.md 1.5, followup-4 2.6; seams.md 3 row 20).
 * Nobody is dealt the Hitman. At the deal, on the secret `hitman` stream, the server draws whether he comes (by the
 * human seats, `hitman.byHumans`; never below 3 humans, never in Paint The Town Red), the day (`hitman.days`,
 * uniform) and whether a human or an NPC seat is turned. On that day's `train.delivery` the black-wax letter turns
 * one living, free seat (not on the line) that wears its own card's look (no cover, Cabal or Thief card), holds no
 * vendetta and is no vendetta's partner card:
 * a human if the draw says so and one is eligible, else an NPC seat; with none eligible he never comes. The turned
 * seat keeps its card, its look and every public field: it holds the `hitman` vendetta, its own view's
 * `Private.hitman` is set, and its mark reaches only it (`offerContract`). Everyone sees one line that names nobody,
 * the same whoever is turned. From then its look's town work runs thin and dear (`townWork.ts`, `fare.ts`). The
 * draw and the turned seat live here, in room memory keyed by the match's `MatchSeeds`.
 */

export const HITMAN_VENDETTA = 'hitman';
export const HITMAN_ARRIVE_LINE = "A stranger's coat was seen on the 6:10.";

interface Arrival {
  /** The day (the round) he comes on, or null when he does not come. */
  day: number | null;
  human: boolean;
  turned: string | null;
}

const arrivals = new WeakMap<object, Arrival>();

/** The deal (`Deck.ts`, the main mode only): whether, when and as whom the Hitman comes. Every draw is made. */
export function drawArrival(room: PartyRoom, ids: readonly string[]): void {
  const rng = room.seeds.get('hitman');
  const humans = ids.filter((id) => !isNpcSeat(room, id)).length;
  const row = balance.hitman.byHumans[String(Math.min(10, humans)) as keyof typeof balance.hitman.byHumans];
  const [first, last] = balance.hitman.days;
  const comes = rng() < (row?.comes ?? 0);
  const day = first + Math.min(last - first, Math.floor(rng() * (last - first + 1)));
  const human = rng() < (row?.human ?? 0);
  arrivals.set(room.seeds, { day: comes && row !== undefined ? day : null, human, turned: null });
}

/** Forces the draw (tests, and the `debug.hitman` hook through the step): he comes on `day`, as a human or not. */
export function forceArrival(room: PartyRoom, day: number, human: boolean): void {
  arrivals.set(room.seeds, { day, human, turned: null });
}

const debugQueue = new WeakMap<PartyRoom, { day: number; human: boolean }>();

/** `debug.hitman {day, human}` (WDI_DEBUG only): the message callback only queues; the next delivery applies it. */
export function pushArrivalDebug(room: PartyRoom, payload: unknown): void {
  const p = (payload ?? {}) as { day?: unknown; human?: unknown };
  if (typeof p.day !== 'number' || !Number.isInteger(p.day)) return;
  debugQueue.set(room, { day: p.day, human: p.human === true });
}

/** The draw (tests): the day he comes on (null for never or done) and whether a human is turned. */
export const arrivalDraw = (room: PartyRoom): Readonly<Arrival> | undefined => arrivals.get(room.seeds);

/** Whether `seat` is the turned seat (the Hitman). Server memory: no field but its own `Private.hitman`. */
export const isTurned = (room: PartyRoom, seat: string): boolean => arrivals.get(room.seeds)?.turned === seat;

/**
 * The seats the letter may turn: living, free, wearing their own card's look (no cover, Cabal or Thief card: its
 * `townWork` is not `worn`), holding no vendetta and no vendetta's partner card.
 */
function eligible(room: PartyRoom): string[] {
  const sim = simOf(room);
  const partners = new Set<string>();
  for (const seat of vendettaHolders(room).keys()) {
    const card = vendettaOf(room, seat)?.needsCard;
    if (card !== undefined) partners.add(card);
  }
  return [...room.state.players.keys()].filter((seat) => {
    const card = room.state.players.get(seat)!.priv.role.roleId;
    const p = sim.players.get(seat);
    return (
      p !== undefined &&
      !p.dead &&
      !isOnLine(room, seat) &&
      roles.roles[card]?.townWork.work !== 'worn' && // no cover, no Cabal card, no Thief: its own card's look
      !vendettaHolders(room).has(seat) &&
      !partners.has(card)
    );
  });
}

/** The day's `train.delivery` (`Train.ts`): on the drawn day the letter turns a seat and the town sees the sign. */
export function onDeliveryArrival(room: PartyRoom, round: number): void {
  const forced = debugQueue.get(room);
  if (forced) {
    debugQueue.delete(room);
    forceArrival(room, forced.day, forced.human);
  }
  const a = arrivals.get(room.seeds);
  if (!a || a.day !== round || a.turned !== null) return;
  a.day = null;
  const pool = eligible(room);
  const humans = pool.filter((seat) => !isNpcSeat(room, seat));
  const npcs = pool.filter((seat) => isNpcSeat(room, seat));
  const from = a.human && humans.length > 0 ? humans : npcs;
  if (from.length === 0) return; // nobody to turn: he never comes, and nothing is sent
  const seat = from[Math.floor(room.seeds.get('hitman', 'turn')() * from.length)]!;
  a.turned = seat;
  holdVendetta(room, seat, HITMAN_VENDETTA);
  room.state.players.get(seat)!.priv.hitman = true;
  offerContract(room, seat);
  for (const client of room.clients) {
    client.send(S2C.chatMsg, { from: '', text: HITMAN_ARRIVE_LINE, channel: 'system' });
  }
}
