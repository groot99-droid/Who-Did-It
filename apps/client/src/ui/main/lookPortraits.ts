import type { MeetingPlayer } from '../../net/meeting';

/**
 * Main-mode meeting portraits by public look (GDD 3.17): fills a seat's portrait slot from `seat.look`.
 * `ui/Meeting.ts` calls it for every main-mode seat after drawing today's trait portrait into `root`. Pre-seeded as
 * a stub that leaves today's portrait in place; Session 5G builds it behind this signature (round 5, X6).
 */
export function renderLookPortrait(_root: HTMLElement, _seat: MeetingPlayer): void {
  // Pre-seed: today's portrait, already drawn by the meeting screen, stays.
}

/**
 * The reveal line for an ejected seat's look, e.g. "walking as the Baker" (GDD 3.17); `ui/Meeting.ts` appends it to
 * the main-mode ejection line when it is not empty. Pre-seed stub: ''.
 */
export function revealLookLine(_look: string): string {
  return '';
}
