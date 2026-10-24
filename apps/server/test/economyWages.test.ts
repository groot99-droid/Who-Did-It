import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, quests } from '@wdi/content';
import { QuestState } from '@wdi/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runInvariants } from '../src/sim/auto/invariants';
import { matchEvents } from '../src/sim/auto/log';
import { emitSim } from '../src/sim/events/bus';
import { bootFlowServer, idOf, seat, until } from './flowHelpers';
import { sleep, startMatch } from './simHelpers';

// Round 8, Session 8C (GDD 3.23; docs/round8/economy.md 2): wages for tasks and quest turn-ins.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootFlowServer()));
afterAll(async () => release());

describe('wages', () => {
  it('pay a finished task the same, real or fake, and say so on the bus', async () => {
    const m = await startMatch(colyseus, 4);
    const [a, b] = [idOf(m, 0), idOf(m, 1)];
    const tick = m.room.state.tick;
    emitSim(m.room, { tick, kind: 'taskDone', seat: a, sceneId: '0', data: { taskId: 't1', fake: false } });
    emitSim(m.room, { tick, kind: 'taskDone', seat: b, sceneId: '0', data: { taskId: 't1', fake: true } });
    const wage = balance.economy.taskWage;
    expect(await until(() => seat(m, 0).priv.purse === wage && seat(m, 1).priv.purse === wage)).toBe(true);
    await sleep(150);
    const purses = matchEvents(m.room).filter((e) => e.kind === 'purse');
    expect(purses.map((e) => e.data)).toEqual([
      { seat: a, delta: wage, reason: 'wage' },
      { seat: b, delta: wage, reason: 'wage' },
    ]);
    expect(runInvariants(m.room).filter((f) => f.name === 'scripConserved')).toEqual([]);
  });

  it("pay a quest's scrip once, when its turn-in marks it done", async () => {
    const m = await startMatch(colyseus, 4);
    const quest = Object.values(quests.quests).find((q) => (q.scrip ?? 0) > 0)!;
    const state = new QuestState();
    state.id = quest.id;
    seat(m, 2).priv.quests.push(state);
    await sleep(150);
    expect(seat(m, 2).priv.purse).toBe(0);
    state.done = true;
    expect(await until(() => seat(m, 2).priv.purse === quest.scrip)).toBe(true);
    await sleep(200);
    expect(seat(m, 2).priv.purse).toBe(quest.scrip);
    expect(runInvariants(m.room).filter((f) => f.name === 'scripConserved')).toEqual([]);
  });
});
