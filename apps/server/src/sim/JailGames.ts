import { balance } from '@wdi/content';
import type { PartyRoom } from '../rooms/PartyRoom';
import { bodyOf } from './body/state';

/**
 * The county jail's three mini-games (round 10, D8; GDD 3.27): the gym, the yard fight and scrubbing, each once per day
 * and seat. This is their server-only tally, kept per match (a new `MatchSeeds` at every Start); nothing here is sent to
 * a client, and the only visible traces are a harder fist, a smaller health bar and the purse, as for any seat.
 */

export type JailGame = 'gym' | 'yard' | 'scrub';

/** The `minigame` ids of `interactions.json` that open one. */
export const JAIL_GAMES: Readonly<Record<string, JailGame>> = {
  jailGym: 'gym',
  jailYard: 'yard',
  jailScrub: 'scrub',
};

interface Tally {
  /** `<round>|<game>` of each game the seat has opened. */
  played: Set<string>;
  /** Damage the gym has added to the seat's strike. */
  strength: number;
}

const tallies = new WeakMap<object, Map<string, Tally>>();

function tallyOf(room: PartyRoom, seat: string): Tally {
  let all = tallies.get(room.seeds);
  if (!all) tallies.set(room.seeds, (all = new Map()));
  let t = all.get(seat);
  if (!t) all.set(seat, (t = { played: new Set(), strength: 0 }));
  return t;
}

const keyOf = (room: PartyRoom, game: JailGame): string => `${room.state.round}|${game}`;

/** Whether the seat has opened `game` today (this round). */
export const playedToday = (room: PartyRoom, seat: string, game: JailGame): boolean =>
  tallyOf(room, seat).played.has(keyOf(room, game));

/** Marks `game` opened for the seat today: a board abandoned half-way is spent, so a hard draw cannot be rerolled. */
export const markPlayed = (room: PartyRoom, seat: string, game: JailGame): void => {
  tallyOf(room, seat).played.add(keyOf(room, game));
};

/** The damage the gym added to the seat's strike (a fist or the slingshot). */
export const strengthOf = (room: PartyRoom, seat: string): number => tallyOf(room, seat).strength;

/** One Strength for the match: a second workout adds nothing. */
export function addStrength(room: PartyRoom, seat: string): void {
  tallyOf(room, seat).strength = balance.jail.gym.damage;
}

/** A lost yard fight: the seat's maximum health drops by `maxHpLoss`, never under `maxHpFloor`; health follows it down. */
export function loseMaxHp(room: PartyRoom, seat: string): void {
  const body = bodyOf(room, seat);
  if (!body) return;
  const y = balance.jail.yard;
  body.maxHp = Math.max(y.maxHpFloor, body.maxHp - y.maxHpLoss);
  body.hp = Math.min(body.hp, body.maxHp);
}
