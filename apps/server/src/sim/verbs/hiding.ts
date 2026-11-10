import { abilities, balance, clues as clueDefs, roles, scenes, type SceneId } from '@wdi/content';
import { ClueKind, NotebookEntry, NotebookStatus, NoteKind, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { avatarMemory, avatarOf } from '../Avatars';
import { decaySeconds, spawnClue } from '../Clues';
import { applyEffect } from '../body/effects';
import { bodyOf } from '../body/state';
import { count } from '../Inventory';
import { emitNoise } from '../Noise';
import { type PlayerSim, type RoomSim, simOf } from '../RoomSim';
import { isVerbPhase, isWorldPhase, reject, sceneKey } from '../World';

// Round 10, V3 (10V; GDD 3.2 and 3.7): the hiding spots (Hide, Check, Burst Out) and the three small kit verbs
// (Chalk, Act Shifty, Fake Blood). Who is in which spot lives in room memory; the only wire is `Private.hiding`
// (the hider's own client), the hider's Notebook entry (`NoteKind.checked`) and the chalk clue (seams.md 3, row 39).

export const HIDE_HOLD = 'hide';
export const CHECK_HOLD = 'check';

interface Hiding {
  /** seat -> the spot id it is in. */
  readonly bySeat: Map<string, string>;
  /** spot id -> the seat in it. */
  readonly bySpot: Map<string, string>;
  /** Seats that spent their Fake Blood (once per match). */
  readonly bloodSpent: Set<string>;
}
const memory = new WeakMap<RoomSim, Hiding>();
const hidingOf = (room: PartyRoom): Hiding => {
  const sim = simOf(room);
  let m = memory.get(sim);
  if (!m) memory.set(sim, (m = { bySeat: new Map(), bySpot: new Map(), bloodSpent: new Set() }));
  return m;
};

const hasAbility = (room: PartyRoom, seat: string, id: string): boolean =>
  roles.roles[room.state.players.get(seat)?.priv.role.roleId ?? '']?.abilities.includes(id) === true;

/** Whether the seat is in a spot: its avatar is in no other view and it does not walk. */
export const isHiding = (room: PartyRoom, seat: string): boolean => hidingOf(room).bySeat.has(seat);

const ticks = (s: number): number => Math.round(s * TICK_RATE);

/** The `hide`-kind spot `id` in the seat's scene, or undefined. */
function spotIn(p: PlayerSim, id: unknown) {
  if (typeof id !== 'string' || id.length === 0 || id.length > 64) return undefined;
  const scene = scenes[sceneKey(p.sceneIdx) as SceneId];
  return scene?.spots.find((s) => s.id === id && s.kind === 'hide');
}

const nearSpot = (p: PlayerSim, s: { x: number; y: number }): boolean =>
  Math.hypot(p.x - (s.x + 0.5) * TILE_PX, p.y - (s.y + 0.5) * TILE_PX) <= balance.doors.reachTiles * TILE_PX;

function actor(room: PartyRoom, seat: string): PlayerSim | null {
  const p = simOf(room).players.get(seat);
  const player = room.state.players.get(seat);
  if (!p || !player) return null;
  if (p.dead || !p.placed) return (void reject(room, seat, 'NOT_IN_PLAY'), null);
  if (!isVerbPhase(room.state.phase)) return (void reject(room, seat, 'PHASE_CLOSED'), null);
  if (room.state.tick < p.busyUntilTick) return (void reject(room, seat, 'BUSY'), null);
  const body = bodyOf(room, seat);
  if (body && [...body.effects.keys()].includes('stunned'))
    return (void reject(room, seat, 'DOWN_OR_STUNNED'), null);
  return p;
}

function release(room: PartyRoom, seat: string): void {
  const m = hidingOf(room);
  const spot = m.bySeat.get(seat);
  if (spot === undefined) return;
  m.bySeat.delete(seat);
  m.bySpot.delete(spot);
  const player = room.state.players.get(seat);
  if (player?.priv) player.priv.hiding = '';
  simOf(room).viewsDirty = true; // the figure is in the scene's views again
}

/** `act.hide {spotId}`: starts entering a free spot (a hold of `castS`; the Child's Silent hide takes none). */
export function handleHide(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const p = actor(room, seat);
  if (!p) return;
  if (isHiding(room, seat)) return reject(room, seat, 'ALREADY_DONE');
  const spot = spotIn(p, payload.spotId);
  if (!spot) return reject(room, seat, 'NOTHING_THERE');
  const silent = hasAbility(room, seat, 'silentHide');
  if (spot.childOnly && !silent) return reject(room, seat, 'NOTHING_THERE');
  if (!nearSpot(p, spot)) return reject(room, seat, 'TOO_FAR', { of: 'door' });
  if (hidingOf(room).bySpot.has(spot.id)) return reject(room, seat, 'BUSY');
  p.hold = { action: HIDE_HOLD, targetId: spot.id, startTick: room.state.tick };
  if (silent) tickHide(room, seat, p);
}

/** Call site: `runHolds`. At `castS` the seat is in the spot; moving or a lost spot cancels. */
export function tickHide(room: PartyRoom, seat: string, p: PlayerSim): void {
  const hold = p.hold;
  if (!hold) return;
  const spot = spotIn(p, hold.targetId);
  const m = hidingOf(room);
  if (
    !spot ||
    p.dead ||
    !isVerbPhase(room.state.phase) ||
    p.vx !== 0 ||
    p.vy !== 0 ||
    m.bySpot.has(spot.id)
  ) {
    p.hold = null;
    return;
  }
  const silent = hasAbility(room, seat, 'silentHide');
  const castS = silent
    ? (abilities.abilities.silentHide?.castS ?? 0)
    : (abilities.abilities.hide?.castS ?? 0);
  if (room.state.tick - hold.startTick < ticks(castS)) return;
  p.hold = null;
  const player = room.state.players.get(seat);
  if (!player) return;
  m.bySeat.set(seat, spot.id);
  m.bySpot.set(spot.id, seat);
  player.priv.hiding = spot.id;
  simOf(room).viewsDirty = true; // the figure leaves every other view
  if (!silent) emitNoise(room, sceneKey(p.sceneIdx) as SceneId, p.x, p.y, balance.noise.hide, 'hide', seat);
}

/** `act.check {spotId}`: starts opening a spot; a child's crawlspace is not for adults. */
export function handleCheck(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const p = actor(room, seat);
  if (!p) return;
  if (isHiding(room, seat)) return reject(room, seat, 'BUSY');
  const spot = spotIn(p, payload.spotId);
  if (!spot || (spot.childOnly && !hasAbility(room, seat, 'silentHide'))) {
    return reject(room, seat, 'NOTHING_THERE');
  }
  if (!nearSpot(p, spot)) return reject(room, seat, 'TOO_FAR', { of: 'door' });
  p.hold = { action: CHECK_HOLD, targetId: spot.id, startTick: room.state.tick };
}

/** Call site: `runHolds`. At `castS` an occupied spot gives its hider up and writes the hider's Verified entry. */
export function tickCheck(room: PartyRoom, seat: string, p: PlayerSim): void {
  const hold = p.hold;
  if (!hold) return;
  const spot = spotIn(p, hold.targetId);
  if (!spot || p.dead || !isVerbPhase(room.state.phase) || p.vx !== 0 || p.vy !== 0 || !nearSpot(p, spot)) {
    p.hold = null;
    return;
  }
  if (room.state.tick - hold.startTick < ticks(abilities.abilities.check?.castS ?? 0)) return;
  p.hold = null;
  const hider = hidingOf(room).bySpot.get(spot.id);
  if (hider === undefined) return;
  const hp = simOf(room).players.get(hider);
  const hplayer = room.state.players.get(hider);
  release(room, hider);
  if (!hp || !hplayer) return;
  // The entry names the figure the hider saw: the face the checker's avatar showed, impersonation included.
  const memoryOfAvatars = avatarMemory(room);
  const handle = memoryOfAvatars.handleOf.get(seat);
  const entry = new NotebookEntry();
  entry.id = `entry_${++hp.entrySeq}`;
  entry.clueKind = 0;
  entry.sceneId = hp.sceneIdx;
  entry.tick = room.state.tick;
  entry.status = NotebookStatus.verified;
  entry.note = NoteKind.checked;
  entry.of = (handle === undefined ? undefined : avatarOf(room, handle)?.lookOf) ?? seat;
  hplayer.priv.notebook.push(entry);
}

/** `act.burst {spotId}`: the hider leaves its own spot at once, stunning whoever is opening it. */
export function handleBurst(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const p = simOf(room).players.get(seat);
  if (!p || p.dead || !p.placed) return reject(room, seat, 'NOT_IN_PLAY');
  const m = hidingOf(room);
  const spot = m.bySeat.get(seat);
  if (spot === undefined || payload.spotId !== spot) return reject(room, seat, 'NOTHING_THERE');
  release(room, seat);
  const stun = ticks(abilities.abilities.burstOut?.params?.stunS ?? 0);
  for (const [other, o] of simOf(room).players) {
    if (o.hold?.action !== CHECK_HOLD || o.hold.targetId !== spot) continue;
    o.hold = null;
    const body = bodyOf(room, other);
    if (body) applyEffect(room, other, body, 'stunned', stun);
  }
  emitNoise(room, sceneKey(p.sceneIdx) as SceneId, p.x, p.y, balance.noise.burst, 'burst', seat);
}

/** Call site: `runHolds`, every tick: a dead seat or a closed world lets its hider out. */
export function runHiding(room: PartyRoom): void {
  const m = hidingOf(room);
  for (const seat of [...m.bySeat.keys()]) {
    const p = simOf(room).players.get(seat);
    if (!p || p.dead || !isWorldPhase(room.state.phase)) release(room, seat);
  }
}

// ---- Chalk, Act Shifty, Fake Blood (act.ability) ----

/** `act.ability {abilityId: 'chalk', value}`: a floor mark of symbol `value` on the seat's own tile, public to the scene. */
function chalk(room: PartyRoom, seat: string, p: PlayerSim, payload: Record<string, unknown>): void {
  const def = abilities.abilities.chalk;
  const player = room.state.players.get(seat);
  if (!def || !player) return;
  if (count(player, def.requires ?? 'chalk') < 1) return reject(room, seat, 'NEED_ITEM', { need: 'chalk' });
  const value = payload.value;
  const symbols = def.params?.symbols ?? 1;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= symbols) {
    return reject(room, seat, 'BAD_REQUEST');
  }
  if (room.state.tick < (player.priv.cooldownEndTick.get('chalk') ?? 0))
    return reject(room, seat, 'COOLDOWN');
  const decay = clueDefs.clues.chalk?.decay;
  spawnClue(room, sceneKey(p.sceneIdx) as SceneId, {
    kind: ClueKind.chalk,
    value,
    dir: 0,
    tx: Math.floor(p.x / TILE_PX),
    ty: Math.floor(p.y / TILE_PX),
    decayS: decay ? decaySeconds(decay) : null,
  });
  player.priv.cooldownEndTick.set('chalk', room.state.tick + ticks(def.cooldownS ?? 0));
}

