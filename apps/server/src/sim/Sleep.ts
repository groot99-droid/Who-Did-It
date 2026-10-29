import { balance, scenes, type SceneId } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { isIndebted } from './economy/rent';
import { balanceOf, movePurse, TOWN } from './economy/purse';
import { nearProp } from './economy/reach';
import { emitSim, onSim } from './events/bus';
import { mapScenesOf } from './MapSites';
import { isNpcSeat } from './Npc';
import { npcMemory } from './npc/memory';
import { litAtNight, profileOfRoom } from './npc/routine';
import { sendRefusal } from './refusal';
import { simOf } from './RoomSim';
import { profileOpen, sceneKey } from './World';
import { isOnLine } from './Train';

/**
 * Sleeping (round 10, A7, GDD 3.32; docs/round9/world-mode.md 7.3). A seat lies down with `act.hold {action:
 * 'sleep', targetId: <bed prop>}` at dusk or night: its own home's `bed` (not while its house is boarded), the
 * chapel's `cot` (free) or the tavern's `innBed` (`sleep.innBedScrip` from the purse). Any gameplay input or a hit
 * wakes it, and the input itself is refused `ASLEEP`, silently. When every active player has been asleep for
 * `sleep.confirmS` of the night, the night ends through the normal dawn (`phaseEndsTick`, `Phases.ts`).
 *
 * Active means a living, placed, connected human; an NPC seat never counts, so nothing waits on one. The jail (B5)
 * is not built yet, so `inJail` says no; `onTheLine` is C1's `isOnLine` (a seat waiting for the morning train).
 * Homes and sleepers are room memory keyed by the match's `MatchSeeds`; the homes draw only from the `homes` stream.
 */

export const BED_KINDS = ['bed', 'cot', 'innBed'] as const;
type BedKind = (typeof BED_KINDS)[number];

interface Sleepers {
  homes: Map<string, SceneId>;
  drawn: boolean;
  /** Sleeping seats and the bed each lies in. */
  asleep: Map<string, string>;
  /** The tick from which every active player has been asleep, or -1. */
  allSinceTick: number;
}

const memory = new WeakMap<object, Sleepers>();
function sleepersOf(room: PartyRoom): Sleepers {
  let m = memory.get(room.seeds);
  if (!m) {
    m = { homes: new Map(), drawn: false, asleep: new Map(), allSinceTick: -1 };
    memory.set(room.seeds, m);
  }
  return m;
}

const subscribed = new WeakSet<PartyRoom>();

/** Not built yet (B5): no seat is in the county jail. */
const inJail = (_room: PartyRoom, _seat: string): boolean => false;
/** Not built yet (the respawn step): no seat is on the line. */
const onTheLine = (room: PartyRoom, seat: string): boolean => isOnLine(room, seat); // round 10, C1

const LIE_DOWN = new Set<number>([Phase.dusk, Phase.night]);

const hasBed = (s: SceneId) => scenes[s].props.some((p) => p.kind === 'bed');

/**
 * Each human seat's home, once per match, in seat order: an interior an NPC could call home (GDD 3.12) that has a
 * `bed`, distinct from the NPC homes and from each other while the map has enough, then shared. Never the card.
 */
function drawHomes(room: PartyRoom, m: Sleepers): void {
  m.drawn = true;
  const profile = profileOfRoom(room);
  const pool = mapScenesOf(room).filter(
    (s) =>
      scenes[s].kind === 'interior' && profileOpen(scenes[s].profile, profile) && litAtNight(s) && hasBed(s),
  );
  const taken = new Set<SceneId>();
  for (const brain of npcMemory(room).brains.values()) if (brain.persona?.home) taken.add(brain.persona.home);
  const rng = room.seeds.get('homes');
  for (const [id, player] of room.state.players) {
    if (isNpcSeat(room, id) || !player.priv) continue;
    const u = rng(); // one draw per seat, whatever the pool holds
    const free = pool.filter((s) => !taken.has(s));
    const from = free.length > 0 ? free : pool;
    const home = from[Math.min(from.length - 1, Math.floor(u * from.length))];
    if (!home) continue;
    taken.add(home);
    m.homes.set(id, home);
    player.priv.home = home;
  }
}

/** Living, placed, connected humans outside the jail and off the line (owner answer NW1). */
export function activeSeats(room: PartyRoom): string[] {
  const sim = simOf(room);
  const out: string[] = [];
  for (const [id, player] of room.state.players) {
    const p = sim.players.get(id);
    if (!p || p.dead || !p.placed || !player.connected || isNpcSeat(room, id)) continue;
    if (inJail(room, id) || onTheLine(room, id)) continue;
    out.push(id);
  }
  return out;
}

export function isAsleep(room: PartyRoom, seat: string): boolean {
  return sleepersOf(room).asleep.has(seat);
}

