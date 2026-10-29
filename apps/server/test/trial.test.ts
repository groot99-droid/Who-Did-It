import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootFlowServer, events, request, skipPhase, startParty, until } from './flowHelpers';

// Round 8 (8M, DECISIONS A171; GDD 3.3): the Final Night is a short hunt, then the trial, a forced meeting with its
// own discussion `finalNight.trialS`, longer than any ordinary meeting. The phases and events are the usual ones.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

async function toFinalNight(n: number) {
  const m = await startParty(colyseus, n);
  m.room.state.round = balance.finalNight.afterCycle;
  await skipPhase(m);
  return m;
}

const left = (m: Awaited<ReturnType<typeof toFinalNight>>) => m.room.state.phaseEndsTick - m.room.state.tick;

describe('the trial after the Final Night hunt (GDD 3.3)', () => {
  it('is longer than every ordinary discussion', () => {
    for (const row of Object.values(balance.byCount)) {
      expect(balance.finalNight.trialS).toBeGreaterThan(row.discussionS);
    }
  });

  for (const n of [5, 8]) {
    it(`opens with a discussion of finalNight.trialS at ${n} seats when the hunt runs out`, async () => {
      const m = await toFinalNight(n);
      await skipPhase(m);
      expect(m.room.state.phase).toBe(Phase.meetingDiscussion);
      expect(m.room.state.meeting.reason).toBe('final');
      expect(Math.abs(left(m) - balance.finalNight.trialS * TICK_RATE)).toBeLessThanOrEqual(4);
    });
  }

  it('opens the same way when a body report ends the hunt', async () => {
    const m = await toFinalNight(5);
    request(m, 1, 2);
    expect(await until(() => m.room.state.phase === Phase.meetingDiscussion)).toBe(true);
    expect(Math.abs(left(m) - balance.finalNight.trialS * TICK_RATE)).toBeLessThanOrEqual(4);
  });

  it('runs on the existing phase events: the hunt, the discussion, then the vote of phases.voteS', async () => {
    const m = await toFinalNight(5);
    await skipPhase(m);
    await skipPhase(m);
    expect(m.room.state.phase).toBe(Phase.meetingVote);
    expect(Math.abs(left(m) - balance.phases.voteS * TICK_RATE)).toBeLessThanOrEqual(4);
    const changes = events(m.bots[1]!, 'phaseChange').map((e) => e.phase);
    expect(changes.slice(-3)).toEqual([Phase.finalNight, Phase.meetingDiscussion, Phase.meetingVote]);
  });

  it('leaves an ordinary meeting on the discussion of the party size', async () => {
    const m = await startParty(colyseus, 5);
    await skipPhase(m); // grace -> day, where the Bell rings
    request(m, 1);
    expect(await until(() => m.room.state.phase === Phase.meetingDiscussion)).toBe(true);
    expect(m.room.state.meeting.reason).not.toBe('final');
    expect(Math.abs(left(m) - balance.byCount['5'].discussionS * TICK_RATE)).toBeLessThanOrEqual(4);
  });
});
