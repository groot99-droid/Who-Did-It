import type { PartyRoom } from '../src/rooms/PartyRoom';
import { type FixedSeeds, MatchSeeds } from '../src/sim/seeds';

/**
 * Tests only (`deck/wire.md` 2.2): fixes the seed words of the listed streams for this room. They are kept in
 * room memory (`room.fixedSeeds`), so every Start from now on seeds each listed stream from them, and each keyed
 * stream of a listed name from the same words with the fourth XORed with the FNV-1a hash of its key: one record
 * reproduces a run. The current streams are replaced too, for a test that draws before its next Start. Streams
 * not listed keep crypto words. Never registered in a production code path (no message, no debug handler).
 */
export function fixSeeds(room: PartyRoom, words: FixedSeeds): void {
  room.fixedSeeds = { ...words };
  room.seeds = new MatchSeeds(room.fixedSeeds);
}
