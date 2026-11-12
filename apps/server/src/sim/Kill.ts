import { abilities, balance, clues, roles } from '@wdi/content';
import { REASON_CODE, S2C, TICK_RATE, TILE_PX, segmentBlocked, validateKill } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { POSITION_RING_TICKS } from './constants';
import { resolveHandle } from './Avatars';
import { spawnBody } from './Bodies';
import { bodyBlocksAct } from './body/run';
import { spendCharm } from './body/charm'; // round 8, 8A: the well's charm
import { spawnKillClues } from './Clues';
import { markDead } from './Death';
import { emitSim } from './events/bus';
import { endImpersonation } from './Impersonate';
import { isJailed, untilDawnS } from './law/Jail';
import { spendProtection } from './NightPowers';
import { emitNoise } from './Noise';
import { type PlayerSim, simOf } from './RoomSim';
import { knockBackPair, onBandagedStrike } from './Struck';
import { isKillPhase, navGrid, reject, sceneKey } from './World';
import { guardTarget, returnGuard } from './law/Guards';
import { isPaintTown, onGuardDeath } from './paintTown';
import { figureOfHandle, killFigure } from './townsfolk/figures';
import { refusal, type Refusal } from './refusal';

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
/** The reason of `validateKill`'s verdict (the shared rule keeps its legacy code and words). */
function killRefusal(verdict: { code: number; msg: string }): Refusal {
  if (verdict.code === REASON_CODE.PHASE_CLOSED) return refusal('PHASE_CLOSED');
  if (verdict.code === REASON_CODE.BUSY) return refusal('BUSY');
  if (verdict.code === REASON_CODE.COOLDOWN) return refusal('COOLDOWN');
  if (verdict.code === REASON_CODE.TOO_FAR) return refusal('TOO_FAR', { of: 'person' });
  return refusal(verdict.msg === 'not now' ? 'NOT_IN_PLAY' : 'NO_TARGET');
}

export function handleKill(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const sim = simOf(room);
  const tick = room.state.tick;
  const player = room.state.players.get(sessionId);
  const actor = sim.players.get(sessionId);
  if (!player || !actor) return;
  // A seat without the power never sees the verb; only a cheat lands here, and the line names no role (A233).
  if (!roles.roles[player.priv.role.roleId]?.abilities.includes('kill')) {
    reject(room, sessionId, 'NOT_YOUR_POWER');
    return;
  }
  if (bodyBlocksAct(room, sessionId)) return reject(room, sessionId, 'DOWN_OR_STUNNED'); // round 8, 8A
  if (isJailed(room, sessionId))
    return reject(room, sessionId, 'IN_JAIL', { untilDawn: untilDawnS(room, sessionId) }); // B5
  if (knifeGuard(room, sessionId, player.priv.cooldownEndTick, actor, payload.targetId)) return; // round 10, C5c
  const targetId = resolveHandle(room, sessionId, payload.targetId);
  const target = targetId === null ? undefined : sim.players.get(targetId);
  if (targetId === null || !target || targetId === sessionId) {
    reject(room, sessionId, 'NO_TARGET');
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
    reject(room, sessionId, killRefusal(verdict));
    return;
  }
  // A strike drops the striker's disguise in place, voided or not (GDD 3.17).
  if (endImpersonation(room, sessionId)) sendDisguisePuff(room, actor);

  // Either way the strike was made: the attacker is bloody and the Knife rests.
  const bloodDecay = clues.clues.blood?.decay;
  actor.bloodyUntilTick = tick + (bloodDecay?.kind === 'seconds' ? bloodDecay.seconds : 0) * TICK_RATE;
  player.priv.cooldownEndTick.set('kill', tick + killCooldownTicks(room));
  const sceneId = sceneKey(actor.sceneIdx);
  // A Watch or a Remedy voids the strike exactly as a Bandage does (GDD 3.2, 5G), the knockback included (round 10,
  // x10, A393): the striker must not tell from the push which protection held.
  if (spendProtection(room, targetId, sessionId)) {
    knockBackPair(room, sessionId, targetId);
    reject(room, sessionId, 'VOIDED');
    return;
  }
  if (target.bandagedUntilTick > tick) {
    target.bandagedUntilTick = 0;
    onBandagedStrike(room, sessionId, targetId); // the target's blackout and the Claimed entries (GDD 3.2)
    knockBackPair(room, sessionId, targetId);
    reject(room, sessionId, 'VOIDED');
    return;
  }
  if (spendCharm(room, targetId)) return reject(room, sessionId, 'VOIDED'); // round 8, 8A

  const tx = Math.floor(target.x / TILE_PX);
  const ty = Math.floor(target.y / TILE_PX);
  emitSim(room, { tick, kind: 'kill', seat: targetId, sceneId, data: { by: sessionId } }); // round 6, 6B
  markDead(room, targetId, 'knife', sessionId);
  spawnBody(room, sceneId, targetId, tx, ty);
  spawnKillClues(room, sceneId, tx, ty, {
    height: player.traits.height,
    scarf: player.traits.scarf,
  });
  emitNoise(room, sceneId, target.x, target.y, balance.noise.killScream, 'scream', sessionId);
}

