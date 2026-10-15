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

// Gameplay radii, light, noise and timers are rules numbers: they live once, in
// packages/content/data/balance.json (GDD 3.x), and are read through @wdi/content.
