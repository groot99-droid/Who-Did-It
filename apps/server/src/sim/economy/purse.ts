import { balance, economy } from '@wdi/content';
import type { InvariantFailure } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { emitSim } from '../events/bus';
import { isWorldPhase } from '../World';

/**
 * Scrip (round 8, GDD 3.23; docs/round8/economy.md 2), Session 8C: every seat's purse and bank balance, and the one
 * function that moves Scrip, `movePurse`. A holder is a seat id or an account named with `@`:
 * - `@town` is where Scrip comes from and goes to: it pays out only as a stake, a wage, a sale or a fence, and takes
 *   in only a purchase, rent, a fine, a donation or an HQ tier;
 * - `@bank:<seat>` is that seat's `Private.bank`;
 * - any other `@` account (`@coins:<node>`, `@strongbox`, `@figure:<id>`) lives here in room memory.
 * Nothing else writes a purse (seams.md 4): 8D and 8E call `movePurse`, and `scripConserved` checks that.
 */

export type PurseReason =
  | 'stake'
  | 'wage'
  | 'sale'
  | 'buy'
  | 'rent'
  | 'fine'
  | 'theft'
  | 'drop'
  | 'pickup'
  | 'bank'
  | 'faith'
  | 'hq'
  | 'fence';

export const TOWN = '@town';
export const bankAccount = (seat: string): string => `@bank:${seat}`;

const MINT: ReadonlySet<PurseReason> = new Set(['stake', 'wage', 'sale', 'fence']);
const BURN: ReadonlySet<PurseReason> = new Set(['buy', 'rent', 'fine', 'faith', 'hq']);
const U32_MAX = 0xffffffff;

interface Ledger {
  /** The `@` accounts other than the town and the banks. */
  accounts: Map<string, number>;
  /** What `movePurse` last wrote to each seat's purse and bank: a different number on the wire is a stray write. */
  shadow: Map<string, { purse: number; bank: number }>;
  minted: number;
  burned: number;
  /** Each seat's stake draw in [0, 1), made at Start and paid by `runStakes` once the looks are public. */
  draws: Map<string, number>;
  /** Moves refused for a reason the town does not pay or take; the invariant reports the first. */
  refused: string[];
}

/** Room memory keyed by the match's `MatchSeeds` (a new object at every Start, as the vendettas key theirs). */
const ledgers = new WeakMap<object, Ledger>();

function ledgerOf(room: PartyRoom): Ledger {
  let l = ledgers.get(room.seeds);
  if (!l) {
    l = { accounts: new Map(), shadow: new Map(), minted: 0, burned: 0, draws: new Map(), refused: [] };
    ledgers.set(room.seeds, l);
  }
  return l;
}

const BANK = '@bank:';

/** The seat a seat or bank holder belongs to, or null for the town and the other accounts. */
function seatOf(holder: string): string | null {
  if (holder.startsWith(BANK)) return holder.slice(BANK.length);
  return holder.startsWith('@') ? null : holder;
}

/** What `holder` holds now; the town's purse is bottomless, a seat with no private state holds nothing. */
export function balanceOf(room: PartyRoom, holder: string): number {
  if (holder === TOWN) return Infinity;
  const seat = seatOf(holder);
  if (seat === null) return ledgerOf(room).accounts.get(holder) ?? 0;
  const priv = room.state.players.get(seat)?.priv;
  if (!priv) return 0;
  return holder.startsWith(BANK) ? priv.bank : priv.purse;
}

function setBalance(room: PartyRoom, holder: string, value: number): void {
  const ledger = ledgerOf(room);
  const seat = seatOf(holder);
  if (seat === null) {
    if (value === 0) ledger.accounts.delete(holder);
    else ledger.accounts.set(holder, value);
    return;
  }
  const priv = room.state.players.get(seat)?.priv;
  if (!priv) return;
  const shadow = ledger.shadow.get(seat) ?? { purse: priv.purse, bank: priv.bank };
  if (holder.startsWith(BANK)) priv.bank = shadow.bank = value;
  else priv.purse = shadow.purse = value;
  ledger.shadow.set(seat, shadow);
}

/** A seat holder (its purse or its bank) exists only while the seat has private state. */
const exists = (room: PartyRoom, holder: string): boolean => {
  const seat = seatOf(holder);
  return seat === null || room.state.players.get(seat)?.priv !== undefined;
};

/**
 * Moves up to `amount` Scrip from `from` to `to` and returns what moved: never more than `from` holds, nor more than
 * a u32 purse can take. Each seat's purse that changes sends `purse` on the bus. A move the town may not make for
 * `reason` moves nothing and is kept for `scripConserved`.
 */
