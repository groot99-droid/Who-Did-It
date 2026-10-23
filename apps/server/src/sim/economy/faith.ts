import { balance, economy, scenes } from '@wdi/content';
import { ErrorCode, Phase, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { addStack, canAdd, count, take } from '../Inventory';
import { simOf } from '../RoomSim';
import { isVerbPhase, reject, sceneKey, tileCentre } from '../World';
import { balanceOf, movePurse, TOWN } from './purse';
import { perkMul } from './perks';
import { dropNotice, ledgerOf, systemLine } from './rumours';

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

/** Whether the seat stands in verb reach of an altar prop. */
function atAltar(room: PartyRoom, seat: string): boolean {
  const p = simOf(room).players.get(seat);
  if (!p || p.dead || !p.placed) return false;
  const scene = scenes[sceneKey(p.sceneIdx)];
  return (scene?.props ?? []).some((prop) => {
    if (!economy.faith.altars.includes(prop.id)) return false;
    const dx = p.x - tileCentre(prop.x, TILE_PX);
    const dy = p.y - tileCentre(prop.y, TILE_PX);
    return Math.hypot(dx, dy) <= balance.doors.reachTiles * TILE_PX;
  });
}

/** `act.donate {amount}`: Scrip to the town at an altar, Faith in return. */
export function handleDonate(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const { amount } = payload;
  const priv = room.state.players.get(seat)?.priv;
  if (!priv || typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) return;
  if (!isVerbPhase(room.state.phase)) return reject(room, seat, ErrorCode.wrongPhase, 'not now');
  if (!atAltar(room, seat)) return reject(room, seat, ErrorCode.outOfRange, 'no altar here');
  const { max, perScrip, donateMax } = economy.faith;
  if (priv.faith >= max) return reject(room, seat, ErrorCode.cannot, 'your Faith is full');
  const moved = movePurse(room, seat, TOWN, Math.min(amount, donateMax), 'faith');
  if (moved === 0) return reject(room, seat, ErrorCode.cannot, 'no Scrip to give');
  priv.faith = Math.min(max, priv.faith + Math.floor(moved * perScrip * perkMul(room, seat, 'faithGain')));
}

/** `act.faith {kind}`: buy at an altar outside a meeting; present a held one inside a meeting. */
export function handleFaith(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const { kind } = payload;
  if (kind !== 'indulgence' && kind !== 'seal') return;
  const player = room.state.players.get(seat);
  const p = simOf(room).players.get(seat);
  if (!player?.priv || !p || p.dead) return reject(room, seat, ErrorCode.cannot, 'not now');
  const item = kind === 'indulgence' ? INDULGENCE : SEAL;
  if (isMeeting(room.state.phase)) {
    if (!take(player, item, 1)) return reject(room, seat, ErrorCode.cannot, 'you hold none');
    if (kind === 'indulgence') voidOldestNaming(room, player.look);
    else presentSeal(room, seat, player.name);
    return;
  }
  if (!isVerbPhase(room.state.phase)) return reject(room, seat, ErrorCode.wrongPhase, 'not now');
  if (!atAltar(room, seat)) return reject(room, seat, ErrorCode.outOfRange, 'no altar here');
  const price = economy.faith[kind];
  const faith = Math.ceil(price.faith * (kind === 'indulgence' ? perkMul(room, seat, 'indulgenceFaith') : 1));
  if (kind === 'seal' && count(player, SEAL) >= economy.faith.holdMax)
    return reject(room, seat, ErrorCode.cannot, 'you hold a Seal already');
  if (player.priv.faith < faith) return reject(room, seat, ErrorCode.cannot, 'not enough Faith');
  if (balanceOf(room, seat) < price.scrip) return reject(room, seat, ErrorCode.cannot, 'not enough Scrip');
  if (!canAdd(player, item, 1)) return reject(room, seat, ErrorCode.cannot, 'your pack is full');
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
