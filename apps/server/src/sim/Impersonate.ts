import { balance, roles } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { avatarMemory, rehandle } from './Avatars';
import { reject } from './World';
import { simOf } from './RoomSim';
import { isPinned } from './law/Jail';

// Impersonate (GDD 3.17, round-5 `deck-wire.md` 4.5). A Killer asks for a living seat's face; it changes only unseen
// (alone in the scene, or inside a scene entry), drops in place on a Knife strike, and is room memory only: the
// disguise is `avatarMemory(room).disguise`, never a schema field. The numbers are `balance.json` `impersonate`.

const ticks = (seconds: number): number => Math.round(seconds * TICK_RATE);

/** Impersonate, like the Knife it hides, belongs to dusk, the night and the Final Night hunt. */
const isDisguisePhase = (phase: number): boolean =>
  phase === Phase.dusk || phase === Phase.night || phase === Phase.finalNight;

/** No other seat is placed, living and in `seat`'s scene (a ghost sees true seats anyway; an aiming seat sees none). */
function isAlone(room: PartyRoom, seat: string): boolean {
  const sim = simOf(room);
  const p = sim.players.get(seat);
  if (!p) return false;
  for (const [id, other] of sim.players) {
    if (id !== seat && other.placed && !other.dead && other.sceneIdx === p.sceneIdx) return false;
  }
  return true;
}

/** The face turns on: `applied`, for `durationS` from now. The caller re-handles the seat. */
function applyDisguise(room: PartyRoom, seat: string): void {
  const disguise = avatarMemory(room).disguise.get(seat);
  if (!disguise || disguise.applied) return;
  disguise.applied = true;
  disguise.untilTick = room.state.tick + ticks(balance.impersonate.durationS);
}

/**
 * Ends `seat`'s disguise; true when it was applied (a strike's caller then sends the `vfx` puff). An applied one
 * starts the cooldown, counted from the drop, and re-handles the seat unless `rehandleSeat` is false (a scene entry
 * or a meeting placement does that already).
 */
function dropDisguise(room: PartyRoom, seat: string, rehandleSeat: boolean): boolean {
  const memory = avatarMemory(room);
  const disguise = memory.disguise.get(seat);
  if (!disguise) return false;
  memory.disguise.delete(seat);
  if (!disguise.applied) return false;
  const priv = room.state.players.get(seat)?.priv;
  priv?.cooldownEndTick.set('impersonate', room.state.tick + ticks(balance.impersonate.cooldownS));
  if (rehandleSeat) rehandle(room, seat, false, false);
  return true;
}

/**
 * Inside `enterScene` (through `rehandle`): a pending disguise applies and one with `dropRequested` drops, so the old
 * scene sees the old face leave and the new scene sees the new face arrive. A dead seat's disguise just goes.
 */
export function settleDisguise(room: PartyRoom, seat: string): void {
  const memory = avatarMemory(room);
  const disguise = memory.disguise.get(seat);
  if (!disguise || isPinned(room, seat)) return; // round 10, B5: pinned from the cuff until release (Jail.ts)
  if (simOf(room).players.get(seat)?.dead) {
    memory.disguise.delete(seat);
    return;
  }
  if (!disguise.applied) {
    if (disguise.dropRequested) memory.disguise.delete(seat);
    else applyDisguise(room, seat);
  } else if (disguise.dropRequested) {
    dropDisguise(room, seat, false);
  }
}

/**
 * A stage right after `runCommands` (`Step.ts`): cancels pending disguises that time out, asks applied ones to
 * drop, and applies or drops them only on a tick when the seat is alone in its scene.
 */
export function runImpersonation(room: PartyRoom): void {
  const memory = avatarMemory(room);
  if (memory.disguise.size === 0) return;
  const tick = room.state.tick;
  const phaseOk = isDisguisePhase(room.state.phase);
  for (const [seat, disguise] of [...memory.disguise]) {
    const p = simOf(room).players.get(seat);
    if (!p || p.dead) {
      memory.disguise.delete(seat);
      continue;
    }
    if (isPinned(room, seat)) continue; // round 10, B5: no expiry and no alone drop while jailed
    if (!disguise.applied) {
      if (disguise.dropRequested || tick >= disguise.applyByTick || !phaseOk) {
        memory.disguise.delete(seat); // cancelled at no cooldown
        continue;
      }
    } else if (!disguise.dropRequested && (tick >= disguise.untilTick || !phaseOk)) {
      disguise.dropRequested = true;
    }
    if (!isAlone(room, seat)) continue;
    if (!disguise.applied) {
      applyDisguise(room, seat);
      rehandle(room, seat, false, false);
    } else if (disguise.dropRequested) {
      dropDisguise(room, seat, true);
    }
  }
}

/**
 * Ends `seat`'s disguise; true when it was applied (the caller in `handleKill` then sends the `vfx` puff). Called
 * from `handleKill` for every strike `validateKill` accepts.
 */
export function endImpersonation(room: PartyRoom, seat: string): boolean {
  return dropDisguise(room, seat, true);
}

/** From `openMeeting`, before the placements: every disguise ends, with no `vfx`; the placements re-roll every handle. */
export function onMeetingOpenDisguise(room: PartyRoom): void {
  for (const seat of [...avatarMemory(room).disguise.keys()])
    if (!isPinned(room, seat)) dropDisguise(room, seat, false); // round 10, B5: a pinned face stays
}

/**
 * `act.ability {abilityId: 'impersonate', targetId: <seat id>}` (`handleAbility`, `Actions.ts`). Using it while a
 * disguise is pending or applied only asks it to drop; nothing is sent and nothing in any view changes now.
 */
export function handleImpersonate(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const player = room.state.players.get(seat);
  const p = simOf(room).players.get(seat);
  if (!player || !p) return;
  if (!roles.roles[player.priv.role.roleId]?.abilities.includes('impersonate')) {
    return reject(room, seat, 'BAD_REQUEST');
  }
  if (p.dead || !p.placed) return reject(room, seat, 'NOT_IN_PLAY');
  if (!isDisguisePhase(room.state.phase)) return reject(room, seat, 'PHASE_CLOSED');
  const tick = room.state.tick;
  if (tick < p.busyUntilTick) return reject(room, seat, 'BUSY');
  const memory = avatarMemory(room);
  const current = memory.disguise.get(seat);
  if (current) {
    current.dropRequested = true;
    return;
  }
  if (tick < (player.priv.cooldownEndTick.get('impersonate') ?? 0)) {
    return reject(room, seat, 'COOLDOWN');
  }
  const target = payload.targetId;
  if (typeof target !== 'string' || target === seat || room.state.players.get(target)?.alive !== true) {
    return reject(room, seat, 'NO_TARGET');
  }
  memory.disguise.set(seat, {
    as: target,
    applied: false,
    dropRequested: false,
    applyByTick: tick + ticks(balance.impersonate.applyWindowS),
    untilTick: 0,
  });
}
