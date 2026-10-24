import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PublicFacts } from '../src/services/talk/facts';
import { talkLog } from '../src/services/talk/npcNotes';
import { HERRINGS, SMALL_TALK, herringNote, smallTalkNote } from '../src/services/talk/templates';
import { simOf } from '../src/sim/RoomSim';
import { advance, allTownsfolk, bootNpcServer, standardParty } from './npcHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** A herring template as a pattern: its placeholders match any name or number. */
const herringPatterns = HERRINGS.map(
  (h) =>
    new RegExp(
      `^${h.text
        .replace(/[.?]/g, '\\$&')
        .replace(/\{seat\}/, '.+')
        .replace('{wrongRound}', '\\d+')}$`,
    ),
);
const isHerring = (text: string): boolean => herringPatterns.some((p) => p.test(text));

const facts: PublicFacts = {
  round: 3,
  reason: 'body',
  caller: 'Ada',
  body: 'Bo',
  missing: ['Cy'],
  others: ['Ada', 'Cy', 'Dot', 'Eli'],
};

describe('misdirection (GDD 3.25)', () => {
  it('a meeting holds talk.npc.herringsPerMeeting herrings, one per chosen seat, and small talk only from the list', async () => {
    for (const set of ['S1', 'S2'] as const) {
      const party = await standardParty(colyseus, set);
      allTownsfolk(party.room);
      simOf(party.room).meetingRequests.push({ reason: 'bell', callerId: party.humans[0]!.id });
      for (let i = 0; i < 5 && party.room.state.phase !== Phase.meetingDiscussion; i++) advance(party, 1);
      while (
        party.room.state.phase === Phase.meetingDiscussion ||
        party.room.state.phase === Phase.meetingVote
      ) {
        advance(party, 1);
      }
      const said = talkLog(party.room).talk ?? [];
      const herrings = said.filter((l) => isHerring(l.text));
      const { min, max } = balance.talk.npc.herringsPerMeeting;
      expect(herrings.length).toBeGreaterThanOrEqual(min);
      expect(herrings.length).toBeLessThanOrEqual(max);
      expect(new Set(herrings.map((l) => l.seat)).size).toBe(herrings.length);
      for (const line of said) expect(line.source).toBe('template');
      await colyseus.cleanup();
    }
  });

  it('a herring gets one public fact slightly wrong: a seat at the table, not the caller or the missing, or the round', () => {
    for (let i = 0; i < 300; i++) {
      const line = herringNote(facts, Math.random);
      expect(isHerring(line)).toBe(true);
      expect(line).not.toMatch(/[{}]|undefined/);
      expect(line).not.toMatch(/\bAda\b|\bCy\b|\bBo\b|Night 3\b/);
    }
    const bare: PublicFacts = { round: 1, reason: 'bell', caller: '', body: '', missing: [], others: [] };
    for (let i = 0; i < 50; i++) expect(herringNote(bare, Math.random)).not.toMatch(/[{}]|Night [01]\b/);
  });

  it('small talk is satire about nothing: no names, no cards', () => {
    expect(SMALL_TALK).toContain('Can I get a cup of coffee?');
    const words = ['killer', 'accomplice', 'detective', 'doctor', 'vicar', 'cabal', 'body', 'vote'];
    for (const line of SMALL_TALK) for (const word of words) expect(line.toLowerCase()).not.toContain(word);
    for (let i = 0; i < 50; i++) expect(SMALL_TALK).toContain(smallTalkNote(Math.random));
  });
});
