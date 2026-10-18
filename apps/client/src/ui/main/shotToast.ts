import type { S2CPayloads } from '@wdi/shared/protocol';

/**
 * The public `shot` broadcast during a reveal (GDD 3.2): the ejected Gamekeeper's Last Shot, its target and the
 * target's role. `ui/Meeting.ts` calls it on every `shot` from the meeting feed. Pre-seeded as a stub that renders
 * nothing; Session 5G builds it behind this signature (round 5, X6).
 */
export function showShotToast(
  _root: HTMLElement,
  _shot: S2CPayloads['shot'],
  _names: (id: string) => string,
): void {
  // Pre-seed: nothing.
}
