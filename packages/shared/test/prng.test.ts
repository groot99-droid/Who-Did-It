import { describe, expect, it } from 'vitest';
import { sfc32, shuffle } from '../src/rules';

type Words = readonly [number, number, number, number];

/** The same generator in BigInt arithmetic (mod 2^32), written from the published algorithm, as a check. */
function sfc32Reference([w0, w1, w2, w3]: Words): () => number {
  const mask = 0xffffffffn;
  let a = BigInt(w0 >>> 0);
  let b = BigInt(w1 >>> 0);
  let c = BigInt(w2 >>> 0);
  let d = BigInt(w3 >>> 0);
  const next = () => {
    const t = (a + b + d) & mask;
    d = (d + 1n) & mask;
    a = b ^ (b >> 9n);
    b = (c + (c << 3n)) & mask;
    c = (((c << 21n) | (c >> 11n)) + t) & mask;
    return Number(t) / 2 ** 32;
  };
  for (let i = 0; i < 12; i++) next();
  return next;
}

const draw = (rng: () => number, n: number) => Array.from({ length: n }, () => rng());

describe('sfc32', () => {
  const seeds: Words[] = [
    [0, 0, 0, 0],
    [1, 2, 3, 4],
    [0xffffffff, 0x80000000, 0x7fffffff, 0xdeadbeef],
    [2654435769, 1013904223, 1664525, 22695477],
  ];

  it('matches the reference algorithm for every seed', () => {
    for (const words of seeds) expect(draw(sfc32(...words), 1000)).toEqual(draw(sfc32Reference(words), 1000));
  });

  it('is reproducible per seed and stays in [0, 1)', () => {
    const a = sfc32(9, 8, 7, 6);
    const b = sfc32(9, 8, 7, 6);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('gives a different stream when any one of the four words changes', () => {
    const base = draw(sfc32(1, 2, 3, 4), 8);
    expect(draw(sfc32(5, 2, 3, 4), 8)).not.toEqual(base);
    expect(draw(sfc32(1, 5, 3, 4), 8)).not.toEqual(base);
    expect(draw(sfc32(1, 2, 5, 4), 8)).not.toEqual(base);
    expect(draw(sfc32(1, 2, 3, 5), 8)).not.toEqual(base);
  });

  it('never sticks, even from an all-zero seed', () => {
    expect(new Set(draw(sfc32(0, 0, 0, 0), 1000)).size).toBe(1000);
  });

  it('spreads its draws evenly over ten buckets', () => {
    const rng = sfc32(0x12345678, 0x9abcdef0, 0x0fedcba9, 0x87654321);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 20000; i++) {
      const k = Math.floor(rng() * 10);
      buckets[k] = (buckets[k] ?? 0) + 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(1800);
      expect(count).toBeLessThan(2200);
    }
  });

  it('drives shuffle to a permutation', () => {
    const input = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const out = shuffle(input, sfc32(4, 3, 2, 1));
    expect([...out].sort()).toEqual(input);
    expect(shuffle(input, sfc32(4, 3, 2, 1))).toEqual(out);
  });
});
