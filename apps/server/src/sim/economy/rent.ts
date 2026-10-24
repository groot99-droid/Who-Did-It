import { balance, economy, scenes } from '@wdi/content';
import { EffectId, EffectState, ErrorCode, Phase, type PlayerState, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { emitSim } from '../events/bus';
import { take, count } from '../Inventory';
import { mapIdOfRoom, mapScenesOf } from '../MapSites';
import { simOf } from '../RoomSim';
import { isVerbPhase, reject, sceneKey } from '../World';
import { balanceOf, movePurse, TOWN } from './purse';
import { perkMul } from './perks';
import { nearProp } from './reach';

/**
 * Rent, the quota and Indebted (round 8, GDD 3.23, docs/round8/economy.md 3), Session 8D. Each day is one shift:
 * - on a rent map, `rent.amount` falls due from every living seat `rent.dueAtDayFrac` into the day (`rent.due`);
 * - on a quota map, every living seat owes `quota.qty` of `quota.items` hauled to a tally rack (`act.hold {action:
 *   'rack'}`, `quota.met`); at dusk a short seat is fined `quota.fine` from its purse;
 * - at dusk a seat that still owes (rent unpaid, a fine its purse could not cover) becomes Indebted, `EffectId.indebted`
 *   in its private `Private.body.effects`: no bit is drawn, inspect reads "a hunted look", and from dusk to dawn the
 *   doors of `economy.curfew` refuse it (`curfewBars`, the one line in `sim/Portals.ts`);
 * - `act.payRent` at a bank counter pays the whole debt and clears it (`rent.paid`).
 * The debts are room memory keyed by the match's `MatchSeeds`; nothing here draws a random number.
 */

interface Dues {
  /** Scrip each seat owes the town. */
  debt: Map<string, number>;
  /** Quota items each seat has hauled this shift. */
  hauled: Map<string, number>;
  /** The round whose shift is open, whose rent fell due, and whose dusk settled it. */
  shiftRound: number;
  rentRound: number;
  settledRound: number;
  shiftStartTick: number;
}

const dues = new WeakMap<object, Dues>();
export function duesOf(room: PartyRoom): Dues {
  let d = dues.get(room.seeds);
  if (!d) {
    d = {
      debt: new Map(),
      hauled: new Map(),
      shiftRound: -1,
      rentRound: -1,
      settledRound: -1,
      shiftStartTick: 0,
    };
    dues.set(room.seeds, d);
  }
  return d;
}

const AFTER_DARK = new Set<number>([Phase.dusk, Phase.night, Phase.finalNight, Phase.dawn]);
const onMap = (room: PartyRoom, maps: readonly string[]) => maps.includes(mapIdOfRoom(room));

/** The living seats, by seat id. */
function living(room: PartyRoom): PlayerState[] {
  const sim = simOf(room);
  return [...room.state.players.values()].filter((pl) => pl.priv && sim.players.get(pl.id)?.dead === false);
}

/** Quota items a seat owes this shift (an HQ perk scales it). */
const quotaOf = (room: PartyRoom, seat: string) =>
  Math.ceil(economy.quota.qty * perkMul(room, seat, 'quotaDue'));

export function isIndebted(room: PartyRoom, seat: string): boolean {
  const effects = room.state.players.get(seat)?.priv?.body.effects;
  return effects?.some((e) => e.id === EffectId.indebted) ?? false;
}

function setIndebted(room: PartyRoom, seat: string, on: boolean): void {
  const effects = room.state.players.get(seat)?.priv?.body.effects;
  if (!effects || isIndebted(room, seat) === on) return;
  if (on) effects.push(Object.assign(new EffectState(), { id: EffectId.indebted, untilTick: 0, stacks: 1 }));
  else
    effects.splice(
      effects.findIndex((e) => e.id === EffectId.indebted),
      1,
    );
}

/**
 * Whether a door into `to` refuses this seat now: an Indebted living seat after dark, crossing from outdoors into a
 * curfew scene. Only the house door is locked: a seat already inside moves between its rooms and can always leave.
 */
export function curfewBars(room: PartyRoom, seat: string, to: string | null): boolean {
  if (to === null || !AFTER_DARK.has(room.state.phase)) return false;
  const p = simOf(room).players.get(seat);
  if (p?.dead !== false || !isIndebted(room, seat)) return false;
  if (scenes[sceneKey(p.sceneIdx)]?.kind !== 'exterior') return false;
  return economy.curfew[mapIdOfRoom(room)]?.includes(to) ?? false;
}

/** One tick inside `runCivic`: opens the shift, makes the rent fall due, and settles the shift at dusk. */
export function runRent(room: PartyRoom): void {
  const d = duesOf(room);
  const { phase, round, tick } = room.state;
  if (phase === Phase.day && d.shiftRound !== round) {
    d.shiftRound = round;
    d.shiftStartTick = tick;
    d.hauled.clear();
    if (onMap(room, economy.quota.maps))
      for (const pl of living(room))
        emitSim(room, { tick, kind: 'quota.due', seat: pl.id, data: { qty: quotaOf(room, pl.id) } });
  }
  const dueTick = d.shiftStartTick + Math.round(economy.rent.dueAtDayFrac * balance.phases.dayS * TICK_RATE);
  if (phase === Phase.day && d.rentRound !== round && tick >= dueTick) {
    d.rentRound = round;
    if (onMap(room, economy.rent.maps))
      for (const pl of living(room)) {
        const amount = Math.ceil(economy.rent.amount * perkMul(room, pl.id, 'rentDue'));
        d.debt.set(pl.id, (d.debt.get(pl.id) ?? 0) + amount);
        emitSim(room, { tick, kind: 'rent.due', seat: pl.id, data: { amount } });
      }
  }
  if (AFTER_DARK.has(phase) && d.shiftRound === round && d.settledRound !== round) {
    d.settledRound = round;
    settle(room, d);
  }
}

/** Dusk: a short seat pays the quota fine from its purse, and whoever still owes is Indebted. */
function settle(room: PartyRoom, d: Dues): void {
  const quota = onMap(room, economy.quota.maps);
  for (const pl of living(room)) {
    if (quota && (d.hauled.get(pl.id) ?? 0) < quotaOf(room, pl.id)) {
      const fine = economy.quota.fine;
      const short = fine - movePurse(room, pl.id, TOWN, fine, 'fine');
      if (short > 0) d.debt.set(pl.id, (d.debt.get(pl.id) ?? 0) + short);
    }
    if ((d.debt.get(pl.id) ?? 0) > 0) setIndebted(room, pl.id, true);
  }
}

/** The bank counters of the room's map. */
const banksOf = (room: PartyRoom): string[] =>
  mapScenesOf(room).flatMap((id) => scenes[id].props.filter((p) => p.kind === 'bank').map((p) => p.id));

/** `act.payRent`: at a bank counter, the whole debt moves to the town, or nothing does. */
export function handlePayRent(room: PartyRoom, seat: string): void {
  const d = duesOf(room);
  if (!room.state.players.get(seat)?.priv) return;
  if (!isVerbPhase(room.state.phase)) return reject(room, seat, ErrorCode.wrongPhase, 'not now');
  if (!nearProp(room, seat, banksOf(room))) return reject(room, seat, ErrorCode.outOfRange, 'no bank here');
  const owed = d.debt.get(seat) ?? 0;
  if (owed === 0) return reject(room, seat, ErrorCode.cannot, 'you owe nothing');
  if (balanceOf(room, seat) < owed) return reject(room, seat, ErrorCode.cannot, 'not enough Scrip');
  if (movePurse(room, seat, TOWN, owed, 'rent') !== owed) return;
  d.debt.delete(seat);
  setIndebted(room, seat, false);
  emitSim(room, { tick: room.state.tick, kind: 'rent.paid', seat, data: { amount: owed } });
}

/** Quota items this seat could hand in at a rack now: 0 outside an open shift, off a quota map, or once it is met. */
export function haulable(room: PartyRoom, seat: string): number {
  const d = duesOf(room);
  const player = room.state.players.get(seat);
  if (!player || !onMap(room, economy.quota.maps)) return 0;
  if (d.shiftRound !== room.state.round || d.settledRound === room.state.round) return 0;
  const left = quotaOf(room, seat) - (d.hauled.get(seat) ?? 0);
  const held = economy.quota.items.reduce((n, item) => n + count(player, item), 0);
  return Math.max(0, Math.min(left, held));
}

/** The end of a rack hold: the quota items it can take leave the pack, any mix, in `quota.items` order. */
export function haul(room: PartyRoom, seat: string): void {
  const player = room.state.players.get(seat);
  let left = haulable(room, seat);
  if (!player || left === 0) return;
  const d = duesOf(room);
  let hauled = d.hauled.get(seat) ?? 0;
  for (const item of economy.quota.items) {
    const n = Math.min(left, count(player, item));
    if (n > 0 && take(player, item, n)) {
      left -= n;
      hauled += n;
    }
  }
  d.hauled.set(seat, hauled);
  if (hauled >= quotaOf(room, seat)) emitSim(room, { tick: room.state.tick, kind: 'quota.met', seat });
}
