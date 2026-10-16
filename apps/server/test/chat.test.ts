import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { ErrorCode, Phase } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bootFlowServer,
  events,
  idOf,
  murder,
  openMeeting,
  skipPhase,
  startParty,
  voteAll,
} from './flowHelpers';
import { type Match, sleep } from './simHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const say = async (m: Match, i: number, text: unknown, extra: object = {}) => {
  m.bots[i]!.room.send('chat.say', { text, ...extra });
  await sleep(150);
};
const lines = (m: Match, i: number) => events(m.bots[i]!, 'chat.msg');

describe('meeting chat', () => {
  it('refuses a living player outside a meeting with 425', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    await say(m, 1, 'hello');
    expect(events(m.bots[1]!, 'error').at(-1)).toMatchObject({ code: ErrorCode.wrongPhase });
    for (const i of [0, 1, 2, 3]) expect(lines(m, i)).toHaveLength(0);
  });

  it('reaches every client on the meeting channel in the discussion, the vote and the reveal', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    await openMeeting(m, 1);
    await say(m, 1, 'it was the baker');
    await skipPhase(m);
    expect(m.room.state.phase).toBe(Phase.meetingVote);
    await say(m, 2, 'I agree');
    await voteAll(m, [0, 1, 2, 3], () => 'skip');
    await say(m, 3, 'fine');
    for (const i of [0, 1, 2, 3]) {
      expect(lines(m, i)).toEqual([
        { from: idOf(m, 1), text: 'it was the baker', channel: 'meeting' },
        { from: idOf(m, 2), text: 'I agree', channel: 'meeting' },
        { from: idOf(m, 3), text: 'fine', channel: 'meeting' },
      ]);
    }
  });

  it('trims the text, cuts it to balance.chat.maxChars, refuses an empty line with 422 and ignores a chosen channel', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    await openMeeting(m, 1);
    await say(m, 1, `   ${'x'.repeat(balance.chat.maxChars + 50)}   `, { channel: 'cabal' });
    expect(lines(m, 0)[0]).toEqual({
      from: idOf(m, 1),
      text: 'x'.repeat(balance.chat.maxChars),
      channel: 'meeting',
    });
    for (const bad of ['   ', '', 42, undefined]) {
      await say(m, 2, bad);
      expect(events(m.bots[2]!, 'error').at(-1)).toMatchObject({ code: ErrorCode.cannot });
    }
    expect(lines(m, 0)).toHaveLength(1);
  });
});

describe('ghost chat', () => {
  it('reaches only the dead, in any phase, on the ghost channel', async () => {
    const m = await startParty(colyseus, 5);
    await skipPhase(m);
    murder(m, 3);
    await sleep(100);
    await say(m, 3, 'anyone there?'); // a private ghost in the day phase
    expect(lines(m, 3)).toEqual([{ from: idOf(m, 3), text: 'anyone there?', channel: 'ghost' }]);
    for (const i of [0, 1, 2, 4]) expect(lines(m, i)).toHaveLength(0);

    // A second ghost joins them at the meeting; both hear the ghost line, the living still do not.
    murder(m, 4);
    await openMeeting(m, 1, 3);
    await say(m, 4, 'boo');
    expect(lines(m, 3).at(-1)).toMatchObject({ text: 'boo', channel: 'ghost' });
    expect(lines(m, 4).at(-1)).toMatchObject({ text: 'boo', channel: 'ghost' });
    for (const i of [0, 1, 2]) expect(lines(m, i)).toHaveLength(0);

    // A living player's meeting line still reaches the ghosts, as a meeting line.
    await say(m, 2, 'hi all');
    for (const i of [0, 1, 2, 3, 4])
      expect(lines(m, i).at(-1)).toMatchObject({ text: 'hi all', channel: 'meeting' });
  });
});
