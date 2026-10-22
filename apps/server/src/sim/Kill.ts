import { abilities, balance, clues, roles } from '@wdi/content';
import { ErrorCode, S2C, TICK_RATE, TILE_PX, segmentBlocked, validateKill } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { POSITION_RING_TICKS } from './constants';
import { resolveHandle } from './Avatars';
import { spawnBody } from './Bodies';
import { spawnKillClues } from './Clues';
import { markDead } from './Death';
import { endImpersonation } from './Impersonate';
import { spendProtection } from './NightPowers';
import { emitNoise } from './Noise';
import { type PlayerSim, simOf } from './RoomSim';
import { isKillPhase, navGrid, reject, sceneKey } from './World';

/** Kill cooldown in ticks for this party size (GDD 3.9; the row is cut to 4-10 like the deal). */
function killCooldownTicks(room: PartyRoom): number {
  const n = Math.min(10, Math.max(4, room.state.players.size));
  return (balance.byCount[String(n) as '4']?.killCooldownS ?? 0) * TICK_RATE;
}

/** Distance a player moved over the last 250 ms of the position ring (the range slack, A30). */
function movedLast250ms(p: PlayerSim): number {
  const then = p.positionAt(POSITION_RING_TICKS);
  return then ? Math.hypot(p.x - then.x, p.y - then.y) : 0;
}

/**
 * The puff of a disguise a Knife strike dropped (GDD 3.17): `vfx` at the striker's position to every client whose
 * view holds that scene, ghosts included. It names no handle and no seat; `handleKill` is its only sender.
 */
function sendDisguisePuff(room: PartyRoom, actor: PlayerSim): void {
  const sim = simOf(room);
  const msg = {
    sceneId: sceneKey(actor.sceneIdx),
    x: Math.round(actor.x),
    y: Math.round(actor.y),
    kind: 'disguise' as const,
  };
  for (const client of room.clients) {
    const p = sim.players.get(client.sessionId);
    if (p?.placed && p.sceneIdx === actor.sceneIdx) client.send(S2C.vfx, msg);
  }
}

/**
 * `act.ability {abilityId: "kill", targetId}`, resolved on the validated tick (GDD 3.2). The payload is
 * untrusted: the role card, the phase, the cooldown, the reach and the line are all checked here. Round 5
 * (locked call sites): `targetId` is resolved through `resolveHandle` (5F); an accepted strike ends a disguise
 * (5F, with the puff) and may spend a protection (5G) before the Bandage check.
 */
export function handleKill(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const sim = simOf(room);
  const tick = room.state.tick;
  const player = room.state.players.get(sessionId);
  const actor = sim.players.get(sessionId);
  if (!player || !actor) return;
  if (!roles.roles[player.priv.role.roleId]?.abilities.includes('kill')) {
    reject(room, sessionId, ErrorCode.cannot, 'no knife');
    return;
  }
  const targetId = resolveHandle(room, sessionId, payload.targetId);
  const target = targetId === null ? undefined : sim.players.get(targetId);
  if (targetId === null || !target || targetId === sessionId) {
    reject(room, sessionId, ErrorCode.cannot, 'no target');
    return;
  }
  const grid = navGrid(sceneKey(actor.sceneIdx), sim.profile);
  const moved = movedLast250ms(target);
  const verdict = validateKill({
    tick,
    phaseOk: isKillPhase(room.state.phase),
    actorDead: actor.dead,
    actorPlaced: actor.placed,
    busyUntilTick: actor.busyUntilTick,
    cooldownEndTick: player.priv.cooldownEndTick.get('kill') ?? 0,
    targetDead: target.dead,
    targetPlaced: target.placed,
    sameScene: target.sceneIdx === actor.sceneIdx,
    targetInTransit: tick < target.busyUntilTick,
    actorX: actor.x,
    actorY: actor.y,
    targetX: target.x,
    targetY: target.y,
    targetMovedPx: moved,
    rangePx: (abilities.abilities.kill?.rangeTiles ?? 0) * TILE_PX,
    solidBetween: (ax, ay, bx, by) => segmentBlocked(grid, ax, ay, bx, by),
  });
  if (!verdict.ok) {
    reject(room, sessionId, verdict.code as ErrorCode, verdict.msg);
    return;
  }
  // A strike drops the striker's disguise in place, voided or not (GDD 3.17).
  if (endImpersonation(room, sessionId)) sendDisguisePuff(room, actor);

  // Either way the strike was made: the attacker is bloody and the Knife rests.
  const bloodDecay = clues.clues.blood?.decay;
  actor.bloodyUntilTick = tick + (bloodDecay?.kind === 'seconds' ? bloodDecay.seconds : 0) * TICK_RATE;
  player.priv.cooldownEndTick.set('kill', tick + killCooldownTicks(room));
  const sceneId = sceneKey(actor.sceneIdx);
  // A Watch or a Remedy voids the strike exactly as a Bandage does (GDD 3.2, 5G).
  if (spendProtection(room, targetId, sessionId)) {
    reject(room, sessionId, ErrorCode.cannot, 'nothing happens');
    return;
  }
  if (target.bandagedUntilTick > tick) {
    target.bandagedUntilTick = 0;
    reject(room, sessionId, ErrorCode.cannot, 'nothing happens');
    return;
  }

  const tx = Math.floor(target.x / TILE_PX);
  const ty = Math.floor(target.y / TILE_PX);
  markDead(room, targetId, 'knife', sessionId);
  spawnBody(room, sceneId, targetId, tx, ty);
  spawnKillClues(room, sceneId, tx, ty, {
    height: player.traits.height,
    scarf: player.traits.scarf,
  });
  emitNoise(room, sceneId, target.x, target.y, balance.noise.killScream, 'scream', sessionId);
}

/**
 * A wolf's last bite (GDD 3.15, Session 6G): the `wolf` death, the body where the seat fell and the kill scream,
 * with no clue of a killer (no height, no scarf, no blood on anyone). Called from `mobs/hurt.ts` only.
 */
export function creatureKill(room: PartyRoom, victimId: string): void {
  const victim = simOf(room).players.get(victimId);
  if (!victim || victim.dead) return;
  const sceneId = sceneKey(victim.sceneIdx);
  markDead(room, victimId, 'wolf');
  spawnBody(room, sceneId, victimId, Math.floor(victim.x / TILE_PX), Math.floor(victim.y / TILE_PX));
  emitNoise(room, sceneId, victim.x, victim.y, balance.noise.killScream, 'scream', victimId);
}
