// The tone check for figure pages (round 11, F2): look.md 3.3's three rules, until 11M's M3 (`tone.ts`) lands.
// An HD figure keeps its texture's own colours (tone 0, A164), so it is not snapped to the palette; these rules keep
// those colours in the game's family instead.
import { decodePng, encodePng } from './bleed.ts';
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
    const sums = centres.map((): [number, number, number] => [0, 0, 0]);
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

/** OKLab back to 8-bit sRGB, clamped to the gamut. */
export function fromOklab(lab: Lab): [number, number, number] {
  const [L, a, b] = lab;
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return lin.map((v) => {
    const c = Math.min(1, Math.max(0, v));
    const e = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
    return Math.round(e * 255);
  }) as [number, number, number];
}

/**
 * The ink floor (_proposed_, F2): look.md 3.3 lets nothing ship darker than ink, and an HD figure keeps its texture's
 * own colours, so a black coat in self-shadow sinks below it. Lightness under the knee maps linearly from [0, knee]
 * onto [ink, knee], the hue kept; every pixel at or above the knee is untouched. A rule, not a hand edit; it stands
 * until 11M's per-role tone (look.md 3.3) can do the same job.
 */
export const INK_FLOOR = { knee: 0.35 };

export function inkFloor(png: Buffer, knee = INK_FLOOR.knee): Buffer {
  const img = decodePng(png);
  const d = img.data;
  const cache = new Map<number, number>();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const key = (d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!;
    let out = cache.get(key);
    if (out === undefined) {
      const [L, a, b] = oklab(d[i]!, d[i + 1]!, d[i + 2]!);
      if (L >= knee) out = key;
      else {
        const floor = INK_L + 0.005; // a hair above ink, so rounding to 8 bits never lands under it
        const lifted = floor + (L * (knee - floor)) / knee;
        const [r, g, bl] = fromOklab([lifted, a, b]);
        out = (r << 16) | (g << 8) | bl;
      }
      cache.set(key, out);
    }
    d[i] = out >> 16;
    d[i + 1] = (out >> 8) & 0xff;
    d[i + 2] = out & 0xff;
  }
  return encodePng(img);
}
