import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase, TICK_RATE, TribunalStep } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootFlowServer, events, request, skipPhase, startParty, until } from './flowHelpers';
import { sleep } from './simHelpers';

// Round 8 (8M, DECISIONS A171; GDD 3.3): the Final Night is a short hunt, then the trial, with its own window
// `finalNight.trialS`, longer than any ordinary meeting. Round 10, B6d (6Z's grant; seams.md 3 row 35): the trial is
// the end trial, whose filing window takes `finalNight.trialS` after a 3 s gathering (GDD 3.8).

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
/** The end trial's clock: what is left of its current step. */
const stepLeft = (m: Awaited<ReturnType<typeof toFinalNight>>) =>
  m.room.state.tribunal.untilTick - m.room.state.tick;
/** The gathering ends: the filing window opens. */
async function toFiling(m: Awaited<ReturnType<typeof toFinalNight>>): Promise<void> {
  m.room.state.tribunal.untilTick = m.room.state.tick;
  await until(() => m.room.state.tribunal.step === TribunalStep.filing);
}

describe('the trial after the Final Night hunt (GDD 3.3)', () => {
  it('is longer than every ordinary discussion', () => {
    for (const row of Object.values(balance.byCount)) {
      expect(balance.finalNight.trialS).toBeGreaterThan(row.discussionS);
    }
  });

  for (const n of [5, 8]) {
    it(`opens with a filing window of finalNight.trialS at ${n} seats when the hunt runs out`, async () => {
      const m = await toFinalNight(n);
      await skipPhase(m);
      expect(m.room.state.phase).toBe(Phase.tribunal);
      await toFiling(m);
      expect(Math.abs(stepLeft(m) - balance.finalNight.trialS * TICK_RATE)).toBeLessThanOrEqual(4);
    });
  }

  it('opens the same way when a body report ends the hunt', async () => {
    const m = await toFinalNight(5);
    request(m, 1, 2);
    expect(await until(() => m.room.state.phase === Phase.tribunal)).toBe(true);
    await toFiling(m);
    expect(Math.abs(stepLeft(m) - balance.finalNight.trialS * TICK_RATE)).toBeLessThanOrEqual(4);
  });

  it('runs on the phase events: the hunt, the end trial, then game over', async () => {
    const m = await toFinalNight(5);
    await skipPhase(m);
    for (let i = 0; i < 20 && m.room.state.phase !== Phase.gameOver; i++) {
      m.room.state.tribunal.untilTick = m.room.state.tick;
      await sleep(150);
    }
    const changes = events(m.bots[1]!, 'phaseChange').map((e) => e.phase);
    expect(changes.slice(-3)).toEqual([Phase.finalNight, Phase.tribunal, Phase.gameOver]);
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
