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
/**
 * `Presence.animId` values. One shared `swing` id covers every strike and one shared `interact` id every hold,
 * so neither tells a role or an action apart (GDD 3.12 "Animation").
 */
export const AnimId = { idle: 0, walk: 1, swing: 2, die: 3, interact: 4 } as const;
/**
 * `Presence.statusBits` and `Avatar.statusBits`; `ghost` marks a dead seat's avatar (GDD 3.17, Session 5F); `lantern`
 * a lit lantern or torch in hand (GDD 3.15, round 6, Session 6G sets and copies it; nothing sets it before).
 */
export const StatusBit = { transit: 1, bloody: 2, ghost: 4, lantern: 8 } as const;
