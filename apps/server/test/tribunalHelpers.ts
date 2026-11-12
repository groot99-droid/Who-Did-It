import { ClueKind, NotebookEntry, NotebookStatus, TICK_RATE, TribunalSentence } from '@wdi/shared';
import { expect } from 'vitest';
import { tribunalOpen } from '../src/sim/law/Tribunal';
import { type Party, advance } from './npcHelpers';

/**
 * Round 10, B6a (6Z's grant): a cuffed seat placed in the cell now opens the Tribunal (GDD 3.8, seams.md 3 row 22).
 * The tests that jail a seat give the warrant two Verified entries fitting the accused, then run the Tribunal out, so
 * the seat is really serving a jail sentence before they go on.
 */

/** Two Verified entries in `opener`'s Notebook that fit `accused`'s public traits (as `petition.test.ts` builds them). */
export function fitting(party: Party, opener: string, accused: string): string[] {
  const t = party.room.state.players.get(accused)!.traits;
  const notebook = party.room.state.players.get(opener)!.priv.notebook;
  return [
    [ClueKind.footprints, t.height],
    [ClueKind.thread, t.scarf],
  ].map(([kind, value]) => {
    const e = new NotebookEntry();
    e.id = `entry_t${notebook.length + 1}`;
    e.clueKind = kind!;
    e.value = value!;
    e.sceneId = notebook.length + 1;
    e.status = NotebookStatus.verified;
    notebook.push(e);
    return e.id;
  });
}

/**
 * Runs the Tribunal the cell opened to its end: it only steps the clock. The warrant's entries prove the robbery, so
 * the seat must still be held, sentenced to jail.
 */
export function tried(party: Party, seat: string): void {
  let sentence: number = TribunalSentence.none;
  for (let i = 0; i < 300 * TICK_RATE && tribunalOpen(party.room); i++) {
    advance(party, 1);
    if (party.room.state.tribunal.sentence !== TribunalSentence.none)
      sentence = party.room.state.tribunal.sentence;
  }
  expect(tribunalOpen(party.room)).toBe(false);
  expect(sentence).toBe(TribunalSentence.jail);
  expect(party.room.state.players.get(seat)!.priv.jailUntilTick).toBeGreaterThan(0);
}
