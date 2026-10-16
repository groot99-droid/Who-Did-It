// Every radius is in tiles and is named by docs/GDD.md (3.x) or docs/ARCHITECTURE.md; balance numbers
// stay in packages/content/data/balance.json. Nothing here is invented.

export const TILE_PX = 64;

/** Server tick rate (ARCHITECTURE 5.6). */
export const TICK_RATE = 20;
/** `patchRate` in ms (ARCHITECTURE 5.6). */
export const PATCH_RATE_MS = 50;
/** `Visibility.ts` reconcile every N ticks, i.e. 5 Hz (ARCHITECTURE 5.6). */
export const VIEW_RECONCILE_EVERY_TICKS = 4;

export const MAX_PLAYERS = 10;
/** Lower bound of the party size used for the scene profile (balance.json `players.min`, GDD 3.9); Start itself needs one human (A28). */
export const MIN_PLAYERS_TO_START = 4;
export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 16;

/** Join code: 5 characters from an alphabet without 0/O/1/I (GDD 2. Create / Join). */
export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Hard cap on messages per second per client (ARCHITECTURE 5.11). */
export const MAX_MESSAGES_PER_SECOND = 100;

/** `Clue.kind` indices, frozen; the ids are the keys of `clues.json` (GDD 3.4). */
export const ClueKind = {
  footprints: 0,
  thread: 1,
  felt: 2,
  fingerprint: 3,
  smear: 4,
  wetBucket: 5,
  dragSmear: 6,
  fur: 7,
  clawMarks: 8,
} as const;
export type ClueKindId = (typeof ClueKind)[keyof typeof ClueKind];

/** `NotebookEntry.status` values (GDD 3.4; `teaching` is the grace-phase clue of GDD 2 step 5). */
export const NotebookStatus = {
  claimed: 0,
  verified: 1,
  corroborated: 2,
  forged: 3,
  teaching: 4,
} as const;

/**
 * Quick mode (GDD 3.11, A39): sleepers are moved to the `loft` pseudo-scene, index 255 in
 * `Player.sceneId`, which has no SceneState and encodes no presence. It is not a content scene.
 */
export const LOFT_SCENE_ID = 'loft';
export const LOFT_SCENE_INDEX = 255;

/** Quick-mode act ids (`act.ability`) start with this prefix (ARCHITECTURE 5.14). */
export const ONUB_ACT_PREFIX = 'onub.';
/** The dusk plate-setting act (GDD 3.11): not a night window act, so not in `balance.onub.json` acts. */
export const ONUB_SET_PLATE = 'onub.setPlate';

/** `Settings.npcDifficulty` values, in the order of balance.json `npc.difficulty` (GDD 3.12). */
export const NpcLevel = { easy: 0, normal: 1, hard: 2 } as const;
export type NpcLevelId = (typeof NpcLevel)[keyof typeof NpcLevel];

// Gameplay radii, light, noise and timers are rules numbers: they live once, in
// packages/content/data/balance.json (GDD 3.x), and are read through @wdi/content.
