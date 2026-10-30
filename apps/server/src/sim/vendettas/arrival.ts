import { balance, roles } from '@wdi/content';
import { TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { systemLine } from '../economy/rumours';
import { addStack, canAdd } from '../Inventory';
import { stationOf } from '../MapSites';
import { isNpcSeat } from '../Npc';
import { simOf } from '../RoomSim';
import { isJailed } from '../law/Jail';
import { isOnLine } from '../Train';
import { sceneKey } from '../World';
import { lapseContract, offerContract } from './contract';
import { holdVendetta, vendettaHolders, vendettaOf } from './state';

/**
 * The Hitman's arrival (round 10, C4a; GDD 3.33, docs/round9/world-mode.md 1.5, followup-4 2.6; seams.md 3 row 20).
 * Nobody is dealt the Hitman. At the deal, on the secret `hitman` stream, the server draws whether he comes (by the
 * human seats, `hitman.byHumans`; never below 3 humans, never in Paint The Town Red), the day (`hitman.days`,
 * uniform) and whether a human or an NPC seat is turned. On that day's `train.delivery` the black-wax letter turns
 * one living, free seat (not on the line, not in jail) that wears its own card's look (no cover, Cabal or Thief card), holds no
 * vendetta and is no vendetta's partner card:
 * a human if the draw says so and one is eligible, else an eligible NPC seat; with none in that pool he never comes
 * (so an NPC draw never turns a human, and `human` stays a ceiling). He comes only where the Train runs. The turned
 * seat keeps its card, its look and every public field: it holds the `hitman` vendetta, its own view's
 * `Private.hitman` is set, and its mark reaches only it (`offerContract`). Everyone sees one line that names nobody,
 * the same whoever is turned. The dormant role ships in C4c, with its decoys (6Z). The draw and the turned seat
 * live here, in room memory keyed by the match's `MatchSeeds`.
 */

export const HITMAN_VENDETTA = 'hitman';
export const HITMAN_ARRIVE_LINE = "A stranger's coat was seen on the 6:10.";

interface Arrival {
  /** The day (the round) he comes on, or null when he does not come (or has come). */
  day: number | null;
  human: boolean;
  turned: string | null;
  /** C4b: the round of the turning, the round he shot his mark (null before), and whether he boarded. */
  turnedDay: number;
  killDay: number | null;
  boarded: boolean;
}

/** How far the Hitman got (`gameOver.hitman.stage`, seams.md 3 row 21). */
export type HitmanStage = 'arrived' | 'killed' | 'boarded' | 'stopped';

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
  const at = comes && row !== undefined ? day : null;
  arrivals.set(room.seeds, { day: at, human, turned: null, turnedDay: 0, killDay: null, boarded: false });
}

/** Forces the draw (tests, and the `debug.hitman` hook through the step): he comes on `day`, as a human or not. */
export function forceArrival(room: PartyRoom, day: number, human: boolean): void {
  arrivals.set(room.seeds, { day, human, turned: null, turnedDay: 0, killDay: null, boarded: false });
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

/** Whether the arrival line has gone out (public: every seat was sent it; never who was turned). C4d. */
export const arrivalLineSent = (room: PartyRoom): boolean =>
  (arrivals.get(room.seeds)?.turned ?? null) !== null;

/**
 * The seats the letter may turn: living, free, wearing their own card's look (no cover, Cabal or Thief card: its
 * `townWork` is not `worn`), holding no vendetta and no vendetta's partner card, and with room in the pack for the
 * Derringer (C4b; never dropped or evicting a stack, both public, and the pool is never public).
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
      !isJailed(room, seat) && // free: off the line and out of jail (row 20)
      roles.roles[card]?.townWork.work !== 'worn' && // no cover, no Cabal card, no Thief: its own card's look
      !vendettaHolders(room).has(seat) &&
      !partners.has(card) &&
      canAdd(room.state.players.get(seat)!, DERRINGER_ITEM, 1)
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
  a.turnedDay = round;
  holdVendetta(room, seat, HITMAN_VENDETTA);
  const player = room.state.players.get(seat)!;
  player.priv.hitman = true;
  addStack(player, DERRINGER_ITEM, 1); // C4b: the day weapon, concealed in its own pack
  offerContract(room, seat);
  systemLine(room, HITMAN_ARRIVE_LINE);
}

/** The Derringer's item id (`items.json`, role-bound, kept at death; `dayWeapon.ts`). */
export const DERRINGER_ITEM = 'derringer';

/** Whether `seat` boarded the Dusk Train and left play (C4b). Server memory; its own `Private.departed` mirrors it. */
export const isDeparted = (room: PartyRoom, seat: string): boolean => {
  const a = arrivals.get(room.seeds);
  return a?.boarded === true && a.turned === seat;
};

/** The Derringer's shot (`dayWeapon.ts`): a shot that killed the mark, on this round. */
export function onShotArrival(room: PartyRoom, seat: string, onMark: boolean): void {
  const a = arrivals.get(room.seeds);
  if (a?.turned === seat && onMark) a.killDay = room.state.round;
}

/**
 * The Dusk Train's departure of `round` (`Train.ts`). A Hitman who shot his mark today, living and placed in the
 * station's scene within `train.hearTiles` of the platform, boards it: he leaves play (unplaced, so his avatar leaves
 * every view as any leaving avatar does; the roster keeps him alive), his own `Private.departed` is set, and the win
 * check counts him for nobody. A Hitman with no kill by the dusk of the `hitman.contractDays`th day from the turning
 * sees his contract lapse.
 */
export function onDuskArrival(room: PartyRoom, round: number): void {
  const a = arrivals.get(room.seeds);
  const seat = a?.turned;
  if (!a || seat === null || seat === undefined || a.boarded) return;
  const p = simOf(room).players.get(seat);
  const player = room.state.players.get(seat);
  if (!p || !player || p.dead) return;
  const station = stationOf(room);
  if (a.killDay === round && station && p.placed && sceneKey(p.sceneIdx) === station.sceneId) {
    const near = Math.hypot(p.x - (station.x + 0.5) * TILE_PX, p.y - (station.y + 0.5) * TILE_PX);
    if (near <= balance.train.hearTiles * TILE_PX) {
      a.boarded = true;
      p.placed = false;
      p.input = null;
      p.hold = null;
      player.priv.departed = true;
      simOf(room).viewsDirty = true;
      return;
    }
  }
  if (a.killDay === null && round >= a.turnedDay + balance.hitman.contractDays - 1) lapseContract(room, seat);
}

/** The game-over frame's `hitman` (seams.md 3 row 21), when he came: the seat, the day and how far he got. */
export function hitmanGameOver(
  room: PartyRoom,
): { seatId: string; day: number; stage: HitmanStage } | undefined {
  const a = arrivals.get(room.seeds);
  if (!a || a.turned === null) return undefined;
  const dead = simOf(room).players.get(a.turned)?.dead === true;
  const stage: HitmanStage = a.boarded
    ? 'boarded'
    : dead
      ? 'stopped'
      : a.killDay !== null
        ? 'killed'
        : 'arrived';
  return { seatId: a.turned, day: a.turnedDay, stage };
}
