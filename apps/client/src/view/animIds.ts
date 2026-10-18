/**
 * `Presence.animId` values; mirrors apps/server/src/sim/constants.ts. One `swing` id serves every strike, one
 * `interact` id every hold.
 */
export const AnimId = { idle: 0, walk: 1, swing: 2, die: 3, interact: 4 } as const;
/** `Presence.statusBits` and `Avatar.statusBits`; `ghost` marks a dead seat's avatar (GDD 3.17, Session 5F). */
export const StatusBit = { transit: 1, bloody: 2, ghost: 4 } as const;
