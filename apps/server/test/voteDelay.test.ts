import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { ErrorCode, Phase, TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { bootFlowServer, events, request, seat, skipPhase, startParty, until } from './flowHelpers';
import { sleep } from './simHelpers';

// Round 8, 8L (docs/round8/teardown.md 1.5, GDD 3.8): a vote cast before `meeting.minVoteS` of the discussion is
// refused with a reason, so a vote agreed before the meeting cannot land before anyone has spoken.

vi.setConfig({ testTimeout: 40_000 });

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

describe('the vote delay (8L)', () => {
  it('refuses a vote before meeting.minVoteS with 425 and the reason, and takes it after', async () => {
    const m = await startParty(colyseus, 4);
    await skipPhase(m);
    request(m, 1); // the meeting opens on the real clock, votes not opened white-box
    await until(() => m.room.state.phase === Phase.meetingDiscussion);
    const opened = m.room.state.tick;

    m.bots[2]!.room.send('meeting.vote', { targetId: 'skip' }); // never the helper, which opens the votes
    await until(() => events(m.bots[2]!, 'error').length > 0);
    expect(events(m.bots[2]!, 'error').at(-1)).toMatchObject({
      code: ErrorCode.wrongPhase,
      msg: expect.stringContaining(`${balance.meeting.minVoteS} s`),
    });
    expect(seat(m, 2).hasVoted).toBe(false);
    expect(seat(m, 2).priv!.myVote).toBe('');

    const openAt = opened + balance.meeting.minVoteS * TICK_RATE;
    expect(await until(() => m.room.state.tick >= openAt + 1, 30_000)).toBe(true);
    const refusals = events(m.bots[2]!, 'error').length;
    m.bots[2]!.room.send('meeting.vote', { targetId: 'skip' }); // never the helper, which opens the votes
    expect(await until(() => seat(m, 2).hasVoted)).toBe(true);
    await sleep(100);
    expect(events(m.bots[2]!, 'error')).toHaveLength(refusals);
    expect(m.room.state.phase).toBe(Phase.meetingDiscussion);
  });
});
