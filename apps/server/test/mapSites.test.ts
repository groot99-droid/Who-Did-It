import { describe, expect, it } from 'vitest';
import { SCENE_IDS } from '@wdi/content';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import {
  bellOf,
  hubOf,
  kitChestOf,
  mapIdOfRoom,
  mapScenesOf,
  meetingSpawnsOf,
  startSpawnsOf,
  teachingClueOf,
} from '../src/sim/MapSites';

/** A room on the default map: the only field the map helpers may read is `settings.map`. */
const room = { state: { settings: { map: 'hollowmere' } } } as unknown as PartyRoom;
const square = Array.from({ length: 10 }, (_, i) => ({ sceneId: 'overworld', spawn: `square_${i}` }));

describe('map sites (GDD 3.13, round 5 X5)', () => {
  it('gives Hollowmere the sites the server used before maps', () => {
    expect(mapIdOfRoom(room)).toBe('hollowmere');
    expect(hubOf(room)).toBe('overworld');
    expect(startSpawnsOf(room)).toEqual(square);
    expect(meetingSpawnsOf(room)).toEqual(square);
    expect(bellOf(room)?.id).toBe('ov.bell');
    expect(teachingClueOf(room)?.id).toBe('ov.teaching_clue');
    expect(kitChestOf(room)?.id).toBe('ov.chest');
    // The 15 scenes of 2026-10-10, then the Fenwood and the Flooded Gallery; Blackpine's are not Hollowmere's.
    expect([...mapScenesOf(room)]).toEqual(SCENE_IDS.slice(0, 17));
  });
});