/**
 * The Knife on a guard figure (round 10, C5c; GDD 3.24), in every mode: a guard in reach, standing or knocked out,
 * dies as a figure dies (its body until the next meeting, no seat's death, no clue of a killer's look), and the
 * striker is bloody, the Knife rests and the scream carries. In Paint The Town Red it waits for the next morning's
 * train and its death may complete the pillars (`paintTown.ts`). Returns false when the handle is no guard's.
 */
function knifeGuard(
  room: PartyRoom,
  sessionId: string,
  cooldowns: Map<string, number>,
  actor: PlayerSim,
  handle: unknown,
): boolean {
  const def = abilities.abilities.kill;
  if (!def) return false;
  const f = guardTarget(room, sessionId, { actor, def }, handle, (h) => figureOfHandle(room, h), {
    allowDown: true,
  });
  if (f === undefined) return false;
  if (f === null) return true;
  const tick = room.state.tick;
  const why = !isKillPhase(room.state.phase)
    ? 'PHASE_CLOSED'
    : actor.dead || !actor.placed
      ? 'NOT_IN_PLAY'
      : tick < actor.busyUntilTick
        ? 'BUSY'
        : tick < (cooldowns.get('kill') ?? 0)
          ? 'COOLDOWN'
          : null;
  if (why !== null) {
    reject(room, sessionId, why);
    return true;
  }
  if (endImpersonation(room, sessionId)) sendDisguisePuff(room, actor);
  const bloodDecay = clues.clues.blood?.decay;
  actor.bloodyUntilTick = tick + (bloodDecay?.kind === 'seconds' ? bloodDecay.seconds : 0) * TICK_RATE;
  cooldowns.set('kill', tick + killCooldownTicks(room));
  const { x, y } = f;
  killFigure(room, f, 'knife');
  returnGuard(f); // no foe and no cuff while dead, so the morning train returns it to its post's route afresh
  emitNoise(room, sceneKey(actor.sceneIdx), x, y, balance.noise.killScream, 'scream', sessionId);
  if (isPaintTown(room)) onGuardDeath(room, f); // the step's win check reads the pillars at this tick
  return true;
}

/**
 * A creature's last bite (GDD 3.15, Session 6G; round 8, 8A: the cause is `wolf` for the wolf and `creature` for
 * the rest, GDD 3.22): the death, the body where the seat fell and the kill scream, with no clue of a killer (no
 * height, no scarf, no blood on anyone). Called from `sim/body/damage.ts` only.
 */
export function creatureKill(room: PartyRoom, victimId: string, cause: 'wolf' | 'creature' = 'wolf'): void {
  const victim = simOf(room).players.get(victimId);
  if (!victim || victim.dead) return;
  const sceneId = sceneKey(victim.sceneIdx);
  markDead(room, victimId, cause);
  spawnBody(room, sceneId, victimId, Math.floor(victim.x / TILE_PX), Math.floor(victim.y / TILE_PX));
  emitNoise(room, sceneId, victim.x, victim.y, balance.noise.killScream, 'scream', victimId);
}
