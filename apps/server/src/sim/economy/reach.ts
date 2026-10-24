import { balance, scenes } from '@wdi/content';
import { TILE_PX } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { simOf } from '../RoomSim';
import { sceneKey, tileCentre } from '../World';

/** Whether a living, placed seat stands within verb reach of one of the props `ids` in its own scene (GDD 3.23). */
export function nearProp(room: PartyRoom, seat: string, ids: readonly string[]): boolean {
  const p = simOf(room).players.get(seat);
  if (!p || p.dead || !p.placed) return false;
  const reach = balance.doors.reachTiles * TILE_PX;
  return (scenes[sceneKey(p.sceneIdx)]?.props ?? []).some(
    (prop) =>
      ids.includes(prop.id) &&
      Math.hypot(p.x - tileCentre(prop.x, TILE_PX), p.y - tileCentre(prop.y, TILE_PX)) <= reach,
  );
}
