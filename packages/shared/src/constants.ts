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
/** Start needs this many players in the lobby (ARCHITECTURE 5.3). */
export const MIN_PLAYERS_TO_START = 4;
export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 16;

/** Join code: 5 characters from an alphabet without 0/O/1/I (GDD 2. Create / Join). */
export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Hard cap on messages per second per client (ARCHITECTURE 5.11). */
export const MAX_MESSAGES_PER_SECOND = 100;

// Light and vision (GDD 3.x).
export const VISION_DAY_TILES = 7;
export const VISION_NIGHT_TILES = 3.5;
export const CHILD_VISION_PENALTY_TILES = 1;
export const LANTERN_LIGHT_TILES = 4;
export const CANDLE_LIGHT_TILES = 2;
export const WOLF_FLEE_LIGHT_TILES = 4;

// Noise radii (GDD 3.x "Stealth and noise").
export const NOISE_TILES = {
  walk: 2,
  run: 6,
  door: 4,
  killScream: 8,
  rag: 4,
  skeletonKey: 5,
  crowbar: 10,
  bolt: 10,
} as const;

/** Blood on a killer's sprite reads as "Bloody" within this many tiles (GDD 3.x clues). */
export const BLOOD_VISIBLE_TILES = 3;
/** The Child's witness line of sight (GDD 3.2). */
export const CHILD_WITNESS_TILES = 6;
/** Doctor's Bandage witnesses (GDD 3.2). */
export const BANDAGE_WITNESS_TILES = 3;
/** Both players within this distance of the co-op task node (GDD 3.x tasks). */
export const COOP_TASK_TILES = 2;
/** Speech bubbles of the quick-chat wheel (GDD 3.x communication). */
export const QUICK_CHAT_TILES = 5;
/** The forest gate's safe clearing (GDD 3.x PvE). */
export const FOREST_SAFE_CLEARING_TILES = 6;
/** Quick mode acts need the actor within this distance of the target prop (GDD 3.11). */
export const ONUB_ACT_TILES = 2;
