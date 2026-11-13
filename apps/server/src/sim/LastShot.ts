import { abilities, balance, roles } from '@wdi/content';
import { NoteKind, Phase, S2C, TICK_RATE, TILE_PX } from '@wdi/shared';
import type { DeathCause } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { spawnBody } from './Bodies';
import { markDead } from './Death';
import { isMeetingPhase, rolesOf } from './Flow';
import { emitNoise } from './Noise';
import { isNpcSeat } from './Npc';
import { npcMemory } from './npc/memory';
import { npcVoteTarget } from './npc/meeting';
import { addNote } from './NightPowers';
import { nightOf } from './nightMemory';
import { simOf } from './RoomSim';
import { endMatch, evaluateWin } from './Win';
import { isWorldPhase, reject, sceneKey } from './World';
import { clientOf } from './seatIds';

// The Gamekeeper's Last Shot (GDD 3.2, 3.8; round-5 `deck/wire.md` 5). Session 5G owns this file. A dying Gamekeeper
// (Knife, Nightshade or an ejection) gets `aim {endsTick}` for `lastShot.params.aimS`; its view holds no avatar
// meanwhile (`isAiming`, Visibility.ts) and its `killed` message waits until the aim closes.

const DYING: readonly DeathCause[] = ['knife', 'poison', 'ejected'];

/** `markDead` of a Gamekeeper (via `beginAim`): opens the aim; true defers `killed`. */
export function startAim(room: PartyRoom, seat: string, cause: DeathCause): boolean {
  const player = room.state.players.get(seat);
  const p = simOf(room).players.get(seat);
  if (!player?.priv || !p || !DYING.includes(cause)) return false;
  if (!roles.roles[player.priv.role.roleId]?.abilities.includes('lastShot')) return false;
  if (!player.priv.inventory.slots.some((s) => s.defId === abilities.abilities.lastShot?.requires))
    return false;
  // A seat nobody sits at has no screen to black out and no hand to fire: the death is announced at once.
  if (!player.connected && !isNpcSeat(room, seat)) return false;
  const aimS = abilities.abilities.lastShot?.params?.aimS ?? 0;
  const untilTick = room.state.tick + Math.round(aimS * TICK_RATE);
  nightOf(room).aims.set(seat, { cause, sceneId: sceneKey(p.sceneIdx), untilTick, shot: false, held: false });
  clientOf(room, seat)?.send(S2C.aim, { endsTick: untilTick });
  simOf(room).viewsDirty = true;
  return true;
}

/** Closes one aim: the deferred `killed`, the ghost view, and the win check the batch was waiting for. */
function closeAim(room: PartyRoom, seat: string): void {
  const mem = nightOf(room);
  const aim = mem.aims.get(seat);
  if (!aim) return;
  mem.aims.delete(seat);
  clientOf(room, seat)?.send(S2C.killed, { sceneId: aim.sceneId, cause: aim.cause, roles: rolesOf(room) });
  simOf(room).viewsDirty = true;
  // The forced meeting's verdict is FinalNight.ts's; a later reveal's own check follows its hold.
  if (mem.aims.size > 0 || room.state.phase === Phase.gameOver || room.state.meeting.reason === 'final')
    return;
  const winner = evaluateWin(room);
  if (winner && room.state.phase >= Phase.grace) endMatch(room, winner);
}

/** Every tick: an aim whose window ran out closes (the Gamekeeper held its fire). */
export function closeAims(room: PartyRoom): void {
  const tick = room.state.tick;
  for (const [seat, aim] of [...nightOf(room).aims]) if (tick >= aim.untilTick) closeAim(room, seat);
}

/** Fires the shot: the target dies at once (cause shot), in the world or at a meeting, and the aim closes. */
function fire(room: PartyRoom, shooter: string, targetId: string): void {
  const sim = simOf(room);
  const target = sim.players.get(targetId);
  const targetPlayer = room.state.players.get(targetId);
  const phase = room.state.phase;
  addNote(room, shooter, NoteKind.shot, targetId);
  if (target && targetPlayer && !target.dead) {
    markDead(room, targetId, 'shot', shooter);
    if (isMeetingPhase(phase)) {
      // No role is shown at a meeting's discussion or vote. Only an ejected Gamekeeper's shot is announced, with the
      // role, at its reveal (GDD 3.8); a knifed or poisoned one whose aim runs into a reveal kills unannounced, or
      // the broadcast would name a death nobody has seen and the shooter's card.
      targetPlayer.alive = false;
      if (phase === Phase.reveal && nightOf(room).aims.get(shooter)?.cause === 'ejected') {
        room.broadcast(S2C.shot, { fromId: shooter, targetId, role: targetPlayer.priv.role.roleId });
      }
    } else if (isWorldPhase(phase) && target.placed) {
      const sceneId = sceneKey(target.sceneIdx);
      spawnBody(room, sceneId, targetId, Math.floor(target.x / TILE_PX), Math.floor(target.y / TILE_PX));
      emitNoise(room, sceneId, target.x, target.y, balance.noise.shot, 'shot', shooter);
    }
  }
  nightOf(room).aims.get(shooter)!.shot = true;
  closeAim(room, shooter);
}

/** `act.ability {abilityId: 'lastShot', targetId}`: accepted in any phase while the aim is open, on a seat. */
export function handleLastShot(room: PartyRoom, seat: string, payload: Record<string, unknown>): void {
  const aim = nightOf(room).aims.get(seat);
  if (!aim || room.state.tick >= aim.untilTick || aim.shot) {
    return reject(room, seat, 'NOT_AIMED');
  }
  const targetId = payload.targetId;
  const target = typeof targetId === 'string' ? room.state.players.get(targetId) : undefined;
  if (typeof targetId !== 'string' || !target || !target.alive || targetId === seat) {
    return reject(room, seat, 'NO_TARGET');
  }
  fire(room, seat, targetId);
}

/** An NPC Gamekeeper fires at `brain.lastShotAtTick` at `npcVoteTarget`, or holds its fire when that is null. */
export function runNpcShots(room: PartyRoom): void {
  const tick = room.state.tick;
  for (const [seat, aim] of [...nightOf(room).aims]) {
    const brain = npcMemory(room).brains.get(seat);
    if (
      !isNpcSeat(room, seat) ||
      !brain ||
      aim.shot ||
      aim.held ||
      brain.lastShotAtTick < 0 ||
      tick < brain.lastShotAtTick
    ) {
      continue;
    }
    const target = npcVoteTarget(room, seat);
    const legal = target !== null && room.state.players.get(target)?.alive === true && target !== seat;
    if (legal) fire(room, seat, target);
    // Nobody to shoot: it holds its fire. The aim keeps that, since 5H redraws a cleared `lastShotAtTick`.
    else aim.held = true;
  }
}
