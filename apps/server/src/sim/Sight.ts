import type { PartyRoom } from '../rooms/PartyRoom';
import type { PlayerSim } from './RoomSim';

/**
 * Dark visibility (round 6, M5b, GDD 3.7 and 3.15; docs/round6/m5b-data.md 2.2): whether a living viewer in a dark
 * scene, or at night, can see a point: within `vision.nightTiles` (plus `vision.lanternTiles` for a lit carrier or a
 * lit target) and in line of sight over the scene's nav grid. `reconcileAvatars` (sim/Visibility.ts) filters a
 * living viewer's wanted set through it and only ever removes. Ghosts and the admin view see everything. Pre-seeded
 * by 6Z as always true; Session 6G fills it.
 */
export function canSee(_room: PartyRoom, _viewer: PlayerSim, _target: PlayerSim): boolean {
  return true; // 6G
}
