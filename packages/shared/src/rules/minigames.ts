// Round 6 (M5b, GDD 3.16): the main-mode mini-games, pure. `generateMinigame` builds a puzzle from a seeded rng and
// `checkMinigame` judges an answer. The server keeps the puzzle in room memory and sends `public` in `minigameStart`;
// a Cabal seat's fake task runs the same puzzle and never moves the task bar. The four kinds are ONUB v2's Evening Prep
// games (GDD 3.11), whose client widgets 6I reuses; `@wdi/shared` cannot import `@wdi/content`, so the caller passes the
// ONUB station numbers in as `MinigameBases`. Every answer is a record of what the player did, which `checkMinigame`
// replays against the puzzle; it never trusts a bare "done".
import type { MinigameKind } from '../protocol/index';
import type { Rng } from './prng';

/** The per-kind numbers `balance.onub.json` `stations[].minigame` carries, passed in by the caller. */
export interface MinigameBases {
  crates: { steps: number; bandFrac: number };
  pour: { steps: number; ratePerS: number; bandFrac: number };
  slide: { steps: number };
  stoke: { stokePerTap: number; ratePerS: number; bandFrac: number; holdS: number };
}

export interface MinigamePuzzle {
  kind: MinigameKind;
  /** What the client receives: the puzzle's statement, which is the board it draws. */
  public: unknown;
  /** What the server keeps and `checkMinigame` judges an answer against. */
  solution: unknown;
}

export interface CratesPublic {
  steps: number;
  bandStart: number;
  bandFrac: number;
}
export interface PourPublic {
  steps: number;
  ratePerS: number;
  bandFrac: number;
  /** The line band's start for each pour, in order. */
  bands: number[];
}
export interface SlidePublic {
  steps: number;
  /** The slot that glows at each step, a permutation of `0 .. steps - 1`. */
  order: number[];
}
export interface StokePublic {
  stokePerTap: number;
  ratePerS: number;
  bandFrac: number;
  holdS: number;
  bandStart: number;
}

/** Answers, by kind. Times are seconds since the mini-game opened. */
export interface CratesAnswer {
  placed: number;
  stop: number;
}
export interface PourAnswer {
  /** How long the pour button was held for each step. */
  holdsS: number[];
}
export interface SlideAnswer {
  slots: number[];
}
export interface StokeAnswer {
  taps: number[];
}

/** Longest list an answer may carry, so a hostile payload costs nothing to judge. */
export const MAX_ANSWER_LIST = 400;
/** The stoke replay's time step, in seconds. */
const STOKE_DT = 0.05;

/** Every two levels of difficulty above 1 add one step (one second of hold for the stoke). */
const extraSteps = (difficulty: number): number => Math.floor((Math.max(1, Math.min(5, difficulty)) - 1) / 2);

/** The pour band keeps clear of a single quick tap at the bottom and of the rim (ONUB's rule). */
const pourBand = (rng: Rng, bandFrac: number): number => 0.25 + rng() * (0.95 - bandFrac - 0.25);

export function generateMinigame(
  kind: MinigameKind,
  difficulty: number,
  rng: Rng,
  bases: MinigameBases,
): MinigamePuzzle {
  const more = extraSteps(difficulty);
  switch (kind) {
    case 'crates': {
      const b = bases.crates;
      const pub: CratesPublic = {
        steps: b.steps + more,
        bandStart: rng() * (1 - b.bandFrac),
        bandFrac: b.bandFrac,
      };
      return { kind, public: pub, solution: { ...pub } };
    }
    case 'pour': {
      const b = bases.pour;
      const steps = b.steps + more;
      const bands = Array.from({ length: steps }, () => pourBand(rng, b.bandFrac));
      const pub: PourPublic = { steps, ratePerS: b.ratePerS, bandFrac: b.bandFrac, bands };
      return { kind, public: pub, solution: { ...pub, bands: [...bands] } };
    }
    case 'slide': {
      const steps = bases.slide.steps + more;
      const order = Array.from({ length: steps }, (_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      const pub: SlidePublic = { steps, order };
      return { kind, public: pub, solution: { steps, order: [...order] } };
    }
    case 'stoke': {
      const b = bases.stoke;
      const pub: StokePublic = {
        stokePerTap: b.stokePerTap,
        ratePerS: b.ratePerS,
        bandFrac: b.bandFrac,
        holdS: b.holdS + more,
        bandStart: 0.3 + rng() * (0.9 - b.bandFrac - 0.3),
      };
      return { kind, public: pub, solution: { ...pub } };
    }
  }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numList = (v: unknown): number[] | null =>
  Array.isArray(v) && v.length <= MAX_ANSWER_LIST && v.every(isNum) ? (v as number[]) : null;
const inBand = (x: number, start: number, frac: number): boolean => x >= start && x <= start + frac;

/**
 * Replays the stoke (ONUB's `StokeModel`): each tap adds `stokePerTap` heat, the fire cools `ratePerS` a second, and the
 * heat must stay in the band for `holdS` seconds in a row. `taps` are ascending seconds; the replay ends `holdS` after
 * the last tap, when the fire can only cool.
 */
export function stokeSucceeds(s: StokePublic, taps: readonly number[]): boolean {
  let heat = 0;
  let held = 0;
  let next = 0;
  const end = (taps[taps.length - 1] ?? 0) + s.holdS + STOKE_DT;
  for (let t = 0; t <= end; t += STOKE_DT) {
    while (next < taps.length && taps[next]! <= t) {
      heat = Math.min(1, heat + s.stokePerTap);
      next++;
    }
    heat = Math.max(0, heat - s.ratePerS * STOKE_DT);
    held = inBand(heat, s.bandStart, s.bandFrac) ? held + STOKE_DT : 0;
    if (held >= s.holdS) return true;
  }
  return false;
}

export function checkMinigame(puzzle: MinigamePuzzle, answer: unknown): boolean {
  if (typeof answer !== 'object' || answer === null) return false;
  const a = answer as Record<string, unknown>;
  switch (puzzle.kind) {
    case 'crates': {
      const s = puzzle.solution as CratesPublic;
      return (
        isNum(a.placed) && isNum(a.stop) && a.placed >= s.steps && inBand(a.stop, s.bandStart, s.bandFrac)
      );
    }
    case 'pour': {
      const s = puzzle.solution as PourPublic;
      const holds = numList(a.holdsS);
      return (
        holds !== null &&
        holds.length === s.steps &&
        holds.every((h, i) => h >= 0 && inBand(h * s.ratePerS, s.bands[i]!, s.bandFrac))
      );
    }
    case 'slide': {
      const s = puzzle.solution as SlidePublic;
      const slots = numList(a.slots);
      return slots !== null && slots.length === s.steps && slots.every((v, i) => v === s.order[i]);
    }
    case 'stoke': {
      const taps = numList(a.taps);
      return (
        taps !== null &&
        taps.every((t, i) => t >= 0 && (i === 0 || t >= taps[i - 1]!)) &&
        stokeSucceeds(puzzle.solution as StokePublic, taps)
      );
    }
  }
}
