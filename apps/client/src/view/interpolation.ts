// Remote players are drawn 150 ms in the past, lerped between the two server samples around that moment
// (ARCHITECTURE 5.6). There is no client prediction in V1: the local player is drawn from server echo with
// a shorter delay (two patches) so input still feels direct. A first sample, and any jump too big to be
// walking, teleports instead of sliding.

import { TICK_RATE } from '@wdi/shared/constants';

export const REMOTE_DELAY_MS = 150;
/** Round 6 (docs/round6/auto-admin.md 2): the admin views divide the delay by the sim scale; a match uses 1. */
export const remoteDelayMs = (scale = 1): number => REMOTE_DELAY_MS / scale;
export const SELF_DELAY_MS = 100;
/** A step larger than this many pixels between samples is a portal or a spawn, never a slide (1.5 tiles). */
export const TELEPORT_PX = 96;
const KEEP = 12;
/** One server tick on the render clock, in ms (`TICK_RATE` 20). */
export const TICK_MS = 1000 / TICK_RATE;
/** How much of each new tick's arrival offset moves the smoothed one: about half a second to settle. */
export const OFFSET_SMOOTHING = 0.1;
/** An arrival this far off the smoothed offset is a reconnect or a tab that slept, not jitter: the clock restarts. */
export const OFFSET_RESET_MS = 1000;

/**
 * Round 10 (10Y, y4; DECISIONS A294): the sample clock. A patch's samples are stamped at `tick * TICK_MS` plus an
 * offset smoothed from the arrival times, so the buffer holds one sample per tick, evenly spaced, whether the
 * server sends a patch every tick or two ticks at once, and however the network jitters. Stamping by the frame
 * time instead stretched the interval before a late patch and squeezed the one before an early one, which the eye
 * read as stutter. The first stamp is the arrival time itself; the same tick stamps the same time on every frame.
 */
export class TickClock {
  private offset: number | null = null;
  private lastTick = -1;
  private lastStamp = 0;

  /** The render-clock time of `tick`, given that a patch carrying it was seen at wall time `now` (ms). */
  stamp(tick: number, now: number): number {
    if (tick === this.lastTick && this.offset !== null) return this.lastStamp;
    const raw = now - tick * TICK_MS;
    if (this.offset === null || tick < this.lastTick || Math.abs(raw - this.offset) > OFFSET_RESET_MS) {
      this.offset = raw;
    } else {
      this.offset += (raw - this.offset) * OFFSET_SMOOTHING;
    }
    this.lastTick = tick;
    this.lastStamp = tick * TICK_MS + this.offset;
    return this.lastStamp;
  }
}

export interface Sample {
  t: number;
  x: number;
  y: number;
  yaw: number;
  animId: number;
}

export class SampleBuffer {
  private samples: Sample[] = [];

  get length(): number {
    return this.samples.length;
  }

  clear(): void {
    this.samples = [];
  }

  /** Records a server sample taken at wall time `t` (ms). Identical consecutive samples are dropped. */
  push(s: Sample): void {
    const last = this.samples[this.samples.length - 1];
    if (last && last.x === s.x && last.y === s.y && last.yaw === s.yaw && last.animId === s.animId) return;
    if (last && Math.hypot(s.x - last.x, s.y - last.y) > TELEPORT_PX) this.samples = [];
    this.samples.push(s);
    if (this.samples.length > KEEP) this.samples.shift();
  }

  /** The interpolated state at render time `renderT` (ms); null before the first sample. */
  at(renderT: number): Sample | null {
    const a = this.samples;
    if (a.length === 0) return null;
    const first = a[0] as Sample;
    const last = a[a.length - 1] as Sample;
    if (renderT <= first.t) return { ...first };
    if (renderT >= last.t) return { ...last };
    for (let i = a.length - 1; i > 0; i--) {
      const hi = a[i] as Sample;
      const lo = a[i - 1] as Sample;
      if (renderT >= lo.t) {
        const k = (renderT - lo.t) / (hi.t - lo.t || 1);
        return {
          t: renderT,
          x: lo.x + (hi.x - lo.x) * k,
          y: lo.y + (hi.y - lo.y) * k,
          yaw: k < 0.5 ? lo.yaw : hi.yaw,
          animId: lo.animId,
        };
      }
    }
    return { ...last };
  }
}
