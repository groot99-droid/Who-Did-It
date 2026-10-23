import balance from '@wdi/content/data/balance.json';
import { cratesGame } from './crates';
import { pourGame } from './pour';
import { slideGame } from './slide';
import { stokeGame } from './stoke';

type Bases = typeof balance.minigames;
export type MiniKind = 'crates' | 'pour' | 'slide' | 'stoke';
/** One kind's numbers from `balance.json` `minigames` (GDD 3.16), tagged with the kind. */
export type MiniGameSpec = { [K in MiniKind]: { kind: K } & Bases[K] }[MiniKind];

/** What a mini-game is given: its slot, its station's numbers and a local RNG for the bands. */
export interface MiniGameHost {
  root: HTMLElement;
  spec: MiniGameSpec;
  /** Local: the bands come from the server's seed through `bandRng` (`board.ts`). */
  rng: () => number;
  /** The mini-game is done. Calling it twice is harmless. */
  onDone(): void;
  /** The server's board size where it differs from the station's base (`minigames.json` difficulty adds steps). */
  steps?: number | undefined;
  holdS?: number | undefined;
}

export interface MiniGame {
  destroy(): void;
  /** What the player did, in the record `checkMinigame` replays; read once `onDone` has fired. */
  answer?(): unknown;
}

export type MiniGameFactory = (host: MiniGameHost) => MiniGame;

/** Every mini-game by kind (GDD 3.16). */
export const MINIGAMES: Partial<Record<MiniKind, MiniGameFactory>> = {
  crates: cratesGame,
  pour: pourGame,
  slide: slideGame,
  stoke: stokeGame,
};
