import { abilities, balance, clues, roles } from '@wdi/content';
import { ErrorCode, TICK_RATE, TILE_PX, segmentBlocked, validateKill } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { POSITION_RING_TICKS } from './constants';
import { spawnBody } from './Bodies';
import { spawnKillClues } from './Clues';
import { markDead } from './Death';
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
 * `act.ability {abilityId: "kill", targetId}`, resolved on the validated tick (GDD 3.2). The payload is
 * untrusted: the role card, the phase, the cooldown, the reach and the line are all checked here.
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
  const targetId = payload.targetId;
  const target = typeof targetId === 'string' ? sim.players.get(targetId) : undefined;
  if (typeof targetId !== 'string' || !target || targetId === sessionId) {
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

  // Either way the strike was made: the attacker is bloody and the Knife rests.
  const bloodDecay = clues.clues.blood?.decay;
  actor.bloodyUntilTick = tick + (bloodDecay?.kind === 'seconds' ? bloodDecay.seconds : 0) * TICK_RATE;
  player.priv.cooldownEndTick.set('kill', tick + killCooldownTicks(room));
  const sceneId = sceneKey(actor.sceneIdx);
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
