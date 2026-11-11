import { abilities, balance, economy, roles } from '@wdi/content';
import { Phase, S2C, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { emitSim, onSim } from '../events/bus';
import { bellOf, hubOf } from '../MapSites';
import { type PlayerSim, simOf } from '../RoomSim';
import { reject, sceneKey, tileCentre } from '../World';
import { checkPeaceful, resetPeaceful } from '../routes/peaceful';

/**
 * Conversion (story I9, GDD 3.23, DECISIONS A606; round 10 scope I9, 2.2). A seat is **converted** once its private
 * Faith reaches `conversion.faithAt`; it stays converted for the match, whatever it spends later. Faith comes from the
 * altar, the cot (`SleepRest.ts`) and the sermon below, so the check runs every tick over every seat.
 *
 * **The sermon.** `act.hold { action: 'sermon', targetId: 'bell' }`: a seat in the Vicar's public look, by day, on the
 * hub within the bell's reach, preaches for `conversion.sermonS`, standing still, and may preach again `conversion.sermonCooldownS` after a sermon
 * ends (owner, 2026-11-11). Moving, leaving the day
 * or dying ends it with nothing. Every other living seat within `conversion.sermonTiles` of the bell for at least
 * `conversion.listenS` of it gains `conversion.sermonFaith`, once a day. The Faith follows the **look**, like the
 * martyr (A600 R-Q3): a listener's own Faith is its private view, so a sermon that gave nothing under a cover would
 * tell every listener the preacher wears one. The dealt card owns only what nobody else sees: the converted count
 * (`Private.converted`) and the Peaceful route (`routes/peaceful.ts`).
 *
 * Nothing is public: no seat learns another's Faith or conversion. A converted seat is told so (`S2C.conversion
 * {kind: 'converted'}`), the preacher how many heard (`{kind: 'sermon', heard}`, a count). Room memory only.
 */
export const SERMON_HOLD = 'sermon';
const VICAR_LOOK = roles.roles.vicar?.look ?? null;

interface ConversionMemory {
  /** The seats converted this match. */
  converted: Set<string>;
  /** The day counter (one more at every day phase), for the listener's once-a-day rule. */
  day: number;
  /** The tick each seat's last sermon ended on (preached to its end), for the cooldown. */
  preached: Map<string, number>;
  /** The day each seat last gained a sermon's Faith. */
  heard: Map<string, number>;
  /** The sermon under way: the ticks each seat has stood within range of the bell so far. */
  listening: Map<string, number>;
}

const memories = new WeakMap<PartyRoom, ConversionMemory>();

function memoryOf(room: PartyRoom): ConversionMemory {
  let memory = memories.get(room);
  if (memory) return memory;
  const m: ConversionMemory = {
    converted: new Set(),
    day: 0,
    preached: new Map(),
    heard: new Map(),
    listening: new Map(),
  };
  memories.set(room, (memory = m));
  onSim(room, 'start', () => {
    m.converted.clear();
    m.day = 0;
    m.preached.clear();
    m.heard.clear();
    m.listening.clear();
    resetPeaceful(room);
  });
  onSim(room, 'phase', (e) => {
    if (e.data?.to === Phase.day) m.day++;
  });
  return memory;
}

/** Whether `seat` is converted this match (R6's aura and the Peaceful route read it). */
export const isConverted = (room: PartyRoom, seat: string): boolean =>
  memories.get(room)?.converted.has(seat) ?? false;

/** Adds Faith to `seat`, capped at `faith.max` (the sermon's gain, and R6's aura). The tick's check converts. */
export function addFaith(room: PartyRoom, seat: string, amount: number): void {
  const priv = room.state.players.get(seat)?.priv;
  if (priv && amount > 0) priv.faith = Math.min(economy.faith.max, priv.faith + Math.floor(amount));
}

/** The dealt Vicar's seat, or null when no seat holds the card. */
export function dealtVicarOf(room: PartyRoom): string | null {
  for (const [id, player] of room.state.players) if (player.priv?.role.roleId === 'vicar') return id;
  return null;
}

const inMatch = (phase: number) => phase !== Phase.lobby && phase !== Phase.gameOver;

/** Every tick (from `runMemorial`): new conversions, the Vicar's count, the Peaceful route, a sermon under way. */
export function runConversion(room: PartyRoom): void {
  const memory = memoryOf(room);
  if (!inMatch(room.state.phase)) return;
  const vicar = dealtVicarOf(room);
  for (const [id, player] of room.state.players) {
    const priv = player.priv;
    if (!priv || memory.converted.has(id) || id === vicar || priv.faith < balance.conversion.faithAt)
      continue;
    memory.converted.add(id);
    room.clients.getById(id)?.send(S2C.conversion, { kind: 'converted' });
  }
  const vicarPriv = vicar === null ? undefined : room.state.players.get(vicar)?.priv;
  if (vicarPriv && vicarPriv.converted !== Math.min(255, memory.converted.size))
    vicarPriv.converted = Math.min(255, memory.converted.size);
  if (vicar !== null) checkPeaceful(room, vicar, memory.converted);
  runSermon(room, memory);
}

/** Whether `p` stands on the hub within `tiles` of the bell. */
function nearBell(room: PartyRoom, p: PlayerSim, tiles: number): boolean {
  const bell = bellOf(room);
  if (!bell || sceneKey(p.sceneIdx) !== hubOf(room)) return false;
  return Math.hypot(p.x - tileCentre(bell.x, TILE_PX), p.y - tileCentre(bell.y, TILE_PX)) <= tiles * TILE_PX;
}

const bellReach = () => abilities.abilities.bell?.rangeTiles ?? 0;

/** `act.hold { action: 'sermon' }` (`Hold.ts`, inside the step): a seat in the Vicar's look begins a sermon. */
export function handleSermonHold(room: PartyRoom, seat: string): void {
  const memory = memoryOf(room);
  const player = room.state.players.get(seat);
  const p = simOf(room).players.get(seat);
  if (!player || !p) return;
  if (VICAR_LOOK === null || player.look !== VICAR_LOOK) return reject(room, seat, 'NOT_YOUR_POWER');
  if (room.state.phase !== Phase.day) return reject(room, seat, 'PHASE_CLOSED');
  if (p.dead || !p.placed) return reject(room, seat, 'NOT_IN_PLAY');
  if (room.state.tick < p.busyUntilTick) return reject(room, seat, 'BUSY');
  if (!nearBell(room, p, bellReach())) return reject(room, seat, 'TOO_FAR', { of: 'bell' });
  const last = memory.preached.get(seat);
  if (
    last !== undefined &&
    room.state.tick - last < Math.round(balance.conversion.sermonCooldownS * TICK_RATE)
  )
    return reject(room, seat, 'COOLDOWN');
  if (p.hold?.action === SERMON_HOLD) return;
  p.hold = { action: SERMON_HOLD, targetId: 'bell', startTick: room.state.tick };
  memory.listening.clear();
  emitSim(room, {
    tick: room.state.tick,
    kind: 'sermon',
    sceneId: hubOf(room),
    data: { sceneId: hubOf(room) },
  });
}

/** The sermon under way, if any: listeners count their ticks; the end pays them; a broken sermon pays nothing. */
function runSermon(room: PartyRoom, memory: ConversionMemory): void {
  const players = simOf(room).players;
  const preaching = [...players].find(([, p]) => p.hold?.action === SERMON_HOLD);
  if (!preaching) return;
  const [seat, p] = preaching;
  if (
    room.state.phase !== Phase.day ||
    p.dead ||
    !p.placed ||
    p.vx !== 0 ||
    p.vy !== 0 ||
    !nearBell(room, p, bellReach())
  ) {
    p.hold = null;
    memory.listening.clear();
    return;
  }
  for (const [id, other] of players) {
    if (id === seat || other.dead || !other.placed) continue;
    if (nearBell(room, other, balance.conversion.sermonTiles))
      memory.listening.set(id, (memory.listening.get(id) ?? 0) + 1);
  }
  if (room.state.tick - p.hold!.startTick < Math.round(balance.conversion.sermonS * TICK_RATE)) return;
  p.hold = null;
  memory.preached.set(seat, room.state.tick);
  const need = Math.round(balance.conversion.listenS * TICK_RATE);
  let heard = 0;
  for (const [id, ticks] of memory.listening) {
    if (ticks < need || memory.heard.get(id) === memory.day) continue;
    memory.heard.set(id, memory.day);
    addFaith(room, id, balance.conversion.sermonFaith);
    heard++;
  }
  memory.listening.clear();
  room.clients.getById(seat)?.send(S2C.conversion, { kind: 'sermon', heard });
}
