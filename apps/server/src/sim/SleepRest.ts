import { abilities, balance, economy, roles } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { applyEffect, cureEffect } from './body/effects';
import { bodies, bodyOf } from './body/state';
import { emitSim } from './events/bus';
import { onManhunt } from './law/Manhunt';

/**
 * What a night's sleep gives and what staying up costs (round 10, A7b, GDD 3.32; docs/round9/world-mode.md 7.3,
 * followup-4.md 2.11). `sim/Sleep.ts` calls in twice a tick: `trackHoldout` while the night runs, and
 * `onSleepPhase` when the phase changes, before it wakes the sleepers.
 *
 * - At the dawn that ends a night (night to day), each seat still asleep is restored by its bed: `sleep.restore` of
 *   its maximum stamina (never lowering it); the tavern bed also cures `sleep.innBedCures`; the chapel cot gives
 *   `sleep.cotFaith` Faith unless the chapel bars the seat. Waking in the night restores nothing.
 * - The last active player awake, alone for `sleep.holdoutGraceS` while the rest sleep, is Exhausted from that
 *   dawn to the next dusk (maximum stamina and its regeneration halved, `effects.json`). A card with a night power
 *   or a seat on a manhunt is never marked (F4 c8). The check reads the card on the server only; the effect lives
 *   in the private body, with no status bit, so nothing public tells an exempt holdout from a marked one.
 */

export type RestKind = 'bed' | 'cot' | 'innBed';

interface Rest {
  /** The seat alone awake and the tick it became so, or '' and -1. */
  holdout: string;
  since: number;
  /** Seats Exhausted at the coming dawn. */
  marked: Set<string>;
}

const memory = new WeakMap<object, Rest>();
function restOf(room: PartyRoom): Rest {
  let m = memory.get(room.seeds);
  if (!m) memory.set(room.seeds, (m = { holdout: '', since: -1, marked: new Set() }));
  return m;
}

/** Not built yet (the Defrocked sentence): no seat is barred from the chapel. */
const chapelBarred = (_room: PartyRoom, _seat: string): boolean => false;

/** A card holding a power usable in the night phase (`abilities.json` `phases`, the gate of `NightPowers.ts`). */
function hasNightPower(room: PartyRoom, seat: string): boolean {
  const roleId = room.state.players.get(seat)?.priv?.role.roleId;
  const card = roleId ? roles.roles[roleId] : undefined;
  return (card?.abilities ?? []).some((a) =>
    (abilities.abilities[a]?.phases as readonly string[] | undefined)?.includes('night'),
  );
}

/** In the night: marks the one active seat left awake once it has been alone for the grace. */
export function trackHoldout(room: PartyRoom, active: readonly string[], asleep: ReadonlySet<string>): void {
  const m = restOf(room);
  const awake = active.filter((s) => !asleep.has(s));
  const tick = room.state.tick;
  if (room.state.phase !== Phase.night || active.length < 2 || awake.length !== 1) {
    m.holdout = '';
    m.since = -1;
    return;
  }
  const seat = awake[0]!;
  if (m.holdout !== seat) {
    m.holdout = seat;
    m.since = tick;
  } else if (tick - m.since >= Math.round(balance.sleep.holdoutGraceS * TICK_RATE)) {
    if (!hasNightPower(room, seat) && !onManhunt(room, seat)) m.marked.add(seat);
  }
}

/** A phase change: the dawn restores the sleepers and Exhausts the marked; the dusk cures Exhausted. */
export function onSleepPhase(
  room: PartyRoom,
  was: number,
  now: number,
  sleepers: ReadonlyMap<string, RestKind>,
) {
  const m = restOf(room);
  if (was === Phase.night && now === Phase.day) {
    for (const [seat, kind] of sleepers) rest(room, seat, kind);
    for (const seat of m.marked) {
      const body = bodyOf(room, seat);
      if (body && !body.figure) applyEffect(room, seat, body, 'exhausted');
    }
    m.marked.clear();
  }
  if (now === Phase.dusk) {
    m.marked.clear();
    for (const [id, body] of bodies(room)) cureEffect(room, id, body, 'exhausted');
  }
}

function rest(room: PartyRoom, seat: string, kind: RestKind): void {
  const body = bodyOf(room, seat);
  if (!body || body.figure) return;
  const s = balance.sleep;
  body.stamina = Math.max(body.stamina, body.maxStamina * s.restore[kind]);
  if (kind === 'innBed') {
    for (const id of s.innBedCures) cureEffect(room, seat, body, id);
    if (s.innBedCures.includes('famished')) body.lastAteTick = room.state.tick; // or Famished comes straight back
  }
  const priv = room.state.players.get(seat)?.priv;
  if (kind === 'cot' && priv && !chapelBarred(room, seat)) {
    priv.faith = Math.min(economy.faith.max, priv.faith + s.cotFaith);
  }
  emitSim(room, { tick: room.state.tick, kind: 'sleep.rest', seat, data: { seat, kind } });
}
