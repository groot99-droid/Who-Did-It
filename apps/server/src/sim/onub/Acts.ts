import { onubBalance } from '@wdi/content';
import {
  ErrorCode,
  NightReveal,
  type NightRevealEntry,
  type OnubActLike,
  type OnubWakeView,
  type OnubWindowLike,
  Phase,
  S2C,
  actTargetsProblem,
  applyCardAct,
  parseSlot,
  seatSlot,
  seededTargets,
  wakeView,
} from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { refuse } from '../Flow';
import { type OnubState, onubOf, tableSizeOf } from './state';

// The night acts (GDD 3.11 "The Baking Cycle", ARCHITECTURE 5.14): validation, the card table, the act log and
// the wake view. Everything here runs inside the step (an act arrives through the command queue), and nothing
// public changes with an act: the table, the Cloche and the log are room memory, a waker's reveal is private.

const acts = onubBalance.acts as Readonly<Record<string, OnubActLike | undefined>>;

/** The open window's balance row, or undefined outside a window. */
export function openWindow(o: OnubState): OnubWindowLike | undefined {
  if (o.stage !== 'window') return undefined;
  const w = o.script[o.windowIdx];
  return w && onubBalance.windows.find((row) => row.role === w.role);
}

/** A seat's final Role card: seat `i`'s `seat.<i>.role` slot at dawn. */
export function finalRoles(o: OnubState): Map<string, string> {
  return new Map(o.seats.map((id, i) => [id, o.cards.roles.get(seatSlot(i, 'role')) ?? '']));
}

/** The seat ids behind a reveal's slot (`of`): the seat of a seat slot, empty for the Pantry. */
const seatBehind = (o: OnubState, slot: string): string => {
  const p = parseSlot(slot);
  return p?.owner === 'seat' ? (o.seats[p.index] ?? '') : '';
};

/** Writes `entries` to the seat's `Private.nightReveal` and sends them (an empty list still answers an act). */
export function sendReveal(room: PartyRoom, seatId: string, entries: readonly NightRevealEntry[]): void {
  const priv = room.state.players.get(seatId)?.priv;
  for (const e of entries) {
    const row = new NightReveal();
    row.slot = e.slot;
    row.kind = e.kind;
    row.value = e.value;
    row.of = e.of;
    priv?.nightReveal.push(row);
  }
  room.clients.getById(seatId)?.send(S2C.nightReveal, { entries: [...entries] });
}

/** The view the seat would be sent now (`nightWake.view`); null while it is not awake. */
export function onubWakeView(room: PartyRoom, seatId: string): OnubWakeView | null {
  const o = onubOf(room);
  const window = o && openWindow(o);
  const idx = o ? o.seats.indexOf(seatId) : -1;
  if (!o || !window || idx < 0 || !o.wakers.includes(seatId)) return null;
  return wakeView(
    window,
    idx,
    o.seats.map((id) => o.dealt.get(id) ?? ''),
    o.seats,
    acts,
    tableSizeOf(o),
    o.cloche,
    { acted: o.acted.has(seatId), peeked: o.peeked.get(seatId) ?? '' },
  );
}

/** Sends a waker its current `nightWake` (at the window's opening, and again when its legal acts change). */
export function sendWake(room: PartyRoom, o: OnubState, seatId: string): void {
  const view = onubWakeView(room, seatId);
  if (view)
    room.clients.getById(seatId)?.send(S2C.nightWake, {
      windowRole: o.script[o.windowIdx]?.role ?? '',
      endsTick: o.stageEndsTick,
      view,
    });
}

/**
 * Applies one validated act for `seatId`: the table, the Cloche, the act log and the actor's reveal. A first
 * step (an act with `then`) keeps the peeked slot and leaves the seat awake; any other act closes the seat's
 * turn. `auto` marks an act the server made by seed.
 */
function performAct(
  room: PartyRoom,
  o: OnubState,
  seatId: string,
  act: OnubActLike,
  targets: readonly string[],
  auto: boolean,
): void {
  const actor = o.seats.indexOf(seatId);
  const result = applyCardAct(o.cards, act, actor, targets, o.peeked.get(seatId) ?? '');
  o.cards = result.next;
  if (result.cloche) o.cloche = result.cloche;
  o.actLog.push({
    order: o.script[o.windowIdx]?.order ?? 0,
    roleId: o.script[o.windowIdx]?.role ?? '',
    act: act.id,
    slots: result.logSlots,
    auto,
  });
  if (act.then !== undefined) o.peeked.set(seatId, targets[0] ?? '');
  else {
    o.peeked.delete(seatId);
    o.acted.add(seatId);
  }
  sendReveal(
    room,
    seatId,
    result.reveal.map((r) => ({ ...r, of: seatBehind(o, r.slot) })),
  );
}

/**
 * `act.ability` with a night act id, from `handleOnubAbility`: 425 outside `Phase.night`, outside an open window
 * or for a seat not dealt the window's role; 422 for an act not of this window, `onlyIfAlone` and not alone,
 * `actTargetsProblem` or a second act.
 */
export function handleOnubAct(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const o = onubOf(room);
  if (!o || room.state.phase !== Phase.night || !onubWakeView(room, sessionId)) {
    return refuse(room, sessionId, ErrorCode.wrongPhase, 'not now');
  }
  const id = payload.abilityId;
  const act = typeof id === 'string' ? acts[id] : undefined;
  const targets = payload.targets ?? [];
  if (!act || !Array.isArray(targets) || !targets.every((t): t is string => typeof t === 'string')) {
    return refuse(room, sessionId, ErrorCode.cannot, 'cannot do that');
  }
  // Not an act of this window, `onlyIfAlone` and not alone, already acted, no legal pool: not in the view.
  const view = onubWakeView(room, sessionId);
  if (!view?.legal.some((l) => l.act === act.id)) {
    return refuse(room, sessionId, ErrorCode.cannot, 'cannot do that');
  }
  const problem = actTargetsProblem(
    act,
    o.seats.indexOf(sessionId),
    tableSizeOf(o),
    o.cloche,
    targets,
    o.peeked.get(sessionId) ?? '',
  );
  if (problem) return refuse(room, sessionId, ErrorCode.cannot, 'cannot do that');
  performAct(room, o, sessionId, act, targets, false);
  sendWake(room, o, sessionId); // the Tourrier's second step, and `legal` emptied once the seat has acted
}

/**
 * The window is closing: every waker of a must-act window that has not finished it gets the act made by seed
 * (the `nightTimeout` stream), reveal included; an act that cannot be made at all (the seat's own card is
 * under the Cloche) is skipped.
 */
export function completeMustActs(room: PartyRoom, o: OnubState): void {
  const window = openWindow(o);
  if (window?.onTimeout !== 'seededPick') return;
  const rng = room.seeds.get('nightTimeout');
  for (const seatId of o.wakers) {
    for (let step = 0; step < 3 && !o.acted.has(seatId); step++) {
      const next = onubWakeView(room, seatId)?.legal[0];
      const act = next && acts[next.act];
      if (!act) break;
      const picks = seededTargets(act, o.seats.indexOf(seatId), tableSizeOf(o), o.cloche, rng);
      if (!picks) break;
      performAct(room, o, seatId, act, picks, true);
    }
  }
}
