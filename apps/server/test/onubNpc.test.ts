import type { ColyseusTestServer } from '@colyseus/testing';
import { Phase } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type MatchRecord, matchLog } from '../src/services/MatchLog';
import { onubNpcPlan } from '../src/sim/Onub';
import { bootFlowServer } from './flowHelpers';
import {
  castVotes,
  endWindow,
  events,
  onub,
  openWindow,
  plate,
  presencesSeen,
  startOnub,
  toMeeting,
  toNight,
  until,
} from './onubHelpers';
import { sleep } from './simHelpers';

// S's NPC seats land in another branch: until then a seat is made an NPC by listing its id here, which is all
// the Conductor reads (`isNpcSeat`). The test bots still hold real clients, but they never send an act.
const npcIds = vi.hoisted(() => new Set<string>());
vi.mock('../src/sim/Npc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/sim/Npc')>()),
  isNpcSeat: (_room: unknown, id: string) => npcIds.has(id),
}));

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
const lines: string[] = [];
const write = matchLog.write;
beforeAll(async () => {
  ({ colyseus, release } = await bootFlowServer());
  matchLog.write = (line) => void lines.push(line);
});
afterAll(async () => {
  matchLog.write = write;
  await release();
});
beforeEach(async () => {
  npcIds.clear();
  lines.length = 0;
  await colyseus.cleanup();
});

const RIG8 = {
  Bot0: 'poisoner',
  Bot1: 'poisoner',
  Bot2: 'sinEater',
  Bot3: 'cutpurse',
  Bot4: 'busybody',
  Bot5: 'hireling',
  Bot6: 'lamplighter',
  Bot7: 'sot',
};

describe('NPC wakers (GDD 3.11, 3.12)', () => {
  it('plans a legal act at the window start, offers it to the brain, and applies it itself when the window ends', async () => {
    const m = await startOnub(colyseus, 8, RIG8);
    const npc = m.bots[3]!;
    npcIds.add(npc.id);
    await toNight(m);
    onub(m).rng = () => 0.99; // the last act of the flat draw
    await openWindow(m, 'cutpurse');
    const plan = onubNpcPlan(m.room, npc.id);
    expect(plan).not.toBeNull();
    expect(plan?.abilityId).toBe('onub.take');
    expect(plan?.targetId).toMatch(/^bk\.plate_[0-7]$/);
    expect(plan?.targetId).not.toBe(plate(m, npc));
    expect(onubNpcPlan(m.room, m.bots[0]!.id)).toBeNull();
    const before = onub(m).loaves.get(plan!.targetId);
    await endWindow(m);
    expect(onub(m).loaves.get(plate(m, npc))).toBe(before);
    expect(onub(m).loaves.get(plan!.targetId)).toBe('cutpurse');
    expect(onub(m).swapLog).toEqual([
      { order: 5, roleId: 'cutpurse', act: 'onub.take', slots: [plate(m, npc), plan!.targetId] },
    ]);
    expect(onubNpcPlan(m.room, npc.id)).toBeNull();
    expect(events(npc, 'nightReveal')).toHaveLength(1); // the reveal is the brain's to use; the seat has no client
  }, 30_000);

  it('may do nothing when the seeded draw says so', async () => {
    const m = await startOnub(colyseus, 8, RIG8);
    const npc = m.bots[3]!;
    npcIds.add(npc.id);
    await toNight(m);
    onub(m).rng = () => 0;
    await openWindow(m, 'cutpurse');
    expect(onubNpcPlan(m.room, npc.id)).toBeNull();
    await endWindow(m);
    expect(onub(m).swapLog).toEqual([]);
  }, 30_000);

  it("always plans the Sot's mandatory swap with a dead loaf", async () => {
    const m = await startOnub(colyseus, 8, RIG8);
    const npc = m.bots[7]!;
    npcIds.add(npc.id);
    await toNight(m);
    onub(m).rng = () => 0;
    await openWindow(m, 'sot');
    expect(onubNpcPlan(m.room, npc.id)).toMatchObject({
      abilityId: 'onub.swapDead',
      targetId: 'bk.deadloaf_0',
    });
    await endWindow(m);
    expect(onub(m).swapLog).toHaveLength(1);
    expect(onub(m).loaves.get('bk.deadloaf_0')).toBe('sot');
  }, 30_000);

  it('wakes an NPC Poisoner like a human: its presence reaches its human partner', async () => {
    const m = await startOnub(colyseus, 8, RIG8);
    npcIds.add(m.bots[1]!.id);
    await toNight(m);
    await openWindow(m, 'poisoner');
    expect(presencesSeen(m, m.bots[0]!)).toEqual([m.bots[1]!.id]);
    expect(presencesSeen(m, m.bots[5]!)).toEqual([]);
    await endWindow(m);
    expect(presencesSeen(m, m.bots[0]!)).toEqual([]);
  }, 30_000);

  it('marks NPC seats in the match log and nowhere on the wire', async () => {
    const m = await startOnub(colyseus, 6, {
      Bot0: 'poisoner',
      Bot1: 'poisoner',
      Bot2: 'hireling',
      Bot3: 'debtor',
    });
    npcIds.add(m.bots[3]!.id);
    await toMeeting(m);
    await castVotes(m, (i) => m.bots[(i + 1) % 6]!.id);
    expect(await until(() => m.room.state.phase === Phase.reveal)).toBe(true);
    await sleep(200);
    m.room.state.phaseEndsTick = m.room.state.tick;
    expect(await until(() => lines.length === 1)).toBe(true);
    const record = JSON.parse(lines[0]!) as MatchRecord;
    expect(record.players.map((p) => p.isNpc === true)).toEqual([false, false, false, true, false, false]);
    for (const b of m.bots) {
      expect(JSON.stringify(events(b, 'gameOver'))).not.toMatch(/isNpc|npc/i);
    }
  }, 30_000);
});
