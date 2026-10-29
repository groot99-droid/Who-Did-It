import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { C2S, S2C, type LockAttempt, type LockpickPublic, type RefusalFrame } from '@wdi/shared';
import { addStack, count } from '../src/sim/Inventory';
import { advance, bootNpcServer, pauseClock, placeSeat, send, standardParty, type Party } from './npcHelpers';
import { sleep } from './simHelpers';

// Round 10 (D5; GDD 3.29): the lock-pick on the manor study door. The hold opens a mini-game that sends the picker the
// pins and their set points; the trace it answers with is replayed on the server.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const DOOR = 'mu.study_door';

async function atDoor(picks: number): Promise<Party> {
  const p = await standardParty(colyseus, 'S1');
  pauseClock(p.room);
  const human = p.humans[0]!;
  placeSeat(p, human.id, 'manor_upper', 6, 9);
  const seat = p.room.state.players.get(human.id)!;
  seat.priv.inventory.slots.clear();
  if (picks > 0) addStack(seat, 'lockpicks', picks);
  advance(p, 1);
  return p;
}

async function pick(p: Party): Promise<void> {
  await send(p.humans[0]!, C2S.hold, { action: 'interact', targetId: DOOR, on: true }, 60);
  advance(p, 1);
  await sleep(80);
}

const starts = (p: Party) => p.humans[0]!.log.filter((m) => m.type === S2C.minigameStart);
const refusals = (p: Party): RefusalFrame[] =>
  p.humans[0]!.log.filter((m) => m.type === 'error').map((m) => m.payload as RefusalFrame);
const doorState = (p: Party) => p.room.state.scenes.get('manor_upper')!.propStates.get(DOOR)?.state;

async function answer(p: Party, trace: LockAttempt[]): Promise<void> {
  await send(p.humans[0]!, 'minigame.result', { taskId: DOOR, answer: { trace } }, 80);
  advance(p, 1);
  await sleep(80);
}

const honest = (pub: LockpickPublic, tension = 0.3): LockAttempt[] =>
  pub.setPoints.map((s, pin) => ({ t: 1 + pin, pin, lift: s, tension }));

describe('the lock-pick', () => {
  it('refuses a seat without picks NEED_TOOL and opens nothing', async () => {
    const p = await atDoor(0);
    await pick(p);
    expect(refusals(p).at(-1)).toMatchObject({ reason: 'NEED_TOOL' });
    expect(starts(p)).toHaveLength(0);
  });

  it('sends the picker the pins, set points and band, and opens the door on a full trace', async () => {
    const p = await atDoor(1);
    await pick(p);
    expect(starts(p)).toHaveLength(1);
    const msg = starts(p)[0]!.payload as { taskId: string; kind: string; public: LockpickPublic };
    expect(msg).toMatchObject({ taskId: DOOR, kind: 'lockpick' });
    expect(msg.public.pins).toBe(3);
    expect(msg.public.setPoints).toHaveLength(3);
    await answer(p, honest(msg.public));
    expect(doorState(p)).toBe('open');
    expect(count(p.room.state.players.get(p.humans[0]!.id)!, 'lockpicks')).toBe(1);
  });

  it('snaps the pick on too much tension: one Lockpicks gone, PICK_SNAPPED, the door still locked', async () => {
    const p = await atDoor(2);
    await pick(p);
    const pub = (starts(p)[0]!.payload as { public: LockpickPublic }).public;
    await answer(p, [{ t: 1, pin: 0, lift: pub.setPoints[0]!, tension: 0.95 }]);
    expect(refusals(p).at(-1)).toMatchObject({ reason: 'PICK_SNAPPED' });
    expect(count(p.room.state.players.get(p.humans[0]!.id)!, 'lockpicks')).toBe(1);
    expect(doorState(p)).toBeUndefined();
  });

  it('asks again on a trace that leaves a pin unset, and keeps the board open', async () => {
    const p = await atDoor(1);
    await pick(p);
    const pub = (starts(p)[0]!.payload as { public: LockpickPublic }).public;
    await answer(p, honest(pub).slice(0, 2));
    expect(refusals(p).at(-1)).toMatchObject({ reason: 'BAD_REQUEST' });
    await answer(p, honest(pub));
    expect(doorState(p)).toBe('open');
  });

  it('deals the same set points to a second attempt on the same lock', async () => {
    const p = await atDoor(2);
    await pick(p);
    const first = (starts(p)[0]!.payload as { public: LockpickPublic }).public;
    await pick(p);
    const second = (starts(p).at(-1)!.payload as { public: LockpickPublic }).public;
    expect(second.setPoints).toEqual(first.setPoints);
  });
});
