// GDD 3.13 and WORLD 4.3: the places of the room's map that the server uses, in one file (round 5, X5). Every
// site that named 'overworld', a `square_<n>` spawn, `ov.bell` or `ov.teaching_clue` calls these instead.
// The room plays the leader's pick, `Settings.map`; Session 5J owns the bodies. No other file names a map's hub,
// spawns or props.
import { MAP_IDS, mapIdOf, maps, scenes, type MapId, type Prop, type SceneId } from '@wdi/content';
import type { PartyRoom } from '../rooms/PartyRoom';

/** A spawn of a map: the scene and the spawn id inside it. */
export interface SpawnSite {
  sceneId: SceneId;
  spawn: string;
}

interface Sites {
  hub: SceneId;
  scenes: readonly SceneId[];
  startSpawns: readonly SpawnSite[];
  meetingSpawns: readonly SpawnSite[];
  bell: Prop | undefined;
  teachingClue: Prop | undefined;
  kitChest: Prop | undefined;
}

const siteOf = (ref: string): SpawnSite => {
  const dot = ref.indexOf('.');
  return { sceneId: ref.slice(0, dot) as SceneId, spawn: ref.slice(dot + 1) };
};

/** Built once per process from `maps/<id>.json` (immutable, shared by every room). */
const SITES = new Map<MapId, Sites>(
  MAP_IDS.map((id) => {
    const map = maps[id];
    const prop = (propId: string) => scenes[map.hub].props.find((p) => p.id === propId);
    return [
      id,
      {
        hub: map.hub,
        scenes: map.scenes,
        startSpawns: map.startSpawns.map(siteOf),
        meetingSpawns: map.meetingSpawns.map(siteOf),
        bell: prop(map.bell),
        teachingClue: prop(map.teachingClue),
        kitChest: prop(map.kitChest),
      },
    ] as const;
  }),
);

const sitesOf = (room: PartyRoom): Sites => SITES.get(mapIdOfRoom(room))!;

/** The map the room plays (GDD 3.13): `Settings.map`, or the default map when it names none. */
export function mapIdOfRoom(room: PartyRoom): MapId {
  return mapIdOf(room.state.settings.map);
}

/** The hub: the exterior with the Emergency Bell, where the seats start and meetings spread everyone. */
export function hubOf(room: PartyRoom): SceneId {
  return sitesOf(room).hub;
}

/** First placement spreads the seats over these, by ordinal (M3); at least `players.max` of them. */
export function startSpawnsOf(room: PartyRoom): readonly SpawnSite[] {
  return sitesOf(room).startSpawns;
}

/** Everyone is spread over these, by ordinal, when a meeting opens and again at immunity; at least `players.max`. */
export function meetingSpawnsOf(room: PartyRoom): readonly SpawnSite[] {
  return sitesOf(room).meetingSpawns;
}

/** The Emergency Bell prop on the hub (`act.bell`). */
export function bellOf(room: PartyRoom): Prop | undefined {
  return sitesOf(room).bell;
}

/** The prop on the hub where the grace-phase teaching clue lies (GDD 2 step 5). */
export function teachingClueOf(room: PartyRoom): Prop | undefined {
  return sitesOf(room).teachingClue;
}

/** The kit chest prop on the hub. No server code reads it yet; a session that does calls this. */
export function kitChestOf(room: PartyRoom): Prop | undefined {
  return sitesOf(room).kitChest;
}

/** The scenes of the room's map (GDD 3.13: a closed graph; every portal stays inside it). */
export function mapScenesOf(room: PartyRoom): readonly SceneId[] {
  return sitesOf(room).scenes;
}
