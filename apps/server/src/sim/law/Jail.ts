import { balance, type SceneId } from '@wdi/content';
import { Phase, S2C, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { avatarMemory } from '../Avatars';
import { emitSim, onSim } from '../events/bus';
import { meetingSpawnsOf, stationOf } from '../MapSites';
import { enterScene } from '../Portals';
import { simOf } from '../RoomSim';
import { trainReturnLine } from '../Train';

/**
 * The county jail (round 10, B5b; GDD 3.27, `world-mode.md` 5.1; seams.md 3 row 19; A349). A seat the manhunt cuffs
 * walks for `jail.walkS` and is placed in the cell (`cj_cell`, B5a), which no portal leaves. It stays there until the
 * next morning train (the first arrival of a later round), which sets it down at the station with the manifest line,
 * or until it dies. On a map with no station (BlackPine) the first dawn of a later round sets it down at the map's
 * meeting spawns instead, with no line (6Z's default). `Private.jailUntilTick` (own view) is the releasing tick, 0 when
 * not jailed. A jailed seat is not active for sleep, cannot open, sign or cuff, and cannot use the Knife (`IN_JAIL`); a
 * meeting does not move it (`Meeting.ts placeAtSquare`).
 *
 * The pin (owner, 2026-10-30, "jail and try them"; 6Z's ruling A): an impersonation applied at the cuff stays on the
 * figure from the cuff until the seat leaves jail or dies. `Impersonate.ts` skips a pinned seat (no expiry, no alone
 * drop, no door drop, no meeting drop), so the cell, the Tribunal and the manifest draw and name the face it was
 * cuffed in, exactly as if the accused had been cuffed. A disguise still pending at the cuff is cancelled. At the
 * release the seat is set down while still pinned and only then unpinned; the usual rule applies after that.
 */

export const CELL: SceneId = 'cj_cell';

interface Held {
  /** The round the seat was cuffed in: a train of a later round releases it. */
  round: number;
  /** The tick the walk ends and the seat is placed in the cell; -1 once placed. */
  placeAt: number;
  /** The seat whose face it was cuffed in (itself, or the seat it impersonated): the manifest names it. */
  face: string;
  pinned: boolean;
}

interface JailMemory {
  held: Map<string, Held>;
}

const memories = new WeakMap<PartyRoom, JailMemory>();
function memoryOf(room: PartyRoom): JailMemory {
  const memory = memories.get(room);
  if (memory) return memory;
  const m: JailMemory = { held: new Map() };
  memories.set(room, m);
  onSim(room, 'train.arrive', (e) => {
    const round = typeof e.data?.round === 'number' ? e.data.round : room.state.round;
    for (const [seat, held] of [...m.held]) if (held.round < round) release(room, m, seat);
  });
  return m;
}

/** Whether a seat is in the county jail, or on its way there after a cuff. */
export const isJailed = (room: PartyRoom, seat: string): boolean => memoryOf(room).held.has(seat);

/** Whether a seat's impersonation is pinned (`Impersonate.ts` leaves it alone). */
export const isPinned = (room: PartyRoom, seat: string): boolean =>
  memoryOf(room).held.get(seat)?.pinned === true;

/** Whether a jailed seat has been placed in the cell (its walk is over): B6a's Tribunal opens then. */
export const inCell = (room: PartyRoom, seat: string): boolean =>
  memoryOf(room).held.get(seat)?.placeAt === -1;

/** B6a: a dismissal or a paid fine releases the seat at the Tribunal's Return, onto the square, with no line. */
export function releaseToSquare(room: PartyRoom, seat: string): void {
  const m = memoryOf(room);
  if (m.held.has(seat)) release(room, m, seat, true);
}

/** B6a: the paused world resumed after a Tribunal, so every held seat's release tick moves by the pause. */
export function rescheduleReleases(room: PartyRoom): void {
  for (const seat of memoryOf(room).held.keys()) {
    const priv = room.state.players.get(seat)?.priv;
    if (priv) priv.jailUntilTick = nextReleaseTick(room);
  }
}

/** The seconds until the releasing train, for `IN_JAIL {untilDawn}`. */
export const untilDawnS = (room: PartyRoom, seat: string): number =>
  Math.max(
    1,
    Math.ceil(((room.state.players.get(seat)?.priv.jailUntilTick ?? 0) - room.state.tick) / TICK_RATE),
  );

/**
 * The tick of the release: the next morning train, or the next dawn on a map with no station. From the phase clock (a
 * meeting may move it; the day start corrects it).
 */
function nextReleaseTick(room: PartyRoom): number {
  const p = balance.phases;
  const after =
    room.state.phase === Phase.day ? p.duskS + p.nightS : room.state.phase === Phase.dusk ? p.nightS : 0;
  const train = stationOf(room) ? balance.train.arriveAtS : 0;
  return room.state.phaseEndsTick + Math.round((after + train) * TICK_RATE);
}

/** A cuff lands (`Manhunt.ts`): the seat is held for the walk, its applied disguise pinned, a pending one cancelled. */
export function jailSeat(room: PartyRoom, seat: string, face: string): void {
  const m = memoryOf(room);
  const p = simOf(room).players.get(seat);
  const player = room.state.players.get(seat);
  if (!p || !player || m.held.has(seat)) return;
  const tick = room.state.tick;
  const disguise = avatarMemory(room).disguise.get(seat);
  if (disguise && !disguise.applied) avatarMemory(room).disguise.delete(seat);
  const placeAt = tick + Math.round(balance.jail.walkS * TICK_RATE);
  m.held.set(seat, { round: room.state.round, placeAt, face, pinned: disguise?.applied === true });
  p.hold = null;
  p.input = null;
  p.busyUntilTick = placeAt;
  player.priv.jailUntilTick = nextReleaseTick(room);
}

/**
 * Sets the seat down at the station with the manifest line, or at the map's meeting spawns with no line where no
 * station is, then unpins it.
 */
function release(room: PartyRoom, m: JailMemory, seat: string, toSquare = false): void {
  const held = m.held.get(seat);
  const p = simOf(room).players.get(seat);
  const player = room.state.players.get(seat);
  const station = toSquare ? undefined : stationOf(room);
  m.held.delete(seat);
  if (!held || !p || !player) return;
  player.priv.jailUntilTick = 0;
  p.busyUntilTick = room.state.tick;
  if (p.dead) return;
  const spread = meetingSpawnsOf(room);
  const site = station ?? spread[p.ordinal % spread.length]!;
  // Set down while still pinned: the figure that steps off the train is the face the manifest names. A refused entry
  // (none is expected: the site is a spawn of the map) leaves the seat where it is, out of jail.
  m.held.set(seat, held);
  enterScene(room, player, p, site.sceneId, site.spawn, false);
  m.held.delete(seat);
  emitSim(room, { tick: room.state.tick, kind: 'jail.release', seat, sceneId: site.sceneId });
  if (!station) return;
  const name = room.state.players.get(held.face)?.name ?? player.name;
  for (const client of room.clients) {
    client.send(S2C.chatMsg, { from: '', text: trainReturnLine(name), channel: 'system' });
  }
}

/** The jail's tick (inside `runLaw`): the walk into the cell, a death, the day's exact train tick, the Final Night. */
export function runJail(room: PartyRoom): void {
  const m = memoryOf(room);
  if (room.state.phase === Phase.lobby) {
    for (const seat of m.held.keys()) {
      const priv = room.state.players.get(seat)?.priv;
      if (priv) priv.jailUntilTick = 0;
    }
    m.held.clear();
    return;
  }
  if (m.held.size === 0) return;
  const tick = room.state.tick;
  const sim = simOf(room);
  for (const [seat, held] of [...m.held]) {
    const p = sim.players.get(seat);
    const player = room.state.players.get(seat);
    if (!p || !player || p.dead) {
      // A death in jail takes the usual death path; the pin and the hold end with it.
      m.held.delete(seat);
      if (player) player.priv.jailUntilTick = 0;
      if (p) p.busyUntilTick = Math.min(p.busyUntilTick, tick); // a ghost walks free, mid-walk too
      continue;
    }
    if (room.state.phase === Phase.finalNight) {
      release(room, m, seat); // the Final Night's bells empty the cell, as they bring back the line
      continue;
    }
    const station = stationOf(room);
    if (!station && room.state.phase === Phase.day && held.round < room.state.round) {
      release(room, m, seat); // no train on this map: the first dawn of a later round lets it out
      continue;
    }
    if (held.placeAt >= 0 && tick >= held.placeAt) {
      const others = [...m.held.values()].filter((h) => h !== held && h.placeAt < 0).length;
      if (enterScene(room, player, p, CELL, `cell_${(others % 10) + 1}`, false)) held.placeAt = -1;
    }
    // The day's train tick is known once the day starts.
    if (station && room.state.phase === Phase.day && held.round < room.state.round) {
      const exact =
        room.state.phaseEndsTick - Math.round((balance.phases.dayS - balance.train.arriveAtS) * TICK_RATE);
      if (player.priv.jailUntilTick !== exact) player.priv.jailUntilTick = exact;
    }
  }
}
