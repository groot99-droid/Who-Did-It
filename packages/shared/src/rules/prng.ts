/** Seeded PRNG for every rule (ARCHITECTURE 5.8). Returns floats in [0, 1). */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Outputs `sfc32` discards after seeding, so close seeds (tests fix small words) start far apart. */
const SFC32_WARMUP = 12;

/**
 * Small Fast Counter, 128-bit state, seeded from four crypto words. Every match stream draws from it
 * (`apps/server/src/sim/seeds.ts`): most of the main-mode deal is public by sight (non-cover seats wear their
 * own card), so a 32-bit seed could be recovered by brute force from the roster. `d` is the counter, so no seed
 * (all zeros included) falls into a short cycle. Returns floats in [0, 1).
 */
export function sfc32(a: number, b: number, c: number, d: number): Rng {
  let s0 = a | 0;
  let s1 = b | 0;
  let s2 = c | 0;
  let s3 = d | 0;
  const next: Rng = () => {
    const t = (((s0 + s1) | 0) + s3) | 0;
    s3 = (s3 + 1) | 0;
    s0 = s1 ^ (s1 >>> 9);
    s1 = (s2 + (s2 << 3)) | 0;
    s2 = (s2 << 21) | (s2 >>> 11);
    s2 = (s2 + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < SFC32_WARMUP; i++) next();
  return next;
}

/** Fisher-Yates on a copy. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}
