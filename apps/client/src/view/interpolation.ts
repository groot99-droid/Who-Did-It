// Remote players are drawn 150 ms in the past, lerped between the two server samples around that moment
// (ARCHITECTURE 5.6). There is no client prediction in V1: the local player is drawn from server echo with
// a shorter delay (two patches) so input still feels direct. A first sample, and any jump too big to be
// walking, teleports instead of sliding.

export const REMOTE_DELAY_MS = 150;
export const SELF_DELAY_MS = 100;
/** A step larger than this many pixels between samples is a portal or a spawn, never a slide (1.5 tiles). */
export const TELEPORT_PX = 96;
const KEEP = 12;

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
