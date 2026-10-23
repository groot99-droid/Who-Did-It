import { balance, scenes } from '@wdi/content';
import { ErrorCode } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { emitSim, onSim } from '../events/bus';
import { reject, sceneKey } from '../World';
import { simOf } from '../RoomSim';
import { balanceOf, bankAccount, movePurse } from './purse';
import { counterProblem } from './shops';

/**
 * The bank (round 8, GDD 3.23; docs/round8/economy.md 2), Session 8C: HollowMere's manor hall and BlackPine's intake
 * office each hold a `bank` static. An `act.hold {action: 'bank'}` at one opens it, and `act.bank` then moves Scrip
 * between the purse and `Private.bank` while the counter stays in reach. Banked Scrip is safe from a mugging and a
 * knockout; only the heist reaches it: a cracked strongbox (`vendetta.heist.cracked`) carries off
 * `economy.heistShare` of every balance into `@strongbox`.
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
    prop?.kind === 'bank'
      ? counterProblem(room, sessionId, propId)
      : { code: ErrorCode.cannot, msg: 'no bank here' };
  if (problem) {
    reject(room, sessionId, problem.code, problem.msg);
    return;
  }
  openOf(room).set(sessionId, propId);
}

/** `act.bank {op, amount}`: the whole amount moves between the purse and the bank, or nothing does. */
export function handleBank(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const { op, amount } = payload;
  if ((op !== 'deposit' && op !== 'withdraw') || !Number.isSafeInteger(amount) || (amount as number) < 1) {
    reject(room, sessionId, ErrorCode.cannot, 'cannot do that');
    return;
  }
  const propId = openOf(room).get(sessionId);
  const problem = propId
    ? counterProblem(room, sessionId, propId)
    : { code: ErrorCode.cannot, msg: 'no bank open' };
  if (problem) {
    reject(room, sessionId, problem.code, problem.msg);
    return;
  }
  const [from, to] =
    op === 'deposit' ? [sessionId, bankAccount(sessionId)] : [bankAccount(sessionId), sessionId];
  if (balanceOf(room, from) < (amount as number)) {
    reject(room, sessionId, ErrorCode.cannot, 'not enough Scrip');
    return;
  }
  movePurse(room, from, to, amount as number, 'bank');
}

/**
 * The heist's take: on the existing `vendetta.heist.cracked` (7H), `economy.heistShare` of every seat's bank balance
 * (rounded down) moves to `@strongbox`, and `econ.heistTake` says how much in all.
 */
export function bankTake(room: PartyRoom): void {
  let amount = 0;
  for (const [seat, player] of room.state.players) {
    const share = Math.floor((player.priv?.bank ?? 0) * balance.economy.heistShare);
    amount += movePurse(room, bankAccount(seat), STRONGBOX, share, 'theft');
  }
  emitSim(room, { tick: room.state.tick, kind: 'econ.heistTake', data: { amount } });
}

/** `runEconomy`: listens for the crack once per room. */
export function runBank(room: PartyRoom): void {
  if (subscribed.has(room)) return;
  subscribed.add(room);
  onSim(room, 'vendetta.heist.cracked', (_e, r) => bankTake(r));
}
