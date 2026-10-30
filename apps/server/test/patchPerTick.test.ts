import type { ColyseusTestServer } from '@colyseus/testing';
import { C2S } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INPUT_STALE_TICKS } from '../src/sim/constants';
import { simOf } from '../src/sim/RoomSim';
import { advance, bootNpcServer, pauseClock, placeSeat, send, standardParty } from './npcHelpers';
import { sleep } from './simHelpers';

// Round 10, x7 (A373): one patch per tick, sent by the fixed step; a quiet input lasts ten ticks.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

describe('one patch per tick', () => {
  it('sends a change with the next step and never from a timer between steps', async () => {
    const p = await standardParty(colyseus, 'S1');
    pauseClock(p.room);
    advance(p, 1);
    const client = p.humans[0]!.room.state as { phaseEndsTick: number };
    expect(p.room.patchRate).toBeNull();
    const mark = p.room.state.phaseEndsTick + 777_777;
    p.room.state.phaseEndsTick = mark;
    await sleep(250); // five of the old 50 ms patches
    expect(client.phaseEndsTick).not.toBe(mark);
    advance(p, 1);
    await sleep(100);
    expect(client.phaseEndsTick).toBe(mark);
  });

  it('keeps walking a seat on one input for INPUT_STALE_TICKS ticks, then stops it', async () => {
    const p = await standardParty(colyseus, 'S1');
    pauseClock(p.room);
    const human = p.humans[0]!;
    placeSeat(p, human.id, 'overworld', 30, 22);
    const me = simOf(p.room).players.get(human.id)!;
    await send(human, C2S.move, { seq: 1, dx: 0, dy: 1, sprint: false, sneak: false }, 80);
    advance(p, 1); // the step takes the input: its tick is this one
    expect(me.input?.dy).toBe(1);
    expect(INPUT_STALE_TICKS).toBe(10);
    advance(p, INPUT_STALE_TICKS - 1);
    expect(me.input?.dy).toBe(1); // nine ticks on: still walking (five used to stop it)
    expect(me.vy).toBeGreaterThan(0);
    advance(p, 1);
    expect(me.input?.dy).toBe(1); // the tenth tick is the last one walked
    advance(p, 1);
    expect(me.input).toBeNull(); // the eleventh stops it
    expect(me.vy).toBe(0);
  });
});