/** Wakes `seat` if it sleeps; true when it did. */
export function wake(room: PartyRoom, seat: string, why: string): boolean {
  const m = sleepersOf(room);
  if (!m.asleep.delete(seat)) return false;
  const priv = room.state.players.get(seat)?.priv;
  if (priv) {
    priv.asleep = false;
    priv.inBed = 0;
    priv.inBedOf = 0;
  }
  emitSim(room, { tick: room.state.tick, kind: 'sleep.wake', seat, data: { seat, why } });
  return true;
}

/**
 * A sleeper's input (Movement.ts, Commands.ts): it wakes the seat and is itself refused `ASLEEP` (silent), so the
 * first key press wakes rather than acts. True when the input was a sleeper's and is consumed.
 */
export function wakeOnInput(room: PartyRoom, seat: string, refuse: boolean): boolean {
  if (!wake(room, seat, 'input')) return false;
  if (refuse) sendRefusal(room, seat, 'ASLEEP');
  return true;
}

/** `act.hold {action: 'sleep', targetId}`: lie down in the bed `targetId`, in the own scene and within reach. */
export function handleSleepHold(room: PartyRoom, seat: string, targetId: unknown): void {
  const p = simOf(room).players.get(seat);
  const player = room.state.players.get(seat);
  if (!p || !player?.priv) return;
  if (typeof targetId !== 'string' || targetId.length === 0 || targetId.length > 64) {
    return sendRefusal(room, seat, 'BAD_REQUEST');
  }
  if (p.dead || !p.placed) return sendRefusal(room, seat, 'NOT_IN_PLAY');
  if (!LIE_DOWN.has(room.state.phase)) return sendRefusal(room, seat, 'PHASE_CLOSED', { until: 'dusk' });
  const m = sleepersOf(room);
  if (m.asleep.has(seat)) return;
  const scene = sceneKey(p.sceneIdx);
  const bed = scenes[scene]?.props.find((q) => q.id === targetId);
  if (!bed || !(BED_KINDS as readonly string[]).includes(bed.kind))
    return sendRefusal(room, seat, 'NOTHING_THERE');
  if (!nearProp(room, seat, [bed.id])) return sendRefusal(room, seat, 'TOO_FAR');
  const kind = bed.kind as BedKind;
  if (kind === 'bed') {
    if (m.homes.get(seat) !== scene) return sendRefusal(room, seat, 'NO_BED');
    if (isIndebted(room, seat)) return sendRefusal(room, seat, 'BOARDED_HOME'); // D7 boards the house itself
  }
  if (kind === 'innBed') {
    const price = balance.sleep.innBedScrip;
    const short = price - balanceOf(room, seat);
    if (short > 0) return sendRefusal(room, seat, 'NEED_SCRIP', { short });
    if (price > 0) movePurse(room, seat, TOWN, price, 'buy');
  }
  p.hold = null;
  p.input = null;
  m.asleep.set(seat, bed.id);
  player.priv.asleep = true;
  emitSim(room, { tick: room.state.tick, kind: 'sleep.lieDown', seat, data: { seat, bed: bed.id, kind } });
}

/**
 * Once a tick from `runPhases`, before the phase clock: draws the homes, drops sleepers who died, left or saw their
 * night end, and ends the night when every active player has slept `sleep.confirmS` of it.
 */
export function runSleep(room: PartyRoom): void {
  const m = sleepersOf(room);
  if (!subscribed.has(room)) {
    subscribed.add(room);
    onSim(room, 'body.hit', (e, r) => {
      if (typeof e.seat === 'string') wake(r, e.seat, 'hit'); // after the damage lands (damage.ts)
    });
  }
  if (!m.drawn) drawHomes(room, m);
  const state = room.state;
  const active = activeSeats(room);
  const open = LIE_DOWN.has(state.phase);
  for (const seat of [...m.asleep.keys()]) {
    if (!open || !active.includes(seat)) wake(room, seat, open ? 'gone' : 'dawn');
  }
  const inBed = active.filter((s) => m.asleep.has(s)).length;
  for (const seat of m.asleep.keys()) {
    const priv = state.players.get(seat)?.priv;
    if (!priv) continue;
    priv.inBed = Math.min(255, inBed);
    priv.inBedOf = Math.min(255, active.length);
  }
  const everyone = state.phase === Phase.night && active.length > 0 && inBed === active.length;
  if (!everyone) {
    m.allSinceTick = -1;
    return;
  }
  if (m.allSinceTick < 0) m.allSinceTick = state.tick;
  if (state.tick - m.allSinceTick < balance.sleep.confirmS * TICK_RATE) return;
  m.allSinceTick = -1;
  emitSim(room, { tick: state.tick, kind: 'sleep.skip', data: { sleepers: active.length } });
  state.phaseEndsTick = state.tick; // the normal dawn runs on this tick (`advanceWorldPhase`)
}
