import { balance, metrics } from '@wdi/content';
import { TICK_RATE, TILE_PX } from '@wdi/shared';

// Implementation constants of the movement stage. Rules numbers and world metrics (speeds, door reach,
// the collision box, transit time) are read from @wdi/content; the rest are netcode and are recorded in
// ARCHITECTURE 5.6.

/** Position ring length: 250 ms of history for the kill range slack (ARCHITECTURE 5.6). */
export const POSITION_RING_TICKS = (TICK_RATE * 250) / 1000;
/** Half the collision box side in pixels (metrics.json `collisionBoxTiles`, WORLD 4.2). */
export const FOOT_HALF_PX = (metrics.collisionBoxTiles * TILE_PX) / 2;
/** An input not refreshed for this many ticks stops the player (a dead tab must not keep walking). */
export const INPUT_STALE_TICKS = 5;
/** How close a player must stand to a portal tile centre to use it (balance.json `doors.reachTiles`, GDD 3.7). */
export const PORTAL_REACH_TILES = balance.doors.reachTiles;
/** `Presence.animId` values. One shared `swing` id covers every strike so it never discriminates a role. */
export const AnimId = { idle: 0, walk: 1, swing: 2, die: 3 } as const;
/** `Presence.statusBits`. */
export const StatusBit = { transit: 1 } as const;
