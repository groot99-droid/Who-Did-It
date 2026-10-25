// Round 9 (9T, docs/round9/admin-studio.md 4): the facts a report carries without the owner typing them.
import type { StudioReportRequest } from '@wdi/shared/protocol';
import type { StudioSnapshot } from '../admin/StudioNet';
import { LOG_LINES } from './model';

export type ReportContext = NonNullable<StudioReportRequest['context']>;

export interface ReportFacts {
  snapshot: StudioSnapshot;
  build: string;
  style: string;
  overlays: Iterable<string>;
  /** The editor's open check warnings (T5); none until then. */
  warnings?: readonly string[];
}

const FACING = [
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
  'north',
  'north-east',
] as const;

/** The compass word of a world-frame yaw in radians (0 is east, y grows south). */
export function facingOf(yaw: number): string {
  const turn = ((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return FACING[Math.round(turn / (Math.PI / 4)) % 8]!;
}

export function contextOf(f: ReportFacts): ReportContext {
  const s = f.snapshot;
  const ctx: ReportContext = {
    scene: s.sceneId,
    tile: `${s.tx},${s.ty}`,
    facing: facingOf(s.yaw),
    time: `${s.time.phase} ${s.time.t.toFixed(2)}`,
    style: f.style,
    tick: s.tick,
    build: f.build,
    profile: s.profile,
    overlays: [...f.overlays],
  };
  if (f.warnings !== undefined && f.warnings.length > 0) ctx.warnings = [...f.warnings];
  return ctx;
}

/** The request for the route: the PNG data URL, the note, the context and the log's last lines. */
export function requestOf(
  image: string,
  note: string,
  f: ReportFacts,
  log: readonly string[],
): StudioReportRequest {
  return { image, note, context: contextOf(f), log: log.slice(-LOG_LINES) };
}
