import { randomInt } from 'node:crypto';
import { type Rng, sfc32 } from '@wdi/shared';

/**
 * The independent random streams of one match (round-5 contract, DECISIONS A49, `deck/wire.md` 2.2). Each stream
 * is `sfc32` seeded with four `crypto.randomInt` words the first time it is asked for, so every public draw (traits,
 * NPC names, pile order, timings) can be seen in full without saying anything about the deal. Nothing secret may
 * share a stream with anything public: add a name here rather than reuse one. Avatar handles never come from a
 * stream (`randomBytes`), and cover hints need no draw.
 *
 * - `deal`: the main-mode deal and the ONUB deal, then its Pantry Locations;
 * - `traits`: the cosmetic traits (never the deal stream);
 * - `npcNames`: the names of the NPC seats `fillNpcSeats` adds;
 * - `script`: the ONUB night script jitter;
 * - `piles`: the public order of each ONUB pile (`resolvePrep` step 1);
 * - `thaw`: the card each Thermostat Flip discards (secret until game over);
 * - `perk`: the Pantry Location the proofing visitors see (private to them);
 * - `prepTimeout`: the commit of a seat that let the prep clock run out;
 * - `nightTimeout`: the targets of a must-act left undone;
 * - `npcTiming`, `npcPlay`: keyed by NPC seat id; each NPC seat draws only from its own two;
 * - `mobs`, `nodes`: round-6 world draws (`mobs` keyed by spawner id);
 * - `minigame`: the station-task puzzles (6H), keyed by seat id, so no public draw shares a seat's board;
 * - `contract`, `events`: the Bible's mail stream and world events (rounds 7 and 9, docs/round6/bible-seams.md).
 */
export type StreamName =
  | 'deal'
  | 'traits'
  | 'npcNames'
  | 'script'
  | 'piles'
  | 'thaw'
  | 'perk'
  | 'prepTimeout'
  | 'nightTimeout'
  | 'npcTiming'
  | 'npcPlay'
  | 'mobs'
  | 'nodes'
  | 'minigame'
  | 'contract'
  | 'events';

/** Four 32-bit seed words of one sfc32 stream. */
export type SeedWords = readonly [number, number, number, number];

/** Fixed seed words per stream name; only the test helper `fixSeeds` ever supplies them. */
export type FixedSeeds = Partial<Record<StreamName, SeedWords>>;

const cryptoWords = (): SeedWords => [
  randomInt(2 ** 32),
  randomInt(2 ** 32),
  randomInt(2 ** 32),
  randomInt(2 ** 32),
];

/** 32-bit FNV-1a over the UTF-16 code units of `key`. */
function fnv1a(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export class MatchSeeds {
  private readonly streams = new Map<string, Rng>();

  /** `fixed` is undefined in production; only the test helper `fixSeeds` ever supplies it. */
  constructor(private readonly fixed?: FixedSeeds) {}

  /**
   * The stream `name` (or `name:key`), created on first use and kept for the rest of the match. A keyed stream
   * (`npcPlay:<seatId>`, `npcTiming:<seatId>`) is independent per key: four fresh crypto words of its own, never
   * derived from another stream. With fixed words, a listed name seeds from them, and each of its keyed streams
   * from the same words with the fourth XORed with the FNV-1a hash of the key; unlisted names keep crypto words.
   */
  get(name: StreamName, key?: string): Rng {
    const id = key === undefined ? name : `${name}:${key}`;
    let rng = this.streams.get(id);
    if (!rng) {
      const fixed = this.fixed?.[name];
      const [a, b, c, d] = fixed ?? cryptoWords();
      rng = sfc32(a, b, c, fixed && key !== undefined ? (d ^ fnv1a(key)) >>> 0 : d);
      this.streams.set(id, rng);
    }
    return rng;
  }
}
