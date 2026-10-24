import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PublicFacts } from '../src/services/talk/facts';
import { filterLine } from '../src/services/talk/filter';
import { TALK_SYSTEM, talkPrompt } from '../src/services/talk/prompt';
import { bootNpcServer, standardParty } from './npcHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

describe('the talk filter (GDD 3.25 "Filter")', () => {
  it('keeps plain lines and throws away tells, slurs, long lines and cards named for a seat', async () => {
    const party = await standardParty(colyseus, 'S3');
    const room = party.room;
    const someone = [...room.state.players.values()][1]!.name;
    expect(filterLine(room, '  "Who was by the mill?"\nsecond line')).toBe('Who was by the mill?');
    expect(filterLine(room, 'The killer is among us.')).toBe('The killer is among us.');
    expect(filterLine(room, `${someone} is the killer.`)).toBeNull();
    expect(filterLine(room, 'I am the detective, trust me.')).toBeNull();
    expect(filterLine(room, 'As an AI I cannot say.')).toBeNull();
    expect(filterLine(room, 'x'.repeat(balance.talk.model.maxChars + 1))).toBeNull();
    expect(filterLine(room, '   ')).toBeNull();
  });
});

describe('the talk prompt (GDD 3.25 "Input")', () => {
  it('holds the public facts, the writer, its findings and the last lines of the meeting, nothing else', () => {
    const facts: PublicFacts = {
      round: 2,
      reason: 'body',
      caller: 'Ada',
      body: 'Bo',
      missing: ['Cy'],
      others: ['Ada'],
    };
    const said = Array.from({ length: balance.talk.model.transcriptLines + 3 }, (_, i) => ({
      who: i % 2 === 0 ? '' : 'Ada',
      text: `line ${i}`,
    }));
    const prompt = talkPrompt('Dot', facts, said, ['I saw boots by the mill.']);
    expect(prompt).toContain('You are Dot.');
    expect(prompt).toContain("Bo's");
    expect(prompt).toContain('Missing at the roll-call: Cy.');
    expect(prompt).toContain('I saw boots by the mill.');
    expect(prompt).not.toContain('line 2\n');
    expect(prompt).toContain(`line ${said.length - 1}`);
    expect(prompt).toContain('(a note) line 4');
    expect(TALK_SYSTEM.length).toBeGreaterThan(0);
  });
});
