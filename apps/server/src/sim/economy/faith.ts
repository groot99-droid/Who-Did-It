import { economy } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { addStack, canAdd, count, take } from '../Inventory';
import { simOf } from '../RoomSim';
import { isVerbPhase, reject } from '../World';
import { balanceOf, movePurse, TOWN } from './purse';
import { perkMul } from './perks';
import { nearProp } from './reach';
import { dropNotice, ledgerOf, systemLine } from './rumours';
import { propsAtRest } from './townWork';

/**
 * Faith (round 8, GDD 3.23, docs/round8/economy.md 3), Session 8D. Scrip donated at an altar (`act.donate`) earns
 * `Private.faith`; Faith plus Scrip buys an Indulgence or a Parish Seal there (`act.faith {kind}`), items in the
 * private inventory. Presented in a meeting (`act.faith {kind}` while holding one, A139):
 * - an Indulgence silently voids the one oldest notice naming the buyer's look, wherever it is held, and reports
 *   nothing, so the buyer learns nothing either way; burning a held notice of one's own look also uses one;
 * - a Parish Seal posts a public line under the seat's public name, clears every vote cast so far, and for
 *   `sealShieldS` refuses any vote naming the seat (`sealBlocks`, the one line in `handleVote`).
 */

export const INDULGENCE = 'indulgence';
export const SEAL = 'parishSeal';

/** The lines of UI.md 14.35 that the server writes. */
export const FAITH_COPY = {
  seal: (name: string) =>
    `${name} presents a Parish Seal: the charge is a matter for the Church, and the vote begins again.`,
  blocked: 'The Church holds that charge.',
} as const;

const isMeeting = (phase: number) => phase === Phase.meetingDiscussion || phase === Phase.meetingVote;

/** The seats under a Seal's shield, each until a tick. Room memory keyed by the match's `MatchSeeds`. */
const shields = new WeakMap<object, Map<string, number>>();
function shieldsOf(room: PartyRoom): Map<string, number> {
  let m = shields.get(room.seeds);
  if (!m) shields.set(room.seeds, (m = new Map()));
  return m;
}

/** Whether a vote naming `target` is refused now (the one line in `sim/Meeting.ts` `handleVote`). */
export function sealBlocks(room: PartyRoom, target: string): boolean {
  return (shieldsOf(room).get(target) ?? 0) > room.state.tick;
}

/** Meeting start (the locked `sealShield(room)` hook): a shield never outlives the meeting it was presented in. */
export function sealShield(room: PartyRoom): void {
  shieldsOf(room).clear();
}

const atAltar = (room: PartyRoom, seat: string) => nearProp(room, seat, economy.faith.altars);

/** `act.donate {amount}`: Scrip to the town at an altar, Faith in return. */
export function handleDonate(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const { amount } = payload;
  const priv = room.state.players.get(seat)?.priv;
  if (!priv || typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) return;
  if (!isVerbPhase(room.state.phase)) return reject(room, seat, 'PHASE_CLOSED');
  if (!atAltar(room, seat)) return reject(room, seat, 'NO_COUNTER', { kind: 'altar' });
  if (nearProp(room, seat, [...propsAtRest(room)]))
    return reject(room, seat, 'COUNTER_CLOSED', { kind: 'altar' }); // C3
  const { max, perScrip, donateMax } = economy.faith;
  if (priv.faith >= max) return reject(room, seat, 'FAITH_FULL');
  const moved = movePurse(room, seat, TOWN, Math.min(amount, donateMax), 'faith');
  if (moved === 0) return reject(room, seat, 'NEED_SCRIP');
  priv.faith = Math.min(max, priv.faith + Math.floor(moved * perScrip * perkMul(room, seat, 'faithGain')));
}

/** `act.faith {kind}`: buy at an altar outside a meeting; present a held one inside a meeting. */
export function handleFaith(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const { kind } = payload;
  if (kind !== 'indulgence' && kind !== 'seal') return;
  const player = room.state.players.get(seat);
  const p = simOf(room).players.get(seat);
  if (!player?.priv || !p || p.dead) return reject(room, seat, 'NOT_IN_PLAY');
  const item = kind === 'indulgence' ? INDULGENCE : SEAL;
  if (isMeeting(room.state.phase)) {
    if (!take(player, item, 1)) return reject(room, seat, 'NEED_ITEM');
    if (kind === 'indulgence') voidOldestNaming(room, player.look);
    else presentSeal(room, seat, player.name);
    return;
  }
  if (!isVerbPhase(room.state.phase)) return reject(room, seat, 'PHASE_CLOSED');
  if (!atAltar(room, seat)) return reject(room, seat, 'NO_COUNTER', { kind: 'altar' });
  const price = economy.faith[kind];
  const faith = Math.ceil(price.faith * (kind === 'indulgence' ? perkMul(room, seat, 'indulgenceFaith') : 1));
  if (kind === 'seal' && count(player, SEAL) >= economy.faith.holdMax)
    return reject(room, seat, 'ALREADY_HAVE');
  if (player.priv.faith < faith) return reject(room, seat, 'NEED_FAITH');
  if (balanceOf(room, seat) < price.scrip) return reject(room, seat, 'NEED_SCRIP');
  if (!canAdd(player, item, 1)) return reject(room, seat, 'PACK_FULL');
  if (movePurse(room, seat, TOWN, price.scrip, 'faith') !== price.scrip) return;
  player.priv.faith -= faith;
  addStack(player, item, 1);
}

/** Burning a held notice of one's own look spends an Indulgence (`act.notice {op: 'burn'}`). */
export const spendIndulgence = (room: PartyRoom, seat: string): boolean => {
  const player = room.state.players.get(seat);
  return player !== undefined && take(player, INDULGENCE, 1);
};

/** The one oldest notice naming `look`, wherever it is held, leaves the ledger. Nothing reports it. */
function voidOldestNaming(room: PartyRoom, look: string): void {
  if (look === '') return;
  for (const n of ledgerOf(room).notices.values()) {
    if (n.look !== look) continue;
    dropNotice(room, n.id);
    return;
  }
}

function presentSeal(room: PartyRoom, seat: string, name: string): void {
  const shieldS = economy.faith.sealShieldS * perkMul(room, seat, 'sealShield');
  shieldsOf(room).set(seat, room.state.tick + Math.round(shieldS * TICK_RATE));
  for (const other of room.state.players.values()) {
    if (!other.priv) continue;
    other.priv.myVote = '';
    other.hasVoted = false;
  }
  systemLine(room, FAITH_COPY.seal(name));
}
