import type { PartyRoom } from '../../rooms/PartyRoom';
import { addStack, canAdd } from '../Inventory';
import { wear } from '../interact/resolve';
import { type MobBody, mobBodies } from '../Mobs';
import { MobState } from '../mobs/ai';
import { reject, sceneKey } from '../World';
import { inReach, openVerb, startCooldown } from './verbs';

/**
 * Skinning (round 10, D6b; GDD 3.22, logic-table 8.4): `act.ability {abilityId: 'skin'}` takes the hide and the game
 * its `mobs.json` row names off the nearest fallen creature in reach, once, and wears the Skinning knife one use. The
 * knife is neutral kit (`roleBound` false) and the Killer's Knife has no part in it. Nothing is announced: no noise,
 * no clue and nothing on the wire; the corpse's row leaves the scene `body.creatureCorpseS` after it fell as before.
 */
const SKINNED = new WeakSet<MobBody>();

export function handleSkin(room: PartyRoom, sessionId: string): void {
  const v = openVerb(room, sessionId, 'skin');
  if (!v) return;
  const scene = room.state.scenes.get(sceneKey(v.actor.sceneIdx));
  let best: MobBody | undefined;
  let bestD = Infinity;
  for (const mob of mobBodies(room).values()) {
    if (
      mob.site.sceneIdx !== v.actor.sceneIdx ||
      mob.mind.state !== MobState.dead ||
      SKINNED.has(mob) ||
      !scene?.mobs.has(mob.id) ||
      !inReach(v, mob.x, mob.y)
    )
      continue;
    const d = Math.hypot(mob.x - v.actor.x, mob.y - v.actor.y);
    if (d < bestD) [best, bestD] = [mob, d];
  }
  const yields = best?.def.skin;
  if (!best || !yields || yields.hide + yields.game === 0) {
    reject(room, sessionId, 'NO_TARGET');
    return;
  }
  const want: [string, number][] = [
    ['hide', yields.hide],
    ['game', yields.game],
  ];
  if (want.some(([item, qty]) => qty > 0 && !canAdd(v.player, item, qty))) {
    reject(room, sessionId, 'PACK_FULL');
    return;
  }
  SKINNED.add(best);
  for (const [item, qty] of want) if (qty > 0) addStack(v.player, item, qty);
  wear(room, sessionId, v.player, 'skinningKnife', 1);
  startCooldown(v);
}
