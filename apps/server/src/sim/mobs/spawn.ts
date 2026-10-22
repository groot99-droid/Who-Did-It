import { type DayPart, type SceneId, type Spawner, balance, scenes } from '@wdi/content';
import { Phase } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { mapScenesOf } from '../MapSites';
import { simOf } from '../RoomSim';
import { profileOpen, sceneIndex } from '../World';

/** One spawner of the room's map, with the scene it stands in. */
export interface SpawnSite {
  spawner: Spawner;
  scene: SceneId;
  sceneIdx: number;
}

/**
 * The part of the day a phase belongs to (GDD 3.13): grace, day and immunity are `day`; dusk and dawn `dusk`;
 * night and the Final Night `night`; any other phase (the lobby, the card, a meeting, the reveal) none.
 */
export function dayPartOf(phase: number): DayPart | null {
  switch (phase) {
    case Phase.grace:
    case Phase.day:
    case Phase.immunity:
      return 'day';
    case Phase.dusk:
    case Phase.dawn:
      return 'dusk';
    case Phase.night:
    case Phase.finalNight:
      return 'night';
    default:
      return null;
  }
}

/** Whether a spawner's creature is awake in this part of the day (no `phases`: always). */
export const awake = (spawner: Spawner, part: DayPart): boolean =>
  spawner.phases === undefined || spawner.phases.includes(part);

/**
 * The spawners of the room's map, in scenes open at the party's size, at most `mobs.maxPerScene` per scene (the
 * first ones listed). Fixed for a match once the profile is fixed.
 */
export function spawnSites(room: PartyRoom): SpawnSite[] {
  const profile = simOf(room).profile;
  const out: SpawnSite[] = [];
  for (const id of mapScenesOf(room)) {
    const scene = scenes[id];
    if (!profileOpen(scene.profile, profile)) continue;
    for (const spawner of (scene.spawners ?? []).slice(0, balance.mobs.maxPerScene)) {
      out.push({ spawner, scene: id, sceneIdx: sceneIndex(id) });
    }
  }
  return out;
}
