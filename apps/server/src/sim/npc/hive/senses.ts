import { balance, type SceneId } from '@wdi/content';
import { TICK_RATE, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../../rooms/PartyRoom';
import { type PlayerSim, simOf } from '../../RoomSim';
import { canSee } from '../../Sight';
import { sceneIndex } from '../../World';
import { npcMemory } from '../memory';
import { type Fact, hiveOf } from './board';

/**
 * Fair senses (round 8, 8R, A174, A176; living.md 3): an NPC perceives exactly what a human in its place would.
 * **Sight** goes through `canSee` (sim/Sight.ts, 8L's night sight): by day an ordinary scene is seen whole; at night,
 * in the Final Night and in a dark scene a point is seen only within the night radius, plus the lantern of a seat
 * whose light burns, or inside a burning light's pool, and along a clear line over the sight grid. A body or a clue
 * holds no light of its own. **Hearing** is `emitNoise`'s NPC listener: every NPC seat placed in the scene within the
 * noise's radius hears it, as a client there would, and the board keeps it as a public fact.
 */

/** Whether the seat standing at `p` sees the point (x, y) of scene `sceneIdx`. */
export function seesPoint(room: PartyRoom, p: PlayerSim, sceneIdx: number, x: number, y: number): boolean {
  if (p.sceneIdx !== sceneIdx) return false;
  // A point is a figure with no seat: no lantern of its own and no transit tail, so `canSee` reads only x, y, scene.
  return canSee(room, p, { sceneIdx, x, y } as PlayerSim);
}

/** Whether the seat standing at `p` sees a fact of the board where it lies. */
export const seesFact = (room: PartyRoom, p: PlayerSim, fact: Fact): boolean =>
  seesPoint(room, p, sceneIndex(fact.sceneId), fact.x, fact.y);

const heard = new WeakMap<PartyRoom, Map<string, Fact[]>>();
function heardOf(room: PartyRoom): Map<string, Fact[]> {
  let map = heard.get(room);
  if (!map) heard.set(room, (map = new Map()));
  return map;
}

/**
 * `emitNoise`'s NPC listeners (one line in sim/Noise.ts, granted by 6Z): the noise goes on the board, and every NPC
 * seat placed in `sceneId` within `radiusTiles` of (x, y), except `exceptId`, hears it.
 */
export function hearNoise(
  room: PartyRoom,
  sceneId: SceneId,
  x: number,
  y: number,
  radiusTiles: number,
  kind: string,
  exceptId: string,
): void {
  const fact = hiveOf(room).hear('noise', sceneId, x, y, room.state.tick, kind);
  const sim = simOf(room);
  const idx = sceneIndex(sceneId);
  const reach = radiusTiles * TILE_PX;
  const all = heardOf(room);
  for (const seat of npcMemory(room).ids) {
    const p = sim.players.get(seat);
    if (seat === exceptId || !p?.placed || p.sceneIdx !== idx) continue;
    if (Math.hypot(p.x - x, p.y - y) > reach) continue;
    const list = all.get(seat) ?? [];
    list.push(fact);
    all.set(seat, list);
  }
}

/** The noises this NPC seat heard in the last `npc.hive.memoryS`, oldest first. */
export function heardBy(room: PartyRoom, seat: string): readonly Fact[] {
  const list = heardOf(room).get(seat);
  if (!list) return [];
  const since = room.state.tick - Math.round(balance.npc.hive.memoryS * TICK_RATE);
  while (list.length > 0 && (list[0] as Fact).tick < since) list.shift();
  return list;
}
