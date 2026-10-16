import type { SceneId } from '@wdi/content';
import { S2C, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { simOf } from './RoomSim';
import { sceneIndex } from './World';

/**
 * Sends `noise` to everyone placed in `sceneId` within `radiusTiles` of (x, y), except `exceptId`.
 * Ghosts hear it like anyone; they never make any (A30).
 */
export function emitNoise(
  room: PartyRoom,
  sceneId: SceneId,
  x: number,
  y: number,
  radiusTiles: number,
  kind: string,
  exceptId: string,
): void {
  const sim = simOf(room);
  const reach = radiusTiles * TILE_PX;
  const idx = sceneIndex(sceneId);
  for (const client of room.clients) {
    const player = room.state.players.get(client.sessionId);
    const p = sim.players.get(client.sessionId);
    if (!player || !p?.placed || client.sessionId === exceptId || p.sceneIdx !== idx) continue;
    if (Math.hypot(p.x - x, p.y - y) <= reach) {
      client.send(S2C.noise, { sceneId, x: Math.round(x), y: Math.round(y), kind });
    }
  }
}
