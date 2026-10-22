/**
 * The cutscene timeline (round 6, docs/round6/cutscene-music.md 1.3): pure, Phaser-free, unit-tested. `planTimeline`
 * turns a cutscene's steps into absolute start times (`withPrevious` resolved, the whole clamped to `maxS`);
 * `advance` says which entries start, run and end at a time. Pre-seeded by 6Z with throwing bodies; Session 6J fills
 * them.
 */
export interface TimelineStep {
  t: string;
  durationS?: number;
  withPrevious?: boolean;
  [key: string]: unknown;
}

export interface TimelineEntry {
  step: TimelineStep;
  startMs: number;
  endMs: number;
}

export function planTimeline(_steps: readonly TimelineStep[], _maxS: number): TimelineEntry[] {
  throw new Error('view/cutscene/sequencer.ts planTimeline: round 6, Session 6J');
}

export function advance(
  _timeline: readonly TimelineEntry[],
  _nowMs: number,
): { starting: TimelineEntry[]; running: TimelineEntry[]; done: boolean } {
  throw new Error('view/cutscene/sequencer.ts advance: round 6, Session 6J');
}