export function movePurse(
  room: PartyRoom,
  from: string,
  to: string,
  amount: number,
  reason: PurseReason,
): number {
  if (!Number.isInteger(amount) || amount <= 0 || from === to) return 0;
  if ((from === TOWN && !MINT.has(reason)) || (to === TOWN && !BURN.has(reason))) {
    ledgerOf(room).refused.push(`${from} -> ${to} ${amount} for ${reason} at tick ${room.state.tick}`);
    return 0;
  }
  if (!exists(room, from) || !exists(room, to)) return 0;
  const space = to === TOWN ? Infinity : U32_MAX - balanceOf(room, to);
  const moved = Math.min(amount, balanceOf(room, from), space);
  if (moved <= 0) return 0;
  const ledger = ledgerOf(room);
  if (from === TOWN) ledger.minted += moved;
  else setBalance(room, from, balanceOf(room, from) - moved);
  if (to === TOWN) ledger.burned += moved;
  else setBalance(room, to, balanceOf(room, to) + moved);
  for (const [holder, delta] of [
    [from, -moved],
    [to, moved],
  ] as const) {
    if (holder.startsWith('@')) continue;
    const data = { seat: holder, delta, reason };
    emitSim(room, { tick: room.state.tick, kind: 'purse', seat: holder, data });
  }
  return moved;
}

/**
 * Match start (the one-line hook in `startMatch`, after the covers): every seat's purse and bank back to nothing, and
 * each seat's stake drawn on its own `purse` stream, in seat order. The stakes are paid by `runStakes` once the looks
 * are public, so a cover's stake follows the look it chose. A debug start deals no card and no stake.
 */
export function dealPurses(room: PartyRoom): void {
  const ledger = ledgerOf(room);
  for (const [seat, player] of room.state.players) {
    const priv = player.priv;
    if (!priv) continue;
    priv.purse = 0;
    priv.bank = 0;
    ledger.shadow.set(seat, { purse: 0, bank: 0 });
    ledger.draws.set(seat, room.seeds.get('purse', seat)());
  }
}

/** The stake of a seat wearing `look` whose draw at Start was `draw` (in [0, 1)): its look's tier, never its card. */
export function stakeFor(look: string, draw: number): number {
  const { stakes } = economy;
  const tier = stakes.tiers[stakes.byLook[look] ?? stakes.default] ?? { min: 0, max: 0 };
  return tier.min + Math.min(tier.max - tier.min, Math.floor(draw * (tier.max - tier.min + 1)));
}

/**
 * `runEconomy`: once the match is in a world phase, and so every look is public (`publishLooks`), each seat dealt a
 * stake at Start is paid it from the town, once. A stake follows the public look and never the card (A135), so a
 * cover's purse matches the look it wears and the band at Start says nothing a look does not.
 */
export function runStakes(room: PartyRoom): void {
  const ledger = ledgerOf(room);
  if (ledger.draws.size === 0 || !isWorldPhase(room.state.phase)) return;
  for (const [seat, draw] of ledger.draws) {
    const player = room.state.players.get(seat);
    if (player) movePurse(room, TOWN, seat, stakeFor(player.look, draw), 'stake');
  }
  ledger.draws.clear();
}

/** What inspect sees of a purse (body.md 7): its band, never the number. */
export function purseBand(room: PartyRoom, seat: string): 'light' | 'heavy' {
  return balanceOf(room, seat) >= balance.economy.heavyPurse ? 'heavy' : 'light';
}

const fail = (room: PartyRoom, detail: string): InvariantFailure => ({
  name: '',
  tick: room.state.tick,
  detail,
});

/**
 * The invariant `scripConserved` (economy.md 5), registered by `run.ts`: Scrip enters only as a stake, a wage, a sale
 * or a fence and leaves only as a purchase, rent, a fine, a donation or a tier; everything else moves it. Every purse
 * and bank is what `movePurse` last wrote.
 */
export function scripConserved(room: PartyRoom): InvariantFailure | null {
  const ledger = ledgerOf(room);
  if (ledger.refused.length > 0) return fail(room, `town move refused: ${ledger.refused[0]}`);
  for (const [seat, player] of room.state.players) {
    const priv = player.priv;
    if (!priv) continue;
    const shadow = ledger.shadow.get(seat) ?? { purse: 0, bank: 0 };
    if (priv.purse !== shadow.purse || priv.bank !== shadow.bank)
      return fail(
        room,
        `${seat} holds ${priv.purse}/${priv.bank}, movePurse wrote ${shadow.purse}/${shadow.bank}`,
      );
  }
  // A seat that left keeps its last balance here, so leaving the room is not Scrip leaving the town.
  let held = 0;
  for (const s of ledger.shadow.values()) held += s.purse + s.bank;
  for (const v of ledger.accounts.values()) held += v;
  if (held !== ledger.minted - ledger.burned)
    return fail(room, `${held} Scrip held, ${ledger.minted} minted less ${ledger.burned} spent`);
  return null;
}
