import { onubBalance, scenes } from '@wdi/content';
import { ONUB_SET_PLATE, Phase, TICK_RATE, TILE_PX, type PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { handleOnubAbility, onubNpcPlan, plateOf } from '../Onub';
import type { PlayerSim } from '../RoomSim';
import { isLoft, sceneKey, tileCentre } from '../World';
import type { Brain, NpcMemory } from './memory';
import { stand, walkTo } from './walk';

/** The plate is set at most this many times: an already-set plate refuses harmlessly. */
const PLATE_SEND_LIMIT = 3;

const propCentre = (propId: string): { x: number; y: number } | null => {
  const prop = scenes.bakery.props.find((q) => q.id === propId);
  return prop ? { x: tileCentre(prop.x, TILE_PX), y: tileCentre(prop.y, TILE_PX) } : null;
};

/**
 * Quick mode (GDD 3.11, 3.12): at dusk an NPC walks to its plate and sets it; in the loft it does
 * nothing; woken by the Conductor it walks to the target of its plan and sends that act once. The Conductor
 * applies the plan itself if it never arrives.
 */
export function runOnubNpc(
  room: PartyRoom,
  mem: NpcMemory,
  brain: Brain,
  player: PlayerState,
  p: PlayerSim,
): void {
  if (p.dead || !p.placed || isLoft(p.sceneIdx) || !mem.walk || sceneKey(p.sceneIdx) !== 'bakery')
    return stand(p);
  const reach = onubBalance.actRangeTiles * TILE_PX;
  const tick = room.state.tick;
  const id = player.id;

  if (room.state.phase === Phase.dusk) {
    const plateId = plateOf(room, id);
    const at = plateId === null ? null : propCentre(plateId);
    if (plateId === null || at === null) return stand(p);
    if (walkTo(room, brain, p, at.x, at.y, reach) !== 'arrived') return;
    if (brain.plateSends < PLATE_SEND_LIMIT && tick - brain.lastPlateSendTick >= TICK_RATE) {
      brain.plateSends++;
      brain.lastPlateSendTick = tick;
      handleOnubAbility(room, id, { abilityId: ONUB_SET_PLATE, targetId: plateId });
    }
    return;
  }

  if (room.state.phase === Phase.night) {
    const plan = onubNpcPlan(room, id);
    if (plan === null) return stand(p);
    const key = JSON.stringify(plan);
    if (brain.sentPlan === key) return stand(p);
    const first = propCentre(plan.targetId);
    const second = plan.targetId2 === undefined ? first : propCentre(plan.targetId2);
    if (first === null || second === null) return stand(p);
    const mid = { x: (first.x + (second?.x ?? first.x)) / 2, y: (first.y + (second?.y ?? first.y)) / 2 };
    if (walkTo(room, brain, p, mid.x, mid.y, reach) !== 'arrived') return;
    brain.sentPlan = key;
    handleOnubAbility(room, id, {
      abilityId: plan.abilityId,
      targetId: plan.targetId,
      ...(plan.targetId2 !== undefined && { targetId2: plan.targetId2 }),
    });
    return;
  }
  stand(p);
}
