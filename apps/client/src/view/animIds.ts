/** `Presence.animId` values; mirrors apps/server/src/sim/constants.ts. One `swing` id serves every strike. */
export const AnimId = { idle: 0, walk: 1, swing: 2, die: 3 } as const;
/** `Presence.statusBits`. */
export const StatusBit = { transit: 1, bloody: 2 } as const;
