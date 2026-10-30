import { balance, economy } from '@wdi/content';
import { TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';

/**
 * Hardships (round 10, C4c; GDD 3.33, followup-4 2.6 b2 to b5; seams.md 3 row 20). At every morning `train.delivery`
 * (`Train.ts`, the tick the Hitman's turning uses), the secret `hardship` stream draws how many seats to strike
 * (`hardship.atOnce`, inclusive) and strikes that many from the pool, each with a `hardship.kinds` row, for
 * `hardship.recoverS`. While struck, the seat's look runs thin and dear exactly as a seat Owing the line or the
 * Hitman's turned seat (`townWork.ts` `workOf`, `fare.ts` `shopIsDear`), so a thin, dear stall alone never names him:
 * on the turning delivery the Hitman's stall is one of the delivery's fresh thin stalls. The pool reads only public
 * facts (6Z): a seat shown alive on the roster (`Player.alive`, never the sim's death) whose `Player.look` owns a
 * stall and that has no hardship running, human or NPC, whatever its card; it never reads the card, the NPC flag, the
 * line, the jail or the turning, so the strikes clear no look of anything. A hardship is the sign only: no purse, no
 * card, no play changes, and nothing is sent. A `rent` hardship is kept in room memory for the Clerk's ledger (C4d).
 */

type Kind = (typeof balance.hardship.kinds)[number];

interface Hardship {
  kind: Kind;
  untilTick: number;
  round: number;
}

interface HardshipState {
  running: Map<string, Hardship>;
  /** Every rent hardship of the match by look and round: the Clerk's ledger (C4d). Server memory only. */
  rents: { look: string; round: number }[];
}

const states = new WeakMap<object, HardshipState>();

function stateOf(room: PartyRoom): HardshipState {
  let s = states.get(room.seeds);
  if (!s) states.set(room.seeds, (s = { running: new Map(), rents: [] }));
  return s;
}

const stallLooks = new Set(
  Object.values(economy.shops).flatMap((s) => (s.owner === undefined ? [] : [s.owner])),
);

/** Whether `seat` is under a hardship now: its look runs thin and dear. */
export function inHardship(room: PartyRoom, seat: string): boolean {
  const h = states.get(room.seeds)?.running.get(seat);
  return h !== undefined && room.state.tick < h.untilTick;
}

/** The seats a delivery may strike: public facts only (6Z), in roster order. */
export function hardshipPool(room: PartyRoom): string[] {
  const out: string[] = [];
  for (const [seat, player] of room.state.players)
    if (player.alive && stallLooks.has(player.look) && !inHardship(room, seat)) out.push(seat);
  return out;
}

/** The morning delivery of `round` (`Train.ts`): strike `hardship.atOnce` seats of the pool, every draw on `hardship`. */
export function onDeliveryHardship(room: PartyRoom, round: number): void {
  const s = stateOf(room);
  for (const [seat, h] of s.running) if (room.state.tick >= h.untilTick) s.running.delete(seat);
  const rng = room.seeds.get('hardship');
  const [least, most] = balance.hardship.atOnce;
  const count = least + Math.min(most - least, Math.floor(rng() * (most - least + 1)));
  const pool = hardshipPool(room);
  const until = room.state.tick + Math.round(balance.hardship.recoverS * TICK_RATE);
  for (let i = 0; i < count && pool.length > 0; i++) {
    const seat = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
    const kinds = balance.hardship.kinds;
    const kind = kinds[Math.min(kinds.length - 1, Math.floor(rng() * kinds.length))]!;
    s.running.set(seat, { kind, untilTick: until, round });
    if (kind === 'rent') s.rents.push({ look: room.state.players.get(seat)!.look, round });
  }
}

/** The match's rent hardships, by look and round (the Clerk's ledger, C4d; tests). */
export const rentHardships = (room: PartyRoom): readonly { look: string; round: number }[] =>
  states.get(room.seeds)?.rents ?? [];

/** Strikes `seat` now (tests): a hardship of `kind` for `hardship.recoverS`. */
export function forceHardship(room: PartyRoom, seat: string, kind: Kind = 'robbed'): void {
  const until = room.state.tick + Math.round(balance.hardship.recoverS * TICK_RATE);
  stateOf(room).running.set(seat, { kind, untilTick: until, round: room.state.round });
}
