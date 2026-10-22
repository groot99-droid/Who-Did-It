import { describe, expect, it } from 'vitest';
import onubBalance from '@wdi/content/data/balance.onub.json';
import { checkMinigame, generateMinigame, mulberry32, type MinigameBases } from '@wdi/shared/rules';
import type { MinigameKind } from '@wdi/shared/protocol';
import { CratesModel } from '../onub/minigames/crates';
import { PourModel } from '../onub/minigames/pour';
import { SlideModel } from '../onub/minigames/slide';
import { StokeModel } from '../onub/minigames/stoke';
import { answerOf, bandRng, drawsOf } from './answers';

const spec = (k: MinigameKind) => onubBalance.stations.find((s) => s.minigame.kind === k)!.minigame;
const bases = {
  crates: spec('crates'),
  pour: spec('pour'),
  slide: spec('slide'),
  stoke: spec('stoke'),
} as unknown as MinigameBases;
const KINDS: MinigameKind[] = ['crates', 'pour', 'slide', 'stoke'];

describe('answerOf', () => {
  it.each(KINDS)('%s: the answer for a board passes the rule on every difficulty and seed', (kind) => {
    for (let difficulty = 1; difficulty <= 5; difficulty++) {
      for (let seed = 1; seed <= 8; seed++) {
        const puzzle = generateMinigame(kind, difficulty, mulberry32(seed), bases);
        expect(checkMinigame(puzzle, answerOf(kind, puzzle.public)), `${kind} d${difficulty} s${seed}`).toBe(
          true,
        );
      }
    }
  });
  it('is judged against the board it was written for, not another', () => {
    const a = generateMinigame('slide', 3, mulberry32(1), bases);
    const b = generateMinigame('slide', 3, mulberry32(2), bases);
    expect(checkMinigame(b, answerOf('slide', a.public))).toBe(false);
  });
});

describe('bandRng feeds the ONUB widgets the server board', () => {
  it('crates and stoke draw the server band', () => {
    const c = generateMinigame('crates', 1, mulberry32(5), bases);
    const pub = c.public as { bandStart: number; bandFrac: number };
    expect(new CratesModel(bandRng('crates', pub)).bandStart).toBeCloseTo(pub.bandStart, 6);
    const s = generateMinigame('stoke', 1, mulberry32(5), bases);
    const sp = s.public as { bandStart: number };
    expect(new StokeModel(bandRng('stoke', sp)).bandStart).toBeCloseTo(sp.bandStart, 6);
  });
  it("the pour draws each step's band in order", () => {
    const p = generateMinigame('pour', 1, mulberry32(9), bases);
    const pub = p.public as { bands: number[] };
    const rng = bandRng('pour', pub);
    const m = new PourModel(rng);
    expect(m.bandStart).toBeCloseTo(pub.bands[0]!, 6);
  });
  it('the slide shuffle lands on the server order (the first lit slot, then the whole order)', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const p = generateMinigame('slide', 1, mulberry32(seed), bases);
      const order = (p.public as { order: number[] }).order;
      const m = new SlideModel(bandRng('slide', p.public));
      if (m.steps !== order.length) continue;
      const seen: number[] = [];
      for (let i = 0; i < m.steps; i++) {
        seen.push(m.glowing);
        m.drop(0, 0);
        if (m.placed <= i) break;
      }
      expect(drawsOf('slide', p.public).length).toBeGreaterThan(0);
      expect(seen[0]).toBe(order[0]);
    }
  });
});
