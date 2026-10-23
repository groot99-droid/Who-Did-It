import { ColyseusTestServer, boot } from '@colyseus/testing';
import { balance, maps, scenes } from '@wdi/content';
import { Phase, S2C, TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { createServer } from '../src/server';
import { type SimEvent, onSim } from '../src/sim/events/bus';
import { stationOf } from '../src/sim/MapSites';
import { TRAIN_ARRIVE_LINE } from '../src/sim/Train';
import { eventsOf, sleep, teleport } from './killHelpers';
import { type Match, startMatch } from './simHelpers';

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

const ARRIVE = balance.train.arriveAtS * TICK_RATE;
const DELIVERY = balance.train.deliveryAfterS * TICK_RATE;
const DAY = balance.phases.dayS * TICK_RATE;

/** White-box: a new day of round `round` whose clock reads `elapsed` ticks, with `room.state.tick` unchanged. */
function dayAt(m: Match, round: number, elapsed: number): void {
  const state = m.room.state;
  state.round = round;
  state.phase = Phase.day;
  state.phaseEndsTick = state.tick + DAY - elapsed;
}

/** Every `train.*` event the bus delivers from now on. */
function trainEvents(room: PartyRoom): SimEvent[] {
  const out: SimEvent[] = [];
  for (const kind of ['train.arrive', 'train.delivery']) onSim(room, kind, (e) => out.push(e));
  return out;
}

const platform = () => {
  const p = scenes.overworld.spawns.find((q) => `overworld.${q.id}` === maps.hollowmere.station);
  if (!p) throw new Error('no platform');
  return p;
};

describe('the Daily Train (GDD 3.3)', () => {
  it('arrives arriveAtS into the day, then delivers deliveryAfterS later, once each per day', async () => {
    const m = await startMatch(colyseus, 2);
    const seen = trainEvents(m.room);
    const [near, far] = m.bots;
    const p = platform();
    teleport(m, near!, 'overworld', p.x - 1, p.y);
    teleport(m, far!, 'overworld', 25, 17);
    dayAt(m, 1, ARRIVE - 2);
    await sleep(400);
    expect(seen.map((e) => e.kind)).toEqual(['train.arrive']);
    expect(seen[0]).toMatchObject({
      sceneId: 'overworld',
      data: { map: 'hollowmere', station: 'overworld.platform', round: 1 },
    });
    expect(seen[0]!.seat).toBeUndefined();
    // Heard on the platform, not across the square; the log line reaches everyone.
    expect(eventsOf(near!, S2C.noise)).toContainEqual(expect.objectContaining({ kind: 'train_arrive' }));
    expect(eventsOf(far!, S2C.noise)).not.toContainEqual(expect.objectContaining({ kind: 'train_arrive' }));
    for (const bot of m.bots)
      expect(eventsOf(bot, S2C.chatMsg)).toEqual([{ from: '', text: TRAIN_ARRIVE_LINE, channel: 'system' }]);

    m.room.state.tick += DELIVERY;
    await sleep(300);
    expect(seen.map((e) => e.kind)).toEqual(['train.arrive', 'train.delivery']);
    expect(seen[1]!.data).toEqual({ map: 'hollowmere', station: 'overworld.platform', round: 1 });
    expect(eventsOf(near!, S2C.noise)).toContainEqual(expect.objectContaining({ kind: 'train_brake' }));

    // The rest of the day brings nothing more; the next day brings the next Train.
    m.room.state.tick += DELIVERY;
    await sleep(200);
    expect(seen).toHaveLength(2);
    dayAt(m, 2, ARRIVE);
    await sleep(300);
    expect(seen.map((e) => e.data?.round)).toEqual([1, 1, 2]);
  });

  it('never runs before its second, at night, on Blackpine or in the quick mode', async () => {
    const m = await startMatch(colyseus, 2);
    const seen = trainEvents(m.room);
    dayAt(m, 1, 0);
    await sleep(300);
    expect(seen).toEqual([]);
    m.room.state.phase = Phase.night;
    m.room.state.tick += ARRIVE + DELIVERY;
    await sleep(300);
    expect(seen).toEqual([]);

    m.room.state.settings.map = 'blackpine';
    expect(stationOf(m.room)).toBeUndefined();
    m.room.state.settings.map = 'hollowmere';
    expect(eventsOf(m.bots[0]!, S2C.chatMsg)).toEqual([]);
  });

  it('keeps the delivery when a meeting opens between the arrival and the delivery', async () => {
    const m = await startMatch(colyseus, 2);
    const seen = trainEvents(m.room);
    dayAt(m, 1, ARRIVE);
    await sleep(300);
    m.room.state.phase = Phase.meetingDiscussion;
    m.room.state.phaseEndsTick = m.room.state.tick + 20 * 3600;
    m.room.state.tick += DELIVERY;
    await sleep(300);
    expect(seen.map((e) => e.kind)).toEqual(['train.arrive', 'train.delivery']);
  });
});
