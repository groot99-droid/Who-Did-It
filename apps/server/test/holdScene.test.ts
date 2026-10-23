import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import { enterScene } from '../src/sim/Portals';
import { act, playerOf, prop, simOfBot, sleep, teleport, toDay } from './killHelpers';
import { startMatch } from './simHelpers';

// Round 7 (7K, A118): a scene change cancels a hold on the same tick, so no seat is ever seen holding a clue of the
// scene it has just left (the meeting move runs after the holds in the step).

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  process.env.WDI_DEBUG = '1';
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => {
  delete process.env.WDI_DEBUG;
  await colyseus.shutdown();
});
beforeEach(async () => colyseus.cleanup());

describe('a hold across a scene change', () => {
  it('is null on the tick enterScene moves the seat', async () => {
    const m = await startMatch(colyseus, 4, {
      Bot0: 'killer',
      Bot1: 'detective',
      Bot2: 'townsfolk',
      Bot3: 'townsfolk',
    });
    toDay(m);
    const teach = prop('ov.teaching_clue');
    const b = m.bots[2]!;
    teleport(m, b, 'overworld', teach.x, teach.y + 1);
    await sleep(300);
    await act(b, 'act.hold', { action: 'collect', targetId: 'clue_teaching', on: true }, 100);
    const p = simOfBot(m, b);
    expect(p.hold).toMatchObject({ action: 'collect', targetId: 'clue_teaching' });
    const tick = m.room.state.tick;
    expect(enterScene(m.room, playerOf(m, b), p, 'bakery', 'door', false, false)).toBe(true);
    expect(m.room.state.tick).toBe(tick);
    expect(p.hold).toBeNull();
  });
});
