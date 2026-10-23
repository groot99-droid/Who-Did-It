/**
 * `Presence.animId` values; mirrors apps/server/src/sim/constants.ts. One `swing` id serves every strike, one
 * `interact` id every hold.
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
 * a lit lantern or torch in hand (GDD 3.15, round 6; Session 6I draws the glow).
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
