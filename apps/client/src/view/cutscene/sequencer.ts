/**
 * The cutscene timeline (round 6, docs/round6/cutscene-music.md 1.3): pure, Phaser-free, unit-tested. `planTimeline`
 * turns a cutscene's steps into absolute start times; `advance` says which entries start, run and end at a time.
 *
 * Time model (DECISIONS A92): a step without `withPrevious` starts when the last such step ended; a `withPrevious`
 * step starts with the entry before it and does not move that cursor. A step with no `durationS` takes no time, except
 * `hold` and `video`, which run to `maxS`. The whole is clamped to `maxS`; a step that would start after it is dropped.
 */
export interface TimelineStep {
  t: string;
  durationS?: number;
  withPrevious?: boolean | undefined;
  [key: string]: unknown;
}

export interface TimelineEntry {
  step: TimelineStep;
  startMs: number;
  endMs: number;
}

/** Steps that last until the cutscene ends: a death's held last frame, a memorial's video. */
const OPEN_ENDED: ReadonlySet<string> = new Set(['hold', 'video']);

export function planTimeline(steps: readonly TimelineStep[], maxS: number): TimelineEntry[] {
  const maxMs = Math.round(maxS * 1000);
  const out: TimelineEntry[] = [];
  let cursor = 0;
  let lastStart = 0;
  for (const step of steps) {
    const startMs = step.withPrevious === true ? lastStart : cursor;
    const lengthMs = Math.round((step.durationS ?? 0) * 1000);
    if (startMs > maxMs || (startMs === maxMs && (lengthMs > 0 || OPEN_ENDED.has(step.t)))) continue;
    const endMs = OPEN_ENDED.has(step.t) ? maxMs : Math.min(maxMs, startMs + lengthMs);
    out.push({ step, startMs, endMs });
    lastStart = startMs;
    if (step.withPrevious !== true) cursor = endMs;
  }
  return out;
}

/**
 * What is happening at `nowMs`. `starting` holds the entries whose start lies in (`prevMs`, `nowMs`], so a caller that
 * passes the previous frame's time starts each entry exactly once (`prevMs` -1 includes time 0); `running` holds the
 * entries that have begun and not ended; `done` is true once every entry has ended.
 */
export function advance(
  timeline: readonly TimelineEntry[],
  nowMs: number,
  prevMs = -1,
): { starting: TimelineEntry[]; running: TimelineEntry[]; done: boolean } {
  return {
    starting: timeline.filter((e) => e.startMs > prevMs && e.startMs <= nowMs),
    running: timeline.filter((e) => e.startMs <= nowMs && nowMs < e.endMs),
    done: timeline.every((e) => nowMs >= e.endMs),
  };
}

export type Ease = 'linear' | 'sine' | 'quad';

/** Easing of progress `p` in [0, 1]. */
export function ease(kind: Ease, p: number): number {
  const x = Math.min(1, Math.max(0, p));
  if (kind === 'sine') return 0.5 - Math.cos(Math.PI * x) / 2;
  if (kind === 'quad') return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
  return x;
}

export interface CameraLeg {
  from: { x: number; y: number };
  to: { x: number; y: number };
  zoomFrom?: number | undefined;
  zoomTo?: number | undefined;
  durationS: number;
  ease: Ease;
}

export interface CameraPose {
  tx: number;
  ty: number;
  /** A multiple of the scene's fit zoom. */
  zoom: number;
}

/** The camera pose `elapsedMs` into a leg: tiles and a zoom multiple, held at the end after the leg is over. */
export function cameraPose(leg: CameraLeg, elapsedMs: number): CameraPose {
  const e = ease(leg.ease, leg.durationS > 0 ? elapsedMs / (leg.durationS * 1000) : 1);
  const zoomFrom = leg.zoomFrom ?? 1;
  const zoomTo = leg.zoomTo ?? zoomFrom;
  return {
    tx: leg.from.x + (leg.to.x - leg.from.x) * e,
    ty: leg.from.y + (leg.to.y - leg.from.y) * e,
    zoom: zoomFrom + (zoomTo - zoomFrom) * e,
  };
}
