import { describe, expect, it } from 'vitest';
import balance from '@wdi/content/data/balance.json';
import { checkMinigame, generateMinigame, mulberry32, type MinigameBases } from '@wdi/shared/rules';
import type { CratesPublic, PourPublic, SlidePublic, StokePublic } from '@wdi/shared/rules';
import type { MinigameKind } from '@wdi/shared/protocol';
import { CART, CratesModel } from './crates';
import { PourModel } from './pour';
import { SlideModel, slotRect } from './slide';
import { StokeModel } from './stoke';
import { bandRng } from './board';

const bases: MinigameBases = balance.minigames;

/** Plays a widget model the way a careful player would and returns its `answer()` record. */
function play(kind: MinigameKind, pub: unknown): unknown {
  const rng = bandRng(kind, pub);
  switch (kind) {
    case 'crates': {
      const p = pub as CratesPublic;
      const m = new CratesModel(rng, p.steps);
      for (let i = 0; i < p.steps; i++) m.drop(CART.x + 4, CART.y + 4);
      m.stop(m.bandStart + m.bandFrac / 2);
      return { placed: m.cartCount, stop: m.stopPos };
    }
    case 'pour': {
      const p = pub as PourPublic;
      const m = new PourModel(rng, p.steps);
      while (!m.done) {
        m.press();
        while (m.level < m.bandStart + m.bandFrac / 2) m.tick(0.01);
        m.release();
      }
      return { holdsS: [...m.holdsS] };
    }
    case 'slide': {
      const p = pub as SlidePublic;
      const m = new SlideModel(rng, p.steps);
      while (!m.done) {
        const r = slotRect(m.glowing);
        m.drop(r.x + 2, r.y + 2);
      }
      return { slots: [...m.slots] };
    }
    case 'stoke': {
      const p = pub as StokePublic;
      const m = new StokeModel(rng, undefined, undefined, undefined, p.holdS);
      const target = m.bandStart + m.bandFrac / 2;
      for (let i = 0; i < 4000 && !m.done; i++) {
        if (m.heat + m.stokePerTap <= m.bandStart + m.bandFrac && m.heat < target - m.stokePerTap / 2)
          m.tap();
        m.tick(0.05);
      }
      return { taps: [...m.taps] };
    }
  }
}

describe('the widgets rebuild the server board and answer for it', () => {
  it.each(['crates', 'pour', 'slide', 'stoke'] as MinigameKind[])(
    '%s: a played widget passes the rule on every difficulty and seed',
    (kind) => {
      for (let difficulty = 1; difficulty <= 5; difficulty++) {
        for (let seed = 1; seed <= 8; seed++) {
          const puzzle = generateMinigame(kind, difficulty, mulberry32(seed), bases);
          expect(checkMinigame(puzzle, play(kind, puzzle.public)), `${kind} d${difficulty} s${seed}`).toBe(
            true,
          );
        }
      }
    },
  );

  it('an answer is judged against the board it was played on, not another', () => {
    const a = generateMinigame('slide', 3, mulberry32(1), bases);
    const b = generateMinigame('slide', 3, mulberry32(2), bases);
    expect(checkMinigame(b, play('slide', a.public))).toBe(false);
  });

  it('an unplayed widget answers nothing that passes', () => {
    for (const kind of ['crates', 'pour', 'slide', 'stoke'] as MinigameKind[]) {
      const puzzle = generateMinigame(kind, 1, mulberry32(3), bases);
      const empty = {
        crates: { placed: 0, stop: 0 },
        pour: { holdsS: [] },
        slide: { slots: [] },
        stoke: { taps: [] },
      };
      expect(checkMinigame(puzzle, empty[kind])).toBe(false);
    }
  });
});
