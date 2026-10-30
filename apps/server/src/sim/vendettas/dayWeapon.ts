import { abilities, balance } from '@wdi/content';
import { Phase, REASON_CODE, TILE_PX, segmentBlocked, validateKill } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { avatarOf, resolveHandle } from '../Avatars';
import { spawnBody } from '../Bodies';
import { bodyBlocksAct } from '../body/run';
import { markDead } from '../Death';
import { count, take } from '../Inventory';
import { emitNoise } from '../Noise';
import { simOf } from '../RoomSim';
import { type Refusal, refusal } from '../refusal';
import { navGrid, reject, sceneKey } from '../World';
import { DERRINGER_ITEM, onShotArrival } from './arrival';
import { acceptOpenContract, openContract } from './contract';

/**
 * The Hitman's day weapon (round 10, C4b; GDD 3.33, followup-4 2.6 b6; seams.md 3 row 21): the Derringer, put in the
 * turned seat's own pack at the turning (`arrival.ts`), role-bound and `onDeath: kept` like the Knife, so no robbery,
 * search, loot or death drop moves or shows it (`Inventory.ts` `strip` keeps it; no shop, recipe or chest names it).
 * `act.ability {abilityId: 'derringer', targetId}`: one shot, by day (`abilities.json` `phases`), with every refusal
 * of the Knife's `validateKill` path. The test of the target reads the drawn figure, never the seat behind it (row 14's
 * rule): a figure drawn as the mark's look (`Avatar.lookOf` is the mark's `Player.look`) may be shot, any other is
 * refused as a non-target; the shot lands on the seat behind the figure, so an impersonator drawn as the mark dies in
 * its place and the contract stays open. The death's cause is `derringer`, which the Train never returns; it makes
 * the Last Shot's noise and lays no clue of a look. A shot at the mark accepts an open contract first.
 */

const DERRINGER = DERRINGER_ITEM; // the ability and the item share the id

export function handleDerringer(room: PartyRoom, sessionId: string, payload: Record<string, unknown>): void {
  const sim = simOf(room);
  const tick = room.state.tick;
  const player = room.state.players.get(sessionId);
  const actor = sim.players.get(sessionId);
  const def = abilities.abilities[DERRINGER];
  if (!player || !actor || !def) return;
  const contract = openContract(room, sessionId);
  if (!player.priv.hitman || !contract) return reject(room, sessionId, 'NOT_YOUR_POWER');
  if (count(player, DERRINGER) < 1) return reject(room, sessionId, 'NEED_ITEM', { need: DERRINGER });
  if (bodyBlocksAct(room, sessionId)) return reject(room, sessionId, 'DOWN_OR_STUNNED');
  const handle = payload.targetId;
  const figure = typeof handle === 'string' ? avatarOf(room, handle) : undefined;
  const markLook = room.state.players.get(contract.target)?.look;
  const targetId = resolveHandle(room, sessionId, handle);
  const target = targetId === null ? undefined : sim.players.get(targetId);
  if (!figure || figure.lookOf !== markLook || !target || targetId === sessionId)
    return reject(room, sessionId, 'NO_TARGET');
  const grid = navGrid(sceneKey(actor.sceneIdx), sim.profile);
  const verdict = validateKill({
    tick,
    phaseOk: (def.phases ?? []).some((name) => Phase[name] === room.state.phase),
    actorDead: actor.dead,
    actorPlaced: actor.placed,
    busyUntilTick: actor.busyUntilTick,
    cooldownEndTick: 0,
    targetDead: target.dead,
    targetPlaced: target.placed,
    sameScene: target.sceneIdx === actor.sceneIdx,
    targetInTransit: tick < target.busyUntilTick,
    actorX: actor.x,
    actorY: actor.y,
    targetX: target.x,
    targetY: target.y,
    targetMovedPx: 0,
    rangePx: (def.rangeTiles ?? 0) * TILE_PX,
    solidBetween: (ax, ay, bx, by) => segmentBlocked(grid, ax, ay, bx, by),
  });
  if (!verdict.ok) return reject(room, sessionId, refusalOf(verdict));
  take(player, DERRINGER, 1);
  acceptOpenContract(room, sessionId);
  const sceneId = sceneKey(actor.sceneIdx);
  markDead(room, targetId!, 'derringer', sessionId);
  spawnBody(room, sceneId, targetId!, Math.floor(target.x / TILE_PX), Math.floor(target.y / TILE_PX));
  emitNoise(room, sceneId, target.x, target.y, balance.noise.shot, 'shot', sessionId);
  onShotArrival(room, sessionId, targetId === contract.target);
}

/** The reason of `validateKill`'s verdict, as the Knife's (`Kill.ts` keeps its own copy until x1 lands). */
function refusalOf(verdict: { code: number; msg: string }): Refusal {
  if (verdict.code === REASON_CODE.PHASE_CLOSED) return refusal('PHASE_CLOSED');
  if (verdict.code === REASON_CODE.BUSY) return refusal('BUSY');
  if (verdict.code === REASON_CODE.TOO_FAR) return refusal('TOO_FAR', { of: 'person' });
  return refusal(verdict.msg === 'not now' ? 'NOT_IN_PLAY' : 'NO_TARGET');
}
