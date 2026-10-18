import { PROFILE_RANK, SCENE_IDS, type Profile, type SceneId, abilities, navs, scenes } from '@wdi/content';
import { ErrorCode, LOFT_SCENE_INDEX, NavGrid, Phase, S2C } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';

/** Scene ids by `Player.sceneId` index; the order is the frozen id list of @wdi/content. */
export const SCENE_KEYS: readonly SceneId[] = SCENE_IDS;

export const sceneKey = (sceneIndex: number): SceneId => SCENE_KEYS[sceneIndex] ?? 'overworld';
/**
 * The quick-mode loft (A39): a `PlayerSim.sceneIdx` of `LOFT_SCENE_INDEX` is in no content scene; the
 * sim neither moves nor encodes such a player and their view holds no scene and no presence.
 */
export const isLoft = (sceneIndex: number): boolean => sceneIndex === LOFT_SCENE_INDEX;
export const sceneIndex = (id: string): number => SCENE_KEYS.indexOf(id as SceneId);
export const isSceneId = (id: string): id is SceneId => sceneIndex(id) >= 0;

/**
 * Phases in which players walk the village. Lobby and the role card are before it; meetings, the
 * reveal and game over are after it (meetings run their own transition path, ARCHITECTURE 5.7).
 */
const WORLD_PHASES = new Set<number>([
  Phase.grace,
  Phase.day,
  Phase.dusk,
  Phase.night,
  Phase.dawn,
  Phase.immunity,
  Phase.finalNight,
]);
export const isWorldPhase = (phase: number): boolean => WORLD_PHASES.has(phase);

export const profileOpen = (min: Profile, at: Profile): boolean => PROFILE_RANK[min] <= PROFILE_RANK[at];

/** Nav grids per scene and profile; built once per process (immutable, shared by every room). */
const grids = new Map<string, NavGrid>();
export function navGrid(id: SceneId, profile: Profile): NavGrid {
  const key = `${id}:${profile}`;
  let grid = grids.get(key);
  if (!grid) {
    grid = new NavGrid(navs[id], profile);
    grids.set(key, grid);
  }
  return grid;
}

export const sceneDef = (id: SceneId) => scenes[id];

/** Centre of a tile in pixels. */
export const tileCentre = (t: number, tilePx: number): number => (t + 0.5) * tilePx;

/** The phases `abilities.json` `kill.phases` names (GDD 3.3, M5a: after dark only); absent, every verb phase. */
const KILL_PHASES: ReadonlySet<number> | null = abilities.abilities.kill?.phases
  ? new Set(abilities.abilities.kill.phases.map((name) => Phase[name]))
  : null;

/** Phases in which the Knife works: `kill.phases` of `abilities.json`. */
export const isKillPhase = (phase: number): boolean =>
  KILL_PHASES === null ? isVerbPhase(phase) : KILL_PHASES.has(phase);

/** Phases in which a verb works: the world phases but the immunity window after a meeting (A30). */
export const isVerbPhase = (phase: number): boolean => isWorldPhase(phase) && phase !== Phase.immunity;

/** Sends one refusal to one client (the `error` message of ARCHITECTURE 5.5). */
export function reject(room: PartyRoom, sessionId: string, code: ErrorCode, msg: string): void {
  room.clients.getById(sessionId)?.send(S2C.error, { code, msg });
}
