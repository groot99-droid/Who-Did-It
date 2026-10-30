import { balance, metrics } from '@wdi/content';
import { TICK_RATE, TILE_PX } from '@wdi/shared';

// Implementation constants of the movement stage. Rules numbers and world metrics (speeds, door reach,
// the collision box, transit time) are read from @wdi/content; the rest are netcode and are recorded in
// ARCHITECTURE 5.6.

/** Position ring length: 250 ms of history for the kill range slack (ARCHITECTURE 5.6). */
export const POSITION_RING_TICKS = (TICK_RATE * 250) / 1000;
/** Half the collision box side in pixels (metrics.json `collisionBoxTiles`, WORLD 4.2). */
export const FOOT_HALF_PX = (metrics.collisionBoxTiles * TILE_PX) / 2;
/**
 * An input not refreshed for this many ticks stops the player (a dead tab must not keep walking). Ten since round 10
 * (A373): at 20 Hz input and one patch per tick, five let a hiccup of two lost frames stop a walking seat.
 */
export const INPUT_STALE_TICKS = 10;
/** How close a player must stand to a portal tile centre to use it (balance.json `doors.reachTiles`, GDD 3.7). */
export const PORTAL_REACH_TILES = balance.doors.reachTiles;
/**
 * `Presence.animId` values. One shared `swing` id covers every strike and one shared `interact` id every hold,
 * so neither tells a role or an action apart (GDD 3.12 "Animation").
 */
export const AnimId = {
  idle: 0,
  walk: 1,
  swing: 2,
  die: 3,
  interact: 4,
  // Round 8 (docs/round8/seams.md 2; append-only). The server sends the one-shots (`strike`, `hurt`, `knockdown`,
  // `getup`, `inspect`, `threaten`, `eat`, `rob`) and the mood idles (`cower`, `fidget`, `stomp`); the client picks
  // the gaits (`run`, `limp`, `stagger`) and the `stunned` and `down` loops from speed and `statusBits`.
  strike: 5,
  hurt: 6,
  knockdown: 7,
  down: 8,
  getup: 9,
  run: 10,
  limp: 11,
  stagger: 12,
  stunned: 13,
  inspect: 14,
  threaten: 15,
  cower: 16,
  fidget: 17,
  stomp: 18,
  eat: 19,
  rob: 20,
} as const;
/**
 * `Presence.statusBits` and `Avatar.statusBits`; `ghost` marks a dead seat's avatar (GDD 3.17, Session 5F); `lantern`
 * a lit lantern or torch in hand (GDD 3.15, round 6, Session 6G sets and copies it; nothing sets it before).
 */
export const StatusBit = {
  transit: 1,
  bloody: 2,
  ghost: 4,
  lantern: 8,
  // Round 8 (GDD 3.22, docs/round8/seams.md 2; append-only): a bit carries only what the drawn figure shows.
  /** Slowed or Wounded: the `limp` gait. */
  limp: 16,
  /** Bleeding: a drip trail and a red tick on the blood pass. */
  bleeding: 32,
  /** Poisoned: a green cast. */
  poisoned: 64,
  /** Fatigued: the `stagger` gait. */
  fatigued: 128,
  /** Stunned: the `stunned` loop, with sparks. */
  stunned: 256,
  /** Dazed: the `stagger` gait, with wobbling stars. */
  dazed: 512,
  /** Knocked out: the `down` loop. */
  down: 1024,
} as const;
