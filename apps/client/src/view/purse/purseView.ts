/** What the purse counter shows after a change: the amount, and the change since the last reading (0 for none). */
export interface PurseReading {
  amount: number;
  delta: number;
}

/**
 * The purse counter's next reading (UI.md 14.34.2). The first reading of a World (`prev` null) is the amount alone,
 * so entering a scene never shows the whole purse as a gain.
 */
export function readPurse(prev: number | null, next: number): PurseReading {
  return { amount: next, delta: prev === null ? 0 : next - prev };
}
