import { randomInt } from 'node:crypto';
import { type Rng, mulberry32 } from '@wdi/shared';

/**
 * The independent random streams of one match (round-5 contract, DECISIONS A49). Each stream is seeded by its
 * own `crypto.randomInt` draw the first time it is asked for, so every public draw (traits, NPC names, pile
 * order, timings, handles) can be seen in full without saying anything about the deal. Nothing secret may
 * share a stream with anything public: add a name here rather than reuse one.
 */
export type StreamName =
  | 'deal'
  | 'traits'
  | 'npcNames'
  | 'script'
  | 'piles'
  | 'prepTimeout'
  | 'nightTimeout'
  | 'npcTiming'
  | 'npcPlay'
  | 'handles'
  | 'covers'
  | 'mobs'
  | 'nodes';

export class MatchSeeds {
  private readonly streams = new Map<StreamName, Rng>();

  /** The stream `name`, created on first use and kept for the rest of the match. */
  get(name: StreamName): Rng {
    let rng = this.streams.get(name);
    if (!rng) {
      rng = mulberry32(randomInt(2 ** 32));
      this.streams.set(name, rng);
    }
    return rng;
  }
}
