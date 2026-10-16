import type { SceneId } from '@wdi/content';
import { Body, TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { tileCentre } from './World';

/** Spawns the public Body of a dead player on its tile in `sceneId` (id `body_<playerId>`, A30). */
export function spawnBody(room: PartyRoom, sceneId: SceneId, victimId: string, tx: number, ty: number): void {
  const scene = room.state.scenes.get(sceneId);
  if (!scene) return;
  const body = new Body();
  body.id = `body_${victimId}`;
  body.of = victimId;
  body.x = Math.round(tileCentre(tx, TILE_PX));
  body.y = Math.round(tileCentre(ty, TILE_PX));
  body.hidden = false;
  scene.bodies.set(body.id, body);
}
