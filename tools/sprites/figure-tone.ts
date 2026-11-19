// The tone check for figure pages (round 11, F2): look.md 3.3's three rules, until 11M's M3 (`tone.ts`) lands.
// An HD figure keeps its texture's own colours (tone 0, A164), so it is not snapped to the palette; these rules keep
// those colours in the game's family instead.
import { decodePng } from './bleed.ts';
import { dist2, hexToRgb, oklab, type Lab } from './oklab.ts';
import { WORLD, paletteFile } from './palette.ts';

/** The rules' numbers (look.md 3.3, _proposed_ there: they may move on the first real pages). */
export const TONE = {
  clusters: 16,
  nearDeltaE: 0.1,
  saturatedChroma: 0.12,
  saturatedShare: 0.1,
  alphaMin: 128,
};

export interface ToneFrame {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ToneReport {
  /** Each dominant colour, its share of the page's opaque pixels, and its OKLab distance to the nearest world colour. */
  dominant: { lab: Lab; share: number; deltaE: number }[];
  /** The frames whose saturated share is over the limit, with that share. */
  saturated: { name: string; share: number }[];
  /** Opaque pixels darker (OKLab L) than ink. */
  darkerThanInk: number;
}

const chroma = (p: Lab) => Math.hypot(p[1], p[2]);
const INK_L = oklab(...hexToRgb(paletteFile.colors.ink!))[0];

/** k-means in OKLab, seeded deterministically by lightness quantiles, a fixed number of rounds. */
export function kmeans(points: Lab[], k: number, rounds = 12): { centre: Lab; count: number }[] {
  if (points.length === 0) return [];
  const sorted = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  let centres: Lab[] = Array.from(
    { length: Math.min(k, sorted.length) },
    (_, i) => sorted[Math.floor(((i + 0.5) * sorted.length) / Math.min(k, sorted.length))]!,
  );
  let counts: number[] = [];
  for (let r = 0; r < rounds; r++) {
    const sums = centres.map(() => [0, 0, 0]);
    counts = centres.map(() => 0);
    for (const p of points) {
      let best = 0;
      let bd = Infinity;
      centres.forEach((c, i) => {
        const d = dist2(p, c);
        if (d < bd) [bd, best] = [d, i];
      });
      sums[best]![0] += p[0];
      sums[best]![1] += p[1];
      sums[best]![2] += p[2];
      counts[best]!++;
    }
    centres = centres.map((c, i) =>
      counts[i] ? (sums[i]!.map((s) => s / counts[i]!) as unknown as Lab) : c,
    );
  }
  return centres.map((centre, i) => ({ centre, count: counts[i] ?? 0 }));
}

/** The three rules on one packed page and the frames cut from it. */
export function toneReport(png: Buffer, frames: ToneFrame[]): ToneReport {
  const img = decodePng(png);
  const labs: Lab[] = [];
  const cache = new Map<number, Lab>();
  const labAt = (i: number): Lab => {
    const key = (img.data[i]! << 16) | (img.data[i + 1]! << 8) | img.data[i + 2]!;
    let v = cache.get(key);
    if (!v) cache.set(key, (v = oklab(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!)));
    return v;
  };
  const saturated: ToneReport['saturated'] = [];
  let darkerThanInk = 0;
  for (const f of frames) {
    let opaque = 0;
    let sat = 0;
    for (let y = f.y; y < f.y + f.h; y++) {
      for (let x = f.x; x < f.x + f.w; x++) {
        const i = (y * img.width + x) * 4;
        if (img.data[i + 3]! < TONE.alphaMin) continue;
        const p = labAt(i);
        labs.push(p);
        opaque++;
        if (chroma(p) > TONE.saturatedChroma) sat++;
        if (p[0] < INK_L) darkerThanInk++;
      }
    }
    if (opaque && sat / opaque > TONE.saturatedShare) saturated.push({ name: f.name, share: sat / opaque });
  }
  const dominant = kmeans(labs, TONE.clusters)
    .filter((c) => c.count > 0)
    .map(({ centre, count }) => ({
      lab: centre,
      share: count / labs.length,
      deltaE: Math.sqrt(Math.min(...WORLD.map((w) => dist2(centre, w.lab)))),
    }));
  return { dominant, saturated, darkerThanInk };
}
