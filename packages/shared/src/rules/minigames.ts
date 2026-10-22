// Round 6 (M5b, GDD 3.16): the main-mode mini-games, pure. `generate` builds a puzzle and its solution from a seeded
// rng; `check` judges an answer. The server keeps the solution in room memory and sends `public` in
// `minigameStart`; a Cabal seat's fake task runs the same puzzle and never moves the task bar. Pre-seeded by 6Z
// with throwing bodies; Session 6H fills them (docs/round6/m5b-data.md 2.3).
import type { MinigameKind } from '../protocol/index';
import type { Rng } from './prng';

export interface MinigamePuzzle {
  kind: MinigameKind;
  /** What the client receives: never holds the solution. */
  public: unknown;
  /** What the server keeps. */
  solution: unknown;
}

export function generateMinigame(_kind: MinigameKind, _difficulty: number, _rng: Rng): MinigamePuzzle {
  throw new Error('rules/minigames.ts generateMinigame: round 6, Session 6H');
}

export function checkMinigame(_puzzle: MinigamePuzzle, _answer: unknown): boolean {
  throw new Error('rules/minigames.ts checkMinigame: round 6, Session 6H');
}
