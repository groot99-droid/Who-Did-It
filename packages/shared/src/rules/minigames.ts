// Round 6 (M5b, GDD 3.16): the main-mode mini-games, pure; round 7 (7M) adds the `tap` kind. `generateMinigame` builds a puzzle from a seeded rng and
// `checkMinigame` judges an answer. The server keeps the puzzle in room memory and sends `public` in `minigameStart`;
// a Cabal seat's fake task runs the same puzzle and never moves the task bar. `@wdi/shared` cannot import
// `@wdi/content`, so the caller passes the numbers of `balance.json` `minigames` in as `MinigameBases`. Every answer
// is a record of what the player did, which `checkMinigame` replays against the puzzle; it never trusts a bare "done".
import type { MinigameKind } from '../protocol/index';
import type { Rng } from './prng';

/** The per-kind numbers of `balance.json` `minigames` (GDD 3.16), passed in by the caller. */
export interface MinigameBases {
  crates: { steps: number; bandFrac: number };
  pour: { steps: number; ratePerS: number; bandFrac: number };
  slide: { steps: number };
  stoke: { stokePerTap: number; ratePerS: number; bandFrac: number; holdS: number };
  /** Round 7 (7M): a marker sweeps the track once per `periodS`; tap inside a `bandFrac` band `steps` times running. */
  tap: { steps: number; periodS: number; bandFrac: number };
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
export interface TapPublic {
  steps: number;
  periodS: number;
  bandFrac: number;
  /** The band's start for each hit in turn (0 to 1 along the track). */
  bands: number[];
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
export interface TapAnswer {
  /** Every tap, in order, hits and misses alike; the replay counts the hits in a row. */
  taps: number[];
}

/** Longest list an answer may carry, so a hostile payload costs nothing to judge. */
export const MAX_ANSWER_LIST = 400;
/** The stoke replay's time step, in seconds. */
const STOKE_DT = 0.05;

/** Every two levels of difficulty above 1 add one step (one second of hold for the stoke). */
const extraSteps = (difficulty: number): number => Math.floor((Math.max(1, Math.min(5, difficulty)) - 1) / 2);

/** The pour band keeps clear of a single quick tap at the bottom and of the rim. */
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
    case 'tap': {
      const b = bases.tap;
      const steps = b.steps + more;
      const bands = Array.from({ length: steps }, () => rng() * (1 - b.bandFrac));
      const pub: TapPublic = { steps, periodS: b.periodS, bandFrac: b.bandFrac, bands };
      return { kind, public: pub, solution: { ...pub, bands: [...bands] } };
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
 * Replays the stoke (the client's `StokeModel`): each tap adds `stokePerTap` heat, the fire cools `ratePerS` a second, and the
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

/** The tap marker's place on the track (0 to 1) after `t` seconds: a triangle wave, back and forth once per `periodS`. */
export function tapMarkerAt(t: number, periodS: number): number {
  const p = (t / periodS) % 1;
  return p < 0.5 ? p * 2 : 2 - p * 2;
}

/**
 * Replays the taps (the client's `TapModel`): each tap inside the current band is a hit and moves on to the next band;
 * a tap outside starts the run again from the first band. Done when `steps` hits land in a row.
 */
export function tapSucceeds(s: TapPublic, taps: readonly number[]): boolean {
  let hits = 0;
  for (const t of taps) {
    hits = inBand(tapMarkerAt(t, s.periodS), s.bands[hits]!, s.bandFrac) ? hits + 1 : 0;
    if (hits >= s.steps) return true;
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
    case 'tap': {
      const taps = numList(a.taps);
      return (
        taps !== null &&
        taps.every((t, i) => t >= 0 && (i === 0 || t >= taps[i - 1]!)) &&
        tapSucceeds(puzzle.solution as TapPublic, taps)
      );
    }
  }
}

// Round 7 (7M, GDD 3.5): the co-op hold, pure. A task of kind `coop` (Shutter the windows) is held by `players` seats
// at once; its progress is a shared count of ticks that runs while enough hands hold, pauses while fewer do, and starts
// again from nothing once everyone has let go. The numbers come from the task's own row of `tasks.json` (`coopPlayers`,
// `holdS`).

/**
 * The next shared count after one tick with `holders` seats holding: one more while `holders >= players`, the same
 * while some but too few hold (the pause), and 0 when nobody holds.
 */
export function coopTicks(ticks: number, holders: number, players: number): number {
  if (holders <= 0) return 0;
  return holders >= players ? ticks + 1 : ticks;
}

/** Whether `ticks` of shared progress reach the task's `holdS` at `tickRate` ticks a second. */
export function coopDone(ticks: number, holdS: number, tickRate: number): boolean {
  return ticks >= Math.round(holdS * tickRate);
}

/** The shared progress to show, 0..1. */
export function coopProgress(ticks: number, holdS: number, tickRate: number): number {
  const need = Math.round(holdS * tickRate);
  return need <= 0 ? 1 : Math.min(1, ticks / need);
}
