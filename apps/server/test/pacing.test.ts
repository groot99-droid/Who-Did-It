import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootFlowServer, skipPhase, startParty } from './flowHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

describe('pacing (GDD 3.3, round 10 A5)', () => {
  it('runs one cycle of 810 s from a day of 480 s, a dusk of 30 s and a night of 300 s', async () => {
    const m = await startParty(colyseus, 4);
    const s = m.room.state;
    await skipPhase(m);
    const spans: Array<[number, number]> = [];
    for (let i = 0; i < 3; i++) {
      spans.push([s.phase, s.phaseEndsTick - s.tick]);
      await skipPhase(m);
    }
    expect(spans.map(([phase]) => phase)).toEqual([Phase.day, Phase.dusk, Phase.night]);
    const total = spans.reduce((sum, [, ticks]) => sum + ticks, 0);
    expect(Math.abs(total - 810 * TICK_RATE)).toBeLessThanOrEqual(12);
    expect(balance.phases.dayS + balance.phases.duskS + balance.phases.nightS).toBe(810);
    expect(s.phase).toBe(Phase.day);
    expect(s.round).toBe(2);
  });
});
