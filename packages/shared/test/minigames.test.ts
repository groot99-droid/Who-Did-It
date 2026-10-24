import { describe, expect, it } from 'vitest';
import {
  checkMinigame,
  generateMinigame,
  mulberry32,
  stokeSucceeds,
  type CratesPublic,
  type MinigameBases,
  type MinigameKind,
  type PourPublic,
  type SlidePublic,
  type StokePublic,
} from '../src/index';

const BASES: MinigameBases = {
  crates: { steps: 3, bandFrac: 0.2 },
  pour: { steps: 2, ratePerS: 0.35, bandFrac: 0.12 },
  slide: { steps: 4 },
  stoke: { stokePerTap: 0.15, ratePerS: 0.08, bandFrac: 0.18, holdS: 3 },
  tap: { steps: 3, periodS: 1.4, bandFrac: 0.18 }, // 7M: the round-7 kind, tested in minigamesTap.test.ts
};
const KINDS: MinigameKind[] = ['crates', 'pour', 'slide', 'stoke'];
const gen = (kind: MinigameKind, difficulty = 1, seed = 7) =>
  generateMinigame(kind, difficulty, mulberry32(seed), BASES);

describe('generateMinigame', () => {
  it('is deterministic per rng and differs between seeds', () => {
    for (const k of KINDS) {
      expect(gen(k, 2, 5)).toEqual(gen(k, 2, 5));
      expect(gen(k, 2, 5)).not.toEqual(gen(k, 2, 6));
    }
  });

  it('adds a step for every two levels of difficulty above 1', () => {
    expect((gen('crates', 1).public as CratesPublic).steps).toBe(3);
    expect((gen('crates', 3).public as CratesPublic).steps).toBe(4);
    expect((gen('slide', 5).public as SlidePublic).steps).toBe(6);
    expect((gen('pour', 5).public as PourPublic).bands).toHaveLength(4);
    expect((gen('stoke', 3).public as StokePublic).holdS).toBe(4);
  });

  it('lights the slide slots in a permutation and keeps the pour and stoke bands inside the dial', () => {
    const order = (gen('slide', 3).public as SlidePublic).order;
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4]);
    for (let seed = 0; seed < 50; seed++) {
      const p = gen('pour', 1, seed).public as PourPublic;
      for (const b of p.bands) expect(b >= 0.25 && b + p.bandFrac <= 0.95).toBe(true);
      const s = gen('stoke', 1, seed).public as StokePublic;
      expect(s.bandStart >= 0.3 && s.bandStart + s.bandFrac <= 0.9).toBe(true);
      const c = gen('crates', 1, seed).public as CratesPublic;
      expect(c.bandStart + c.bandFrac).toBeLessThanOrEqual(1);
    }
  });
});

describe('checkMinigame', () => {
  it('accepts the crates when all are placed and the needle stops in the band', () => {
    const p = gen('crates');
    const s = p.public as CratesPublic;
    const mid = s.bandStart + s.bandFrac / 2;
    expect(checkMinigame(p, { placed: s.steps, stop: mid })).toBe(true);
    expect(checkMinigame(p, { placed: s.steps - 1, stop: mid })).toBe(false);
    expect(checkMinigame(p, { placed: s.steps, stop: s.bandStart + s.bandFrac + 0.01 })).toBe(false);
  });

  it('accepts a pour only when every hold lands its level in that step band', () => {
    const p = gen('pour', 3);
    const s = p.public as PourPublic;
    const good = s.bands.map((b) => (b + s.bandFrac / 2) / s.ratePerS);
    expect(checkMinigame(p, { holdsS: good })).toBe(true);
    expect(checkMinigame(p, { holdsS: good.slice(1) })).toBe(false);
    expect(checkMinigame(p, { holdsS: good.map((h, i) => (i === 0 ? h * 3 : h)) })).toBe(false);
    expect(checkMinigame(p, { holdsS: [...good.slice(0, -1), -1] })).toBe(false);
  });

  it('accepts a slide only in the lit order', () => {
    const p = gen('slide', 3);
    const order = (p.public as SlidePublic).order;
    expect(checkMinigame(p, { slots: order })).toBe(true);
    expect(checkMinigame(p, { slots: [...order].reverse() })).toBe(false);
    expect(checkMinigame(p, { slots: order.slice(1) })).toBe(false);
  });

  it('replays a stoke: steady taps pass, no taps and one tap fail', () => {
    const p = gen('stoke');
    const s = p.public as StokePublic;
    // Tap whenever the heat has cooled below the band's middle; the replay is the same model the client runs.
    const taps: number[] = [];
    let heat = 0;
    const mid = s.bandStart + s.bandFrac / 2;
    for (let t = 0; t < 40; t += 0.05) {
      heat = Math.max(0, heat - s.ratePerS * 0.05);
      if (heat < mid - s.stokePerTap / 2) {
        taps.push(t);
        heat = Math.min(1, heat + s.stokePerTap);
      }
    }
    expect(stokeSucceeds(s, taps)).toBe(true);
    expect(checkMinigame(p, { taps })).toBe(true);
    expect(checkMinigame(p, { taps: [] })).toBe(false);
    expect(checkMinigame(p, { taps: [0] })).toBe(false);
    expect(checkMinigame(p, { taps: [...taps].reverse() })).toBe(false);
  });

  it('refuses malformed answers and a bare done', () => {
    for (const k of KINDS) {
      const p = gen(k);
      for (const bad of [null, undefined, 3, 'done', [], {}, { done: true }, { assist: true }]) {
        expect(checkMinigame(p, bad)).toBe(false);
      }
    }
    expect(checkMinigame(gen('slide'), { slots: Array(1000).fill(0) })).toBe(false);
    expect(checkMinigame(gen('stoke'), { taps: [Number.NaN] })).toBe(false);
    expect(checkMinigame(gen('crates'), { placed: Number.POSITIVE_INFINITY, stop: 0.5 })).toBe(false);
  });

  it('keeps the solution out of the public statement object', () => {
    for (const k of KINDS) {
      const p = gen(k);
      expect(p.public).not.toBe(p.solution);
    }
  });
});
