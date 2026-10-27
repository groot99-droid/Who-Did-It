import type { ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { items, scenes, tasks } from '@wdi/content';
import {
  ErrorCode,
  ItemStack,
  Phase,
  S2C,
  TICK_RATE,
  TaskEntry,
  Winner,
  type PlayerState,
} from '@wdi/shared';
import { runInvariants } from '../src/sim/auto/invariants';
import { matchEvents } from '../src/sim/auto/log';
import { emitSim } from '../src/sim/events/bus';
import { npcMemory } from '../src/sim/npc/memory';
import {
  advance,
  allTownsfolk,
  bootNpcServer,
  errors,
  lobbyOf,
  pauseClock,
  placeSeat,
  send,
  start,
  toWorld,
  type Human,
  type Party,
} from './npcHelpers';

// Round 7, 7M (GDD 3.5, A133 (8), (9), (10)): the pick-up of a task's deliverable at its source prop, the `taskDone` sim
// event and the `taskBar` invariant. New file.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const FIX = tasks.tasks.fixPump!;
const propOf = (sceneId: string, propId: string) => {
  const prop = (scenes[sceneId as 'overworld']?.props ?? []).find((q) => q.id === propId);
  if (!prop) throw new Error(`no prop ${propId}`);
  return { scene: sceneId, x: prop.x, y: prop.y };
};
const BENCH = propOf(FIX.source!.scene, FIX.source!.prop);
const PUMP = propOf(FIX.targets[0]!.scene, FIX.targets[0]!.prop);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function world(): Promise<{ party: Party; h: Human; me: PlayerState }> {
  const party = await lobbyOf(colyseus, 4);
  await start(party);
  await toWorld(party);
  allTownsfolk(party.room);
  for (const p of party.room.state.players.values()) p.priv.tasks.clear();
  pauseClock(party.room);
  party.room.state.phase = Phase.day;
  party.room.state.phaseEndsTick = party.room.state.tick + 1e6;
  const h = party.humans[1]!;
  const me = party.room.state.players.get(h.id)!;
  me.priv.inventory.slots.clear();
  return { party, h, me };
}
function assign(me: PlayerState, id: string, fake = false, done = false): void {
  const t = new TaskEntry();
  t.id = id;
  t.done = done;
  t.fake = fake;
  me.priv.tasks.push(t);
}
function give(me: PlayerState, defId: string, qty: number): void {
  const s = new ItemStack();
  s.defId = defId;
  s.qty = qty;
  me.priv.inventory.slots.push(s);
}
const qty = (me: PlayerState, defId: string): number =>
  me.priv.inventory.slots.reduce((n, s) => (s.defId === defId ? n + s.qty : n), 0);
const stand = (party: Party, h: Human, at: { scene: string; x: number; y: number }) =>
  placeSeat(party, h.id, at.scene as 'overworld', at.x, at.y);
async function hold(party: Party, h: Human, taskId: string): Promise<void> {
  await send(h, 'act.hold', { action: 'task', targetId: taskId, on: true }, 80);
  advance(party, 3);
  await wait(80);
}
const opened = (h: Human) => h.log.filter((m) => m.type === S2C.minigameStart).length;

describe('the pick-up at a task source (GDD 3.5)', () => {
  it('puts the deliverable in the pockets once, and refuses while it is carried', async () => {
    const { party, h, me } = await world();
    assign(me, 'fixPump');
    stand(party, h, BENCH);
    await hold(party, h, 'fixPump');
    expect(qty(me, FIX.tool!)).toBe(FIX.toolQty ?? 1);
    expect(errors(h)).toEqual([]);
    expect(opened(h)).toBe(0);
    await hold(party, h, 'fixPump');
    expect(qty(me, FIX.tool!)).toBe(FIX.toolQty ?? 1);
    expect(errors(h)).toEqual([ErrorCode.cannot]);
  });

  it('refuses when the pockets are full, and gives nothing for a fake or a finished task', async () => {
    const { party, h, me } = await world();
    assign(me, 'fixPump');
    stand(party, h, BENCH);
    for (let i = 0; i < items.inventorySlots; i++) give(me, 'oil', 1); // every slot used
    await hold(party, h, 'fixPump');
    expect(qty(me, FIX.tool!)).toBe(0);
    expect(errors(h)).toEqual([ErrorCode.cannot]);

    me.priv.inventory.slots.clear();
    me.priv.tasks.clear();
    assign(me, 'fixPump', true);
    await hold(party, h, 'fixPump');
    expect(qty(me, FIX.tool!)).toBe(0);
    expect(errors(h)).toEqual([ErrorCode.cannot]); // nothing new: the show of work passes in silence

    me.priv.tasks.clear();
    assign(me, 'fixPump', false, true);
    await hold(party, h, 'fixPump');
    expect(qty(me, FIX.tool!)).toBe(0);
    expect(errors(h)).toEqual([ErrorCode.cannot, ErrorCode.cannot]); // 'not your task', as before
  });

  it('leaves the station hold as it was: at the target the tool is still needed, then the puzzle opens', async () => {
    const { party, h, me } = await world();
    assign(me, 'fixPump');
    stand(party, h, PUMP);
    await hold(party, h, 'fixPump');
    expect(errors(h)).toEqual([ErrorCode.cannot]);
    expect(opened(h)).toBe(0);
    stand(party, h, BENCH);
    await hold(party, h, 'fixPump');
    expect(qty(me, FIX.tool!)).toBe(1);
    stand(party, h, PUMP);
    await hold(party, h, 'fixPump');
    expect(opened(h)).toBe(1);
  });
});

/** Finishes the open puzzle by the Done control (GDD 3.16), once it has been open for its `assistS`. */
async function finish(party: Party, h: Human, taskId: string): Promise<void> {
  advance(party, 20 * TICK_RATE + 1);
  await send(h, 'minigame.result', { taskId, answer: { assist: true } }, 80);
  advance(party, 3);
  await wait(80);
}
const dones = (party: Party) => matchEvents(party.room).filter((e) => e.kind === 'taskDone');

describe('taskDone (A133 (9))', () => {
  it('fires for a fake task and a real one alike, names the seat and the task, and the bar follows the lists', async () => {
    const { party, h, me } = await world();
    assign(me, 'fixPump', true);
    stand(party, h, PUMP);
    await hold(party, h, 'fixPump');
    expect(opened(h)).toBe(1);
    await finish(party, h, 'fixPump');
    expect(me.priv.tasks[0]!.done).toBe(true);
    expect(party.room.state.taskBar).toBe(0);
    expect(dones(party)).toMatchObject([
      { kind: 'taskDone', seat: h.id, sceneId: 'overworld', data: { taskId: 'fixPump', fake: true } },
    ]);

    me.priv.tasks.clear();
    assign(me, 'fixPump');
    give(me, FIX.tool!, FIX.toolQty ?? 1);
    await hold(party, h, 'fixPump');
    await finish(party, h, 'fixPump');
    expect(dones(party)).toHaveLength(2);
    expect(dones(party)[1]).toMatchObject({ seat: h.id, data: { taskId: 'fixPump', fake: false } });
    expect(qty(me, FIX.tool!)).toBe(0);
    expect(party.room.state.taskBar).toBe(100);
    expect(party.room.state.winner).toBe(Winner.village);
  });
});

const failing = (party: Party) => runInvariants(party.room).map((f) => f.name);

describe('the taskBar invariant (A133 (10))', () => {
  it('fails on a bar the lists do not explain, on an NPC seat with a list, and on a taskDone nobody finished', async () => {
    const { party, h, me } = await world();
    expect(failing(party)).toEqual([]);
    assign(me, 'fixPump');
    party.room.state.taskBar = 50;
    expect(failing(party)).toEqual(['taskBar']);
    party.room.state.taskBar = 0;
    expect(failing(party)).toEqual([]);
    // A party of humans has no NPC seat, so one seat is marked as one for the check.
    const other = party.humans[2]!;
    const npc = party.room.state.players.get(other.id)!;
    npcMemory(party.room).ids.add(other.id);
    assign(npc, 'fixPump');
    expect(failing(party)).toEqual(['taskBar']);
    npc.priv.tasks.clear();
    npcMemory(party.room).ids.delete(other.id);
    me.priv.tasks.clear();
    assign(me, 'fixPump', false, true);
    party.room.state.taskBar = 100;
    expect(failing(party)).toEqual([]);
    // A completion the log claims but no list shows.
    emitSim(party.room, {
      tick: party.room.state.tick,
      kind: 'taskDone',
      seat: h.id,
      data: { taskId: 'mendFence', fake: false },
    });
    advance(party, 2);
    await wait(50);
    expect(dones(party)).toHaveLength(1);
    expect(failing(party)).toEqual(['taskBar']);
  });

  it('stays quiet through a fake and a real completion by the Done control', async () => {
    const { party, h, me } = await world();
    assign(me, 'fixPump', true);
    stand(party, h, PUMP);
    await hold(party, h, 'fixPump');
    await finish(party, h, 'fixPump');
    expect(dones(party)).toHaveLength(1);
    expect(failing(party)).toEqual([]);
    assign(me, 'mendFence');
    give(me, tasks.tasks.mendFence!.tool!, tasks.tasks.mendFence!.toolQty ?? 1);
    const fence = propOf(tasks.tasks.mendFence!.targets[0]!.scene, tasks.tasks.mendFence!.targets[0]!.prop);
    stand(party, h, fence);
    await hold(party, h, 'mendFence');
    await finish(party, h, 'mendFence');
    expect(dones(party)).toHaveLength(2);
    expect(party.room.state.taskBar).toBe(100);
    expect(failing(party)).toEqual([]);
  });
});
