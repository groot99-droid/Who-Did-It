import { balance, scenes } from '@wdi/content';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { emitSim, onSim } from '../events/bus';
import { reject, sceneKey } from '../World';
import { simOf } from '../RoomSim';
import { balanceOf, bankAccount, movePurse } from './purse';
import { counterProblem } from './shops';
import { refusal } from '../refusal';

/**
 * The bank (round 8, GDD 3.23; docs/round8/economy.md 2), Session 8C: HollowMere's manor hall and BlackPine's intake
 * office each hold a `bank` static. An `act.hold {action: 'bank'}` at one opens it, and `act.bank` then moves Scrip
 * between the purse and `Private.bank` while the counter stays in reach. Banked Scrip is safe from a mugging and a
 * knockout; only the heist reaches it: a cracked strongbox (`vendetta.heist.cracked`) carries off
 * `economy.heistShare` of every balance into `@strongbox`'s loot, which the cracker pockets.
 */

export const STRONGBOX = '@strongbox';

/** The bank counter each seat holds open, keyed by the match's `MatchSeeds` like the purse ledger. */
const opened = new WeakMap<object, Map<string, string>>();
const subscribed = new WeakSet<PartyRoom>();

function openOf(room: PartyRoom): Map<string, string> {
  let m = opened.get(room.seeds);
  if (!m) {
    m = new Map();
    opened.set(room.seeds, m);
  }
  return m;
}

/** `act.hold {action: 'bank', targetId: propId}` (the one line in `sim/Hold.ts`): opens the bank at that counter. */
export function handleBankHold(room: PartyRoom, sessionId: string, propId: string): void {
  const p = simOf(room).players.get(sessionId);
  const prop = p && scenes[sceneKey(p.sceneIdx)]?.props.find((q) => q.id === propId);
  const problem =
    prop?.kind === 'bank' ? counterProblem(room, sessionId, propId) : refusal('NO_COUNTER', { kind: 'bank' });
  if (problem) {
    reject(room, sessionId, problem);
    return;
  }
  openOf(room).set(sessionId, propId);
}

/** `act.bank {op, amount}`: the whole amount moves between the purse and the bank, or nothing does. */
export function handleBank(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const { op, amount } = payload;
  if ((op !== 'deposit' && op !== 'withdraw') || !Number.isSafeInteger(amount) || (amount as number) < 1) {
    reject(room, sessionId, 'BAD_REQUEST');
    return;
  }
  const propId = openOf(room).get(sessionId);
  const problem = propId
    ? counterProblem(room, sessionId, propId)
    : refusal('COUNTER_CLOSED', { kind: 'bank' });
  if (problem) {
    reject(room, sessionId, problem);
    return;
  }
  const [from, to] =
    op === 'deposit' ? [sessionId, bankAccount(sessionId)] : [bankAccount(sessionId), sessionId];
  if (balanceOf(room, from) < (amount as number)) {
    reject(room, sessionId, 'NEED_SCRIP');
    return;
  }
  movePurse(room, from, to, amount as number, 'bank');
}

/**
 * The heist's take: on the existing `vendetta.heist.cracked` (7H), `economy.heistShare` of every seat's bank balance
 * (rounded down) moves into the strongbox's loot, and `econ.heistTake` says how much in all. 7H names no loot
 * collector, so the cracker pockets it (6Z's ruling; GDD 3.23): a heavy purse is the heist's tell. Without a seated
 * cracker the loot stays in `@strongbox`.
 */
export function bankTake(room: PartyRoom, cracker?: string): void {
  let amount = 0;
  for (const [seat, player] of room.state.players) {
    const share = Math.floor((player.priv?.bank ?? 0) * balance.economy.heistShare);
    amount += movePurse(room, bankAccount(seat), STRONGBOX, share, 'theft');
  }
  emitSim(room, { tick: room.state.tick, kind: 'econ.heistTake', data: { amount } });
  if (cracker && room.state.players.has(cracker)) movePurse(room, STRONGBOX, cracker, amount, 'theft');
}

/** `runEconomy`: listens for the crack once per room. */
export function runBank(room: PartyRoom): void {
  if (subscribed.has(room)) return;
  subscribed.add(room);
  onSim(room, 'vendetta.heist.cracked', (e, r) => bankTake(r, e.seat));
}
