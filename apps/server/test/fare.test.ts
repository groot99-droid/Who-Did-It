import { ColyseusTestServer, boot } from '@colyseus/testing';
import { type SceneId, balance, scenes } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import { matchEvents } from '../src/sim/auto/log';
import { emitSim } from '../src/sim/events/bus';
import { addFare, fareOf, owesFare } from '../src/sim/economy/fare';
import { TOWN, balanceOf, movePurse } from '../src/sim/economy/purse';
import { duesOf } from '../src/sim/economy/rent';
import { creatureKill } from '../src/sim/Kill';
import { act, eventsOf, playerOf, setPhase, sleep, teleport } from './killHelpers';
import { type Match, startMatch, stateOf } from './simHelpers';

/** Round 10, C2 (GDD 3.23; docs/round9/world-mode.md 6, followup-4 2.5): Owing the line. */

function floorPair(sceneId: SceneId): { x: number; y: number } {
  const grid = scenes[sceneId].grid;
  for (let y = 0; y < grid.length; y++) {
    const x = grid[y]!.indexOf('..');
    if (x >= 0) return { x, y };
  }
  throw new Error(`no floor in ${sceneId}`);
}

/** HollowMere's bank counter lands with its art, so this test stands its own, as `rent.test.ts` does. */
const HALL = floorPair('manor_hall');
const bank = { id: 'mh.test_fare_bank', kind: 'bank', x: HALL.x, y: HALL.y };
type Prop = (typeof scenes.manor_hall.props)[number];

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  scenes.manor_hall.props.push(bank as Prop);
  process.env.WDI_DEBUG = '1';
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => {
  scenes.manor_hall.props.splice(scenes.manor_hall.props.indexOf(bank as Prop), 1);
  delete process.env.WDI_DEBUG;
  await colyseus.shutdown();
});
beforeEach(async () => colyseus.cleanup());

const fare = balance.respawn.fareDebt;
const village = { Bot0: 'baker', Bot1: 'doctor', Bot2: 'vicar', Bot3: 'killer' };

/** A match in a day of round 1, every seat's purse set to `scrip`. */
async function inDay(scrip: number): Promise<Match> {
  const m = await startMatch(colyseus, 4, village);
  for (const b of m.bots) {
    movePurse(m.room, b.id, TOWN, playerOf(m, b).priv.purse, 'buy');
    movePurse(m.room, TOWN, b.id, scrip, 'stake');
  }
  m.room.state.round = 1;
  setPhase(m, Phase.day);
  await sleep(100);
  return m;
}

const reasons = (m: Match, i: number) =>
  eventsOf(m.bots[i]!, 'error').map((e) => (e as { reason?: string }).reason);

describe('Owing the line (GDD 3.23)', () => {
  it('owes a fare for every return on the morning train, privately', async () => {
    const m = await inDay(0);
    const [seat, other] = m.bots;
    creatureKill(m.room, seat!.id, 'wolf');
    await sleep(200);
    const state = m.room.state;
    state.round = 2;
    state.phase = Phase.day;
    state.phaseEndsTick = state.tick + (balance.phases.dayS - balance.train.arriveAtS) * TICK_RATE;
    await sleep(400);
    expect(fareOf(m.room, seat!.id)).toBe(fare);
    expect(playerOf(m, seat!).priv.fare).toBe(fare);
    expect(matchEvents(m.room).some((e) => e.kind === 'fare.owed' && e.seat === seat!.id)).toBe(true);
    // Only the seat's own view carries it.
    expect(stateOf(other!).players.get(seat!.id)?.priv).toBeUndefined();
    expect(stateOf(seat!).players.get(seat!.id)?.priv?.fare).toBe(fare);
    addFare(m.room, seat!.id);
    expect(playerOf(m, seat!).priv.fare).toBe(2 * fare);
  });

  it('cuts the town’s wages and sales to an owing seat, rounded down, and the town keeps the rest', async () => {
    const m = await inDay(0);
    const [owing, clear] = m.bots;
    addFare(m.room, owing!.id);
    emitSim(m.room, { tick: m.room.state.tick, kind: 'taskDone', seat: owing!.id });
    emitSim(m.room, { tick: m.room.state.tick, kind: 'taskDone', seat: clear!.id });
    await sleep(200);
    const wage = balance.economy.taskWage;
    expect(balanceOf(m.room, owing!.id)).toBe(Math.floor(wage * balance.respawn.wageMult));
    expect(balanceOf(m.room, clear!.id)).toBe(wage);
    expect(movePurse(m.room, TOWN, owing!.id, 5, 'sale')).toBe(Math.floor(5 * balance.respawn.wageMult));
    // What the seat pays out, and a bank move, are its own coin: never cut.
    expect(movePurse(m.room, owing!.id, `@bank:${owing!.id}`, 1, 'bank')).toBe(1);
  });

  it('is paid whole at a bank counter, after the rent, and then the pay is whole again', async () => {
    const m = await inDay(fare - 1);
    const [seat] = m.bots;
    addFare(m.room, seat!.id);
    teleport(m, seat!, 'manor_hall', bank.x + 1, bank.y);
    await act(seat!, 'act.payRent', {});
    expect(reasons(m, 0)).toEqual(['NEED_SCRIP']);
    expect(owesFare(m.room, seat!.id)).toBe(true);
    movePurse(m.room, TOWN, seat!.id, 1, 'stake');
    await act(seat!, 'act.payRent', {});
    expect(owesFare(m.room, seat!.id)).toBe(false);
    expect(playerOf(m, seat!).priv.fare).toBe(0);
    expect(balanceOf(m.room, seat!.id)).toBe(0);
    await act(seat!, 'act.payRent', {});
    expect(reasons(m, 0)).toEqual(['NEED_SCRIP', 'NOTHING_OWED']);
    expect(movePurse(m.room, TOWN, seat!.id, 3, 'wage')).toBe(3);

    // Rent and a fare together: the rent first, then the fare when the purse covers both.
    addFare(m.room, seat!.id);
    duesOf(m.room).debt.set(seat!.id, 6);
    movePurse(m.room, TOWN, seat!.id, 6 + fare - 3, 'stake');
    await act(seat!, 'act.payRent', {});
    expect(duesOf(m.room).debt.has(seat!.id)).toBe(false);
    expect(owesFare(m.room, seat!.id)).toBe(false);
    expect(balanceOf(m.room, seat!.id)).toBe(0);
  });
});
