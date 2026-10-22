import { type ColyseusTestServer, boot } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase, S2C, TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { beginPlay } from '../src/rooms/handlers/lobby';
import { createServer } from '../src/server';

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => colyseus.shutdown());
beforeEach(async () => colyseus.cleanup());

async function begin(map: string): Promise<{ room: PartyRoom; sent: Array<[unknown, unknown]> }> {
  const room = (await colyseus.createRoom('party', {})) as unknown as PartyRoom;
  room.state.settings.map = map;
  const sent: Array<[unknown, unknown]> = [];
  vi.spyOn(room, 'broadcast').mockImplementation(((type: unknown, payload: unknown) => {
    sent.push([type, payload]);
  }) as never);
  beginPlay(room);
  return { room, sent };
}

describe('the opening cutscene (GDD 3.18)', () => {
  it('is broadcast once at the start of grace, which openingS lengthens', async () => {
    const { room, sent } = await begin('hollowmere');
    expect(sent.filter(([t]) => t === S2C.cutscene)).toEqual([[S2C.cutscene, { id: 'openingHollowmere' }]]);
    expect(room.state.phase).toBe(Phase.grace);
    const ticks = room.state.phaseEndsTick - room.state.tick;
    expect(ticks).toBe((balance.phases.graceS + balance.phases.openingS) * TICK_RATE);
  });

  it('names the map it starts on', async () => {
    const { sent } = await begin('blackpine');
    expect(sent.filter(([t]) => t === S2C.cutscene)).toEqual([[S2C.cutscene, { id: 'openingBlackpine' }]]);
  });
});
