import { randomInt } from 'node:crypto';
import { type Rng, sfc32 } from '@wdi/shared';

/**
 * The independent random streams of one match (round-5 contract, DECISIONS A49, `deck/wire.md` 2.2). Each stream
 * is `sfc32` seeded with four `crypto.randomInt` words the first time it is asked for, so every public draw (traits,
 * NPC names, timings) can be seen in full without saying anything about the deal. Nothing secret may
 * share a stream with anything public: add a name here rather than reuse one. Avatar handles never come from a
 * stream (`randomBytes`), and cover hints need no draw.
 *
 * - `deal`: the deal;
 * - `traits`: the cosmetic traits (never the deal stream);
 * - `npcNames`: the names of the NPC seats `fillNpcSeats` adds;
 * - `piles`: drawn by nothing since the quick mode left (A115); `seeds.test.ts` fixes it as its sample stream;
 * - `npcTiming`, `npcPlay`: keyed by NPC seat id; each NPC seat draws only from its own two;
 * - `mobs`, `nodes`: round-6 world draws (`mobs` keyed by spawner id);
 * - `minigame`: the station-task puzzles (6H), keyed by seat id, so no public draw shares a seat's board;
 * - `contract`, `events`: the Bible's mail stream and world events (rounds 7 and 9, docs/round6/bible-seams.md);
 * - `vendetta`: a Killer card's vendetta, keyed by seat id (round 7, GDD 3.20);
 * - `tasks`: the task deal, the real and the fake lists (round 7, 7M, GDD 3.5);
 * - `body`: the effect chance rolls of the body (round 8, 8A, GDD 3.22; docs/round8/body.md 3), never a secret one;
 * - `purse`: each seat's starting stake, keyed by seat id (round 8, GDD 3.23);
 * - `talk`: an NPC seat's meeting notes, keyed by seat id (round 8, 8T, GDD 3.8), so a note moves no other stream;
 * - `townsfolk`: the ambient townsfolk figures (round 8, 8E, GDD 3.24), keyed by figure id, never a secret draw;
 * - `homes`: each human seat's home (round 10, A7, GDD 3.32), drawn in seat order and never from the card;
 * - `locks`: each lock's pin set points (round 10, D5, GDD 3.29), keyed by prop id; the picker's client is sent them.
 */
export type StreamName =
  | 'deal'
  | 'traits'
  | 'npcNames'
  | 'piles'
  | 'npcTiming'
  | 'npcPlay'
  | 'mobs'
  | 'nodes'
  | 'minigame'
  | 'contract'
  | 'events'
  | 'vendetta'
  | 'tasks'
  | 'body' // round 8, 8A
  | 'purse'
  | 'talk'
  | 'townsfolk'
  | 'loot' // round 10, A10: an interaction's drops (docs/round10/seams.md 1)
  | 'homes'
  | 'locks' // round 10, D5: the lock-pick's set points, keyed by lock id, a puzzle and never a secret draw
  | 'pairing' // round 10, B8: Walk with me's answer delays and rolls (public-safe, seams.md 1)
  | 'hitman' // round 10, C4: whether the Hitman comes, the day, human or NPC, and the turned seat (secret)
  | 'hardship'; // round 10, C4c: how many seats a delivery strikes, which, and the kind (secret)

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
  /** Round 8, 8L (A170): the words each stream id was seeded from, for the match log's replay record. */
  private readonly words = new Map<string, SeedWords>();
  /** Round 8, 8L: the logged words a replay seeds from, by stream id (`MatchSeeds.replay`). */
  private replayed?: Readonly<Record<string, SeedWords>>;

  /** `fixed` is undefined in production; only the test helper `fixSeeds` ever supplies it. */
  constructor(private readonly fixed?: FixedSeeds) {}

  /**
   * Round 8, 8L (A170): seeds every stream id listed in `words` from exactly those words (a match log's `seeds`), so
   * the logged match's draws come out again; an id that is not listed keeps crypto words. Stream independence holds:
   * each id still has its own four words.
   */
  static replay(words: Readonly<Record<string, SeedWords>>): MatchSeeds {
    const seeds = new MatchSeeds();
    seeds.replayed = words;
    return seeds;
  }

  /** Round 8, 8L (A170): every stream id drawn so far and its seed words. Server stdout only, never the wire. */
  recorded(): Record<string, SeedWords> {
    return Object.fromEntries(this.words);
  }

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
      const seed: SeedWords = this.replayed?.[id] ?? [
        a,
        b,
        c,
        fixed && key !== undefined ? (d ^ fnv1a(key)) >>> 0 : d,
      ]; // round 8, 8L
      rng = sfc32(...seed); // round 8, 8L: the recorded words
      this.words.set(id, seed); // round 8, 8L
      this.streams.set(id, rng);
    }
    return rng;
  }
}