/** Act Shifty: the run's noise rings where the seat stands, heard like a real run's. */
function actShifty(room: PartyRoom, seat: string, p: PlayerSim): void {
  const def = abilities.abilities.actShifty;
  const player = room.state.players.get(seat);
  if (!def || !player) return;
  if (room.state.tick < (player.priv.cooldownEndTick.get('actShifty') ?? 0)) {
    return reject(room, seat, 'COOLDOWN');
  }
  emitNoise(room, sceneKey(p.sceneIdx) as SceneId, p.x, p.y, balance.noise.run, 'run', seat);
  player.priv.cooldownEndTick.set('actShifty', room.state.tick + ticks(def.cooldownS ?? 0));
}

/** Fake Blood: the Blood bit on the seat's figure for `durationS`, once a match; it is the bit a kill sets. */
function fakeBlood(room: PartyRoom, seat: string, p: PlayerSim): void {
  const def = abilities.abilities.fakeBlood;
  if (!def) return;
  const spent = hidingOf(room).bloodSpent;
  if (spent.has(seat)) return reject(room, seat, 'SPENT', { what: 'match' });
  spent.add(seat);
  p.bloodyUntilTick = room.state.tick + ticks(def.params?.durationS ?? 0);
}

/** Dispatch of `handleAbility` for the three kit verbs; `livingActor` is the caller's actor gate. */
export function handleKitAbility(
  room: PartyRoom,
  seat: string,
  id: 'chalk' | 'actShifty' | 'fakeBlood',
  payload: Record<string, unknown>,
  livingActor: (room: PartyRoom, seat: string) => PlayerSim | null,
): void {
  if (!hasAbility(room, seat, id)) return reject(room, seat, 'NOT_YOUR_POWER');
  const p = livingActor(room, seat);
  if (!p) return;
  if (isHiding(room, seat)) return reject(room, seat, 'BUSY');
  if (id === 'chalk') chalk(room, seat, p, payload);
  else if (id === 'actShifty') actShifty(room, seat, p);
  else fakeBlood(room, seat, p);
}
