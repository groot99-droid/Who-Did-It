import { z } from 'zod';
import { GddRef, PrefixedId } from './common.js';
import { SCENE_IDS } from './scene.js';

/**
 * Map ids in lobby order, append-only (WORLD 4.3); `Settings.map` holds one of them. A new map's id goes at the
 * end in the same pull request as its file.
 */
export const MAP_IDS = ['hollowmere', 'blackpine'] as const;
export const MapId = z.enum(MAP_IDS);
export type MapId = z.infer<typeof MapId>;
/** `Settings.map` of a new party (the schema default, GDD 3.13). */
export const DEFAULT_MAP: MapId = 'hollowmere';

const SceneIdEnum = z.enum(SCENE_IDS);

/** A spawn as `<scene id>.<spawn id>`, e.g. `overworld.square_0`. */
export const SpawnRef = z
  .string()
  .regex(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, 'spawn refs look like `overworld.square_0`');

/** GDD 3.13: a closed graph of scenes the leader picks in the lobby. */
export const MapFile = z.strictObject({
  id: MapId,
  name: z.string().min(1).max(24),
  /** One line under the name in the lobby's map row. */
  blurb: z.string().min(1).max(120),
  /** Modes the map is offered in. The quick mode does not walk, so the M5a maps list only `main`. */
  modes: z.array(z.enum(['main', 'onub'])).min(1),
  /** Art set of the map's ground and walls: `iso_ground_<theme>` and `iso_kit_<theme>` (SPRITES 10.13). */
  theme: z.enum(['harbour', 'timber']),
  scenes: z.array(SceneIdEnum).min(1),
  /** The exterior with the Emergency Bell, open at every party size. */
  hub: SceneIdEnum,
  /** First placement spreads the seats over these in seat order (M3); at least `players.max`. */
  startSpawns: z.array(SpawnRef).min(1),
  /** Everyone is spread over these when a meeting ends; at least `players.max`. */
  meetingSpawns: z.array(SpawnRef).min(1),
  /** Prop ids on the hub: the Emergency Bell, the grace-phase teaching clue and the kit chest. */
  bell: PrefixedId,
  teachingClue: PrefixedId,
  kitChest: PrefixedId,
  /** Round 7: the hub spawn where the Daily Train stops (GDD 3.3); a map without one has no Train. */
  station: SpawnRef.optional(),
  /** Manifest key of the lobby thumbnail (`type: image`). */
  thumbnail: z.string().regex(/^thumb_[a-z]+$/),
  worldRef: GddRef,
  gddRef: GddRef,
});
export type MapFile = z.infer<typeof MapFile>;
