import { TICK_RATE } from '@wdi/shared';

// Implementation constants of the movement stage. The rules numbers (speeds, door noise, transit time)
// are read from balance.json; the few below are not rules and are recorded in ARCHITECTURE 5.6.

/** Position ring length: 250 ms of history for the kill range slack (ARCHITECTURE 5.6). */
export const POSITION_RING_TICKS = (TICK_RATE * 250) / 1000;
/** Half the collision box side in pixels: a 0.5-tile square under the feet. */
export const FOOT_HALF_PX = 16;
/** An input not refreshed for this many ticks stops the player (a dead tab must not keep walking). */
export const INPUT_STALE_TICKS = 5;
/** How close a player must stand to a portal tile centre to use it, in tiles. */
export const PORTAL_REACH_TILES = 1.5;
/** `Presence.animId` values. One shared `swing` id covers every strike so it never discriminates a role. */
export const AnimId = { idle: 0, walk: 1, swing: 2, die: 3 } as const;
/** `Presence.statusBits`. */
export const StatusBit = { transit: 1 } as const;
