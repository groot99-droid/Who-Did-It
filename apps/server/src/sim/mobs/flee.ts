import { TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { type MobBody, mobBodies } from '../Mobs';
import type { PlayerSim } from '../RoomSim';
import { MobState } from './ai';
import type { Brain } from '../npc/memory';
import { openPortals, walkThrough, walkTo } from '../npc/walk';

/**
 * An NPC seat runs from a creature like a frightened player (GDD 3.12, 3.15): while a creature of its scene chases
 * it, it makes for the nearest open portal of the scene and takes it; with no portal it runs straight away from the
 * creature, as far as the creature senses. Returns whether it drove the seat this tick. Card-blind and draw-free.
 *
 * Called from `runWorldNpc` (`sim/npc/world.ts`) before the body reaction, through the line the 6G PR requests;
 * until it lands, nothing calls it and an NPC seat ignores the creatures.
 */
export function fleeCreature(room: PartyRoom, id: string, brain: Brain, p: PlayerSim): boolean {
  let hunter: MobBody | null = null;
  for (const body of mobBodies(room).values()) {
    if (body.mind.state === MobState.chase && body.mind.prey === id && body.site.sceneIdx === p.sceneIdx) {
      hunter = body;
      break;
    }
  }
  if (hunter === null) return false;
  let door = null;
  let best = Infinity;
  for (const q of openPortals(room, p)) {
    const d = Math.hypot((q.x + 0.5) * TILE_PX - p.x, (q.y + 0.5) * TILE_PX - p.y);
    if (d < best) {
      best = d;
      door = q;
    }
  }
  if (door && walkThrough(room, brain, p, id, door) !== 'stuck') return true;
  const dx = p.x - hunter.x;
  const dy = p.y - hunter.y;
  const d = Math.hypot(dx, dy) || 1;
  const away = hunter.def.senseTiles * TILE_PX; // out of its senses
  return walkTo(room, brain, p, p.x + (dx / d) * away, p.y + (dy / d) * away, TILE_PX) === 'walking';
}
