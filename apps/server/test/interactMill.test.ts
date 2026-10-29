import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { C2S, TICK_RATE, type RefusalFrame } from '@wdi/shared';
import { addStack, count, take } from '../src/sim/Inventory';
import { interactReady } from '../src/sim/interact/resolve';
import { advance, bootNpcServer, pauseClock, placeSeat, send, standardParty, type Party } from './npcHelpers';
import { sleep } from './simHelpers';

// Round 10 (D3; GDD 3.14 "The mill"): Logs become Timber only at a saw. The head saw gives two Timber for a log in
// 4 s, a saw horse one in 8 s, and a seat with no log is refused NEED_ITEM.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const SAW = { target: 'bs.head_saw', x: 11, y: 6, holdS: 4, out: 2 };
const HORSE = { target: 'bs.saw_horse', x: 8, y: 11, holdS: 8, out: 1 };

async function at(spot: { x: number; y: number }, logs: number): Promise<Party> {
  const p = await standardParty(colyseus, 'S1');
  pauseClock(p.room);
  const human = p.humans[0]!;
  placeSeat(p, human.id, 'bp_mill', spot.x, spot.y);
  const seat = p.room.state.players.get(human.id)!;
  seat.priv.inventory.slots.clear();
  if (logs > 0) addStack(seat, 'logs', logs);
  advance(p, 1);
  return p;
}

async function hold(p: Party, targetId: string): Promise<void> {
  await send(p.humans[0]!, C2S.hold, { action: 'interact', targetId, on: true }, 60);
  advance(p, 1);
  await sleep(80);
}

const refusals = (p: Party): RefusalFrame[] =>
  p.humans[0]!.log.filter((m) => m.type === 'error').map((m) => m.payload as RefusalFrame);

describe.each([
  ['the head saw', SAW],
  ['a saw horse', HORSE],
])('%s', (_name, saw) => {
  it('turns one log into its Timber after its hold, bare-handed', async () => {
    const p = await at(saw, 3);
    const seat = p.room.state.players.get(p.humans[0]!.id)!;
    await hold(p, saw.target);
    advance(p, Math.round((saw.holdS - 1) * TICK_RATE));
    expect(count(seat, 'timber')).toBe(0);
    advance(p, 2 * TICK_RATE);
    expect(count(seat, 'timber')).toBe(saw.out);
    expect(count(seat, 'logs')).toBe(2);
  });

  it('refuses a seat with no log NEED_ITEM and gives no Timber', async () => {
    const p = await at(saw, 0);
    const seat = p.room.state.players.get(p.humans[0]!.id)!;
    await hold(p, saw.target);
    advance(p, (saw.holdS + 2) * TICK_RATE);
    expect(refusals(p).at(-1)).toMatchObject({ reason: 'NEED_ITEM' });
    expect(count(seat, 'timber')).toBe(0);
  });
});

describe('the logs a saw consumes', () => {
  it('cancels the hold when the logs leave the pack mid-hold, and gives no Timber', async () => {
    const p = await at(SAW, 1);
    const seat = p.room.state.players.get(p.humans[0]!.id)!;
    await hold(p, SAW.target);
    advance(p, 2 * TICK_RATE);
    take(seat, 'logs', 1);
    advance(p, (SAW.holdS + 2) * TICK_RATE);
    expect(count(seat, 'timber')).toBe(0);
  });

  it('is no station for a seat without logs (interactReady), and is one with them', async () => {
    const p = await at(SAW, 0);
    const seat = p.room.state.players.get(p.humans[0]!.id)!;
    expect(interactReady(p.room, seat, 'bp_mill', 'bs.head_saw')).toBe(false);
    addStack(seat, 'logs', 1);
    expect(interactReady(p.room, seat, 'bp_mill', 'bs.head_saw')).toBe(true);
  });
});
