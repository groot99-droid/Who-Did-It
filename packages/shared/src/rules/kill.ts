import { ErrorCode } from '../protocol/index';
import type { SolidQuery } from '../nav/index';

// validateKill (GDD 3.2, ARCHITECTURE 5.6, A30): pure over plain numbers and a `solidBetween`
// callback. No schema or room types here (ARCHITECTURE 5.8); the room reads state, calls this, writes state.

export interface KillInput {
  tick: number;
  /** The phase allows kills (day, dusk, night). */
  phaseOk: boolean;
  actorDead: boolean;
  actorPlaced: boolean;
  /** Actor cannot act before this tick (transit). */
  busyUntilTick: number;
  /** The Knife is ready from this tick on (0 when never set). */
  cooldownEndTick: number;
  targetDead: boolean;
  targetPlaced: boolean;
  sameScene: boolean;
  targetInTransit: boolean;
  actorX: number;
  actorY: number;
  targetX: number;
  targetY: number;
  /** Distance the target moved over the last 250 ms of the position ring, in pixels. */
  targetMovedPx: number;
  /** `abilities.kill.rangeTiles` in pixels. */
  rangePx: number;
  /** True when a solid tile lies on the straight line between the two points. */
  solidBetween: (ax: number, ay: number, bx: number, by: number) => boolean;
}

export type Verdict = { ok: true } | { ok: false; code: number; msg: string };

const no = (code: number, msg: string): Verdict => ({ ok: false, code, msg });

/** Refusal order: ghost or unplaced, phase, busy, cooldown, target, scene, reach, line. */
export function validateKill(i: KillInput): Verdict {
  if (i.actorDead || !i.actorPlaced) return no(ErrorCode.cannot, 'not now');
  if (!i.phaseOk) return no(ErrorCode.wrongPhase, 'not now');
  if (i.tick < i.busyUntilTick) return no(ErrorCode.busy, 'busy');
  if (i.tick < i.cooldownEndTick) return no(ErrorCode.cooldown, 'not ready');
  if (i.targetDead || !i.targetPlaced || !i.sameScene || i.targetInTransit) {
    return no(ErrorCode.cannot, 'no target');
  }
  const reach = i.rangePx + Math.max(0, i.targetMovedPx);
  if (Math.hypot(i.targetX - i.actorX, i.targetY - i.actorY) > reach) {
    return no(ErrorCode.outOfRange, 'too far');
  }
  if (i.solidBetween(i.actorX, i.actorY, i.targetX, i.targetY)) return no(ErrorCode.cannot, 'no clear line');
  return { ok: true };
}

/**
 * True when a solid tile lies on the straight segment (pixels). Samples every eighth of a tile, which
 * cannot step over a tile; the end points themselves count too.
 */
export function segmentBlocked(g: SolidQuery, ax: number, ay: number, bx: number, by: number): boolean {
  const len = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(len / (g.tile / 8)));
  for (let s = 0; s <= steps; s++) {
    const f = s / steps;
    if (g.solidAt(Math.floor((ax + (bx - ax) * f) / g.tile), Math.floor((ay + (by - ay) * f) / g.tile))) {
      return true;
    }
  }
  return false;
}
