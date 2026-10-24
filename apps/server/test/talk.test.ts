import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type ModelReply, talkTransport } from '../src/services/talk/claude';
import { type TalkLine, setTalkReplay, talkLog } from '../src/services/talk/npcNotes';
import { simOf } from '../src/sim/RoomSim';
import { type Party, advance, allTownsfolk, bootNpcServer, standardParty } from './npcHelpers';
import { sleep } from './simHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const real = { ...talkTransport };
const model = { ...balance.talk.model };
afterEach(() => {
  Object.assign(talkTransport, real);
  Object.assign(balance.talk.model, model);
});

/** A fake Messages API: every call is kept, with the prompt it was given, until the test answers it. */
function fakeModel(): { prompts: string[]; answer: (reply: ModelReply, calls?: number) => void } {
  const prompts: string[] = [];
  const waiting: ((reply: ModelReply) => void)[] = [];
  talkTransport.enabled = () => true;
  talkTransport.request = (_system, user) => {
    prompts.push(user);
    return new Promise((resolve) => waiting.push(resolve));
  };
  return {
    prompts,
    answer: (reply, calls = waiting.length) => waiting.splice(0, calls).forEach((resolve) => resolve(reply)),
  };
}

function bell(party: Party): void {
  simOf(party.room).meetingRequests.push({ reason: 'bell', callerId: party.humans[0]!.id });
  for (let i = 0; i < 5 && party.room.state.phase !== Phase.meetingDiscussion; i++) advance(party, 1);
}

/** Steps until the first NPC note is due and its call has started (the human's view: nothing posted yet). */
function toFirstCall(party: Party, prompts: string[]): void {
  for (let i = 0; i < 2000 && prompts.length === 0; i++) advance(party, 1);
  expect(prompts.length).toBeGreaterThan(0);
}

const lines = (party: Party): TalkLine[] => talkLog(party.room).talk ?? [];

describe('NPC talk from the model (GDD 3.25)', () => {
  it('the call runs off the tick: nothing is posted until the answer, which is filtered and logged', async () => {
    const party = await standardParty(colyseus, 'S1');
    allTownsfolk(party.room);
    const fake = fakeModel();
    bell(party);
    toFirstCall(party, fake.prompts);
    advance(party, 2);
    expect(lines(party)).toEqual([]);
    for (const prompt of fake.prompts) expect(prompt).not.toMatch(/townsfolk|killer|cabal|detective/i);
    fake.answer({ text: '"The well was busy at dusk."', tokens: 50 });
    await sleep(0);
    advance(party, 1);
    const said = lines(party);
    expect(said.length).toBeGreaterThan(0);
    for (const line of said)
      expect(line).toMatchObject({ text: 'The well was busy at dusk.', source: 'model' });
  });

  it('a late or unusable answer gives the template line at the deadline', async () => {
    const party = await standardParty(colyseus, 'S2');
    allTownsfolk(party.room);
    const fake = fakeModel();
    bell(party);
    toFirstCall(party, fake.prompts);
    const early = fake.prompts.length;
    const first = lines(party).length;
    advance(party, Math.round(balance.talk.model.timeoutS * TICK_RATE));
    const late = lines(party).slice(first);
    expect(late.length).toBeGreaterThan(0);
    for (const line of late) expect(line.source).toBe('template');
    fake.answer({ text: 'Too late now.', tokens: 10 }, early);
    await sleep(0);
    advance(party, 1);
    expect(lines(party).some((l) => l.text === 'Too late now.')).toBe(false);
  });

  it('stops calling at talk.model.callsPerMatch and writes templates', async () => {
    balance.talk.model.callsPerMatch = 2;
    const party = await standardParty(colyseus, 'S1');
    allTownsfolk(party.room);
    const fake = fakeModel();
    bell(party);
    while (
      party.room.state.phase === Phase.meetingDiscussion ||
      party.room.state.phase === Phase.meetingVote
    ) {
      advance(party, 1);
    }
    expect(fake.prompts).toHaveLength(2);
    expect(lines(party).filter((l) => l.source === 'template').length).toBeGreaterThan(0);
  });

  it('a replay posts the logged notes and never calls the model', async () => {
    const party = await standardParty(colyseus, 'S1');
    allTownsfolk(party.room);
    const fake = fakeModel();
    const seats = [...party.room.state.players.keys()];
    setTalkReplay(
      party.room,
      seats.map((seat) => ({ tick: 0, seat, text: `logged for ${seat}`, source: 'model' as const })),
    );
    bell(party);
    while (
      party.room.state.phase === Phase.meetingDiscussion ||
      party.room.state.phase === Phase.meetingVote
    ) {
      advance(party, 1);
    }
    expect(fake.prompts).toEqual([]);
    const said = lines(party);
    expect(said.length).toBeGreaterThan(0);
    const firsts = new Map<string, TalkLine>();
    for (const line of said) if (!firsts.has(line.seat)) firsts.set(line.seat, line);
    for (const [seat, line] of firsts)
      expect(line).toMatchObject({ text: `logged for ${seat}`, source: 'model' });
  });
});
