import type { ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { scenes } from '@wdi/content';
import {
  ErrorCode,
  ItemStack,
  Phase,
  S2C,
  TaskEntry,
  type CratesPublic,
  type PlayerState,
  type PourPublic,
  type SlidePublic,
} from '@wdi/shared';
import { recomputeTaskBar } from '../src/sim/Minigames';
import { simOf } from '../src/sim/RoomSim';
import {
  advance,
  allTownsfolk,
  bootNpcServer,
  errors,
  lobbyOf,
  pauseClock,
  placeSeat,
  send,
  setRole,
  start,
  toWorld,
  type Human,
  type Party,
} from './npcHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const propAt = (sceneId: string, propId: string) => {
  const prop = (scenes[sceneId as 'overworld']?.props ?? []).find((q) => q.id === propId);
  if (!prop) throw new Error(`no prop ${propId}`);
  return prop;
};
const PUMP = { scene: 'overworld', ...propAt('overworld', 'ov.pump') };
const FENCE = { scene: 'overworld', ...propAt('overworld', 'ov.fence') };
const LANTERN = { scene: 'overworld', ...propAt('overworld', 'ov.lantern_0') };

async function world(): Promise<{ party: Party; h: Human; me: PlayerState }> {
  const party = await lobbyOf(colyseus, 4);
  await start(party);
  await toWorld(party);
  allTownsfolk(party.room);
  pauseClock(party.room);
  party.room.state.phase = Phase.day;
  party.room.state.phaseEndsTick = party.room.state.tick + 1e6;
  const h = party.humans[1]!;
  const me = party.room.state.players.get(h.id)!;
  me.priv.inventory.slots.clear();
  return { party, h, me };
}

function give(me: PlayerState, defId: string, qty: number): void {
  const s = new ItemStack();
  s.defId = defId;
  s.qty = qty;
  me.priv.inventory.slots.push(s);
}
function assign(me: PlayerState, id: string, fake = false): void {
  const t = new TaskEntry();
  t.id = id;
  t.done = false;
  t.fake = fake;
  me.priv.tasks.push(t);
}
const qty = (me: PlayerState, defId: string): number =>
  me.priv.inventory.slots.reduce((n, s) => (s.defId === defId ? n + s.qty : n), 0);
const stand = (party: Party, h: Human, at: { scene: string; x: number; y: number }) =>
  placeSeat(party, h.id, at.scene as 'overworld', at.x, at.y);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Opens the task's mini-game by holding at its node; returns the `minigameStart` the client received. */
async function open(party: Party, h: Human, taskId: string) {
  const before = h.log.filter((m) => m.type === S2C.minigameStart).length;
  await send(h, 'act.hold', { action: 'task', targetId: taskId, on: true }, 80);
  advance(party, 3);
  await wait(80);
  return h.log.filter((m) => m.type === S2C.minigameStart).slice(before)[0]?.payload as
    { taskId: string; kind: string; public: unknown } | undefined;
}
async function answer(party: Party, h: Human, taskId: string, a: unknown): Promise<void> {
  await send(h, 'minigame.result', { taskId, answer: a }, 80);
  advance(party, 3);
  await wait(80);
}
const slideAnswer = (pub: unknown) => ({ slots: (pub as SlidePublic).order });
const cratesAnswer = (pub: unknown) => {
  const c = pub as CratesPublic;
  return { placed: c.steps, stop: c.bandStart + c.bandFrac / 2 };
};
const pourAnswer = (pub: unknown) => {
  const p = pub as PourPublic;
  return { holdsS: p.bands.map((b) => (b + p.bandFrac / 2) / p.ratePerS) };
};

describe('the task hold', () => {
  it('opens the mini-game without its solution and completes the task on a right answer', async () => {
    const { party, h, me } = await world();
    assign(me, 'fixPump');
    give(me, 'wrench', 1);
    stand(party, h, PUMP);
    const start = await open(party, h, 'fixPump');
    expect(start).toMatchObject({ taskId: 'fixPump', kind: 'slide' });
    expect(Object.keys(start ?? {}).sort()).toEqual(['kind', 'public', 'taskId']);
    expect(party.room.state.taskBar).toBe(0);
    await answer(party, h, 'fixPump', slideAnswer(start?.public));
    expect(me.priv.tasks[0]?.done).toBe(true);
    expect(qty(me, 'wrench')).toBe(0);
    expect(party.room.state.taskBar).toBe(100);
    expect(me.priv.ledger).toHaveLength(1);
    expect(me.priv.ledger[0]?.sceneId).toBe(simOf(party.room).players.get(h.id)?.sceneIdx);
  });

  it('completes nothing on a wrong answer and takes a right one afterwards', async () => {
    const { party, h, me } = await world();
    assign(me, 'mendFence');
    give(me, 'planks', 2);
    stand(party, h, FENCE);
    const start = await open(party, h, 'mendFence');
    expect(start?.kind).toBe('crates');
    const good = cratesAnswer(start?.public);
    await answer(party, h, 'mendFence', { placed: good.placed, stop: good.stop > 0.5 ? 0 : 1 });
    await answer(party, h, 'mendFence', { done: true });
    await answer(party, h, 'mendFence', 'done');
    expect(me.priv.tasks[0]?.done).toBe(false);
    expect(qty(me, 'planks')).toBe(2);
    expect(party.room.state.taskBar).toBe(0);
    expect(errors(h).filter((c) => c === ErrorCode.cannot).length).toBeGreaterThanOrEqual(3);
    await answer(party, h, 'mendFence', good);
    expect(me.priv.tasks[0]?.done).toBe(true);
    expect(qty(me, 'planks')).toBe(0);
    await answer(party, h, 'mendFence', good); // closed: a second result finds nothing open
    expect(party.room.state.taskBar).toBe(100);
  });

  it('runs a Cabal fake task the same way and never moves the task bar', async () => {
    const { party, h, me } = await world();
    setRole(party.room, h.id, 'killer');
    assign(me, 'fixPump', true);
    assign(party.room.state.players.get(party.humans[2]!.id)!, 'fixPump'); // a real task somewhere else
    stand(party, h, PUMP);
    const start = await open(party, h, 'fixPump'); // no wrench needed: it is a fake
    expect(start?.kind).toBe('slide');
    await answer(party, h, 'fixPump', { slots: [] });
    expect(me.priv.tasks[0]?.done).toBe(false);
    await answer(party, h, 'fixPump', slideAnswer(start?.public));
    expect(me.priv.tasks[0]?.done).toBe(true);
    expect(me.priv.ledger).toHaveLength(1);
    expect(party.room.state.taskBar).toBe(0);
  });

  it('refuses a task that is not yours, without the tool, too far away, or by day for a night task', async () => {
    const { party, h, me } = await world();
    stand(party, h, PUMP);
    expect(await open(party, h, 'fixPump')).toBeUndefined(); // not assigned
    assign(me, 'fixPump');
    expect(await open(party, h, 'fixPump')).toBeUndefined(); // no wrench
    give(me, 'wrench', 1);
    stand(party, h, { scene: 'overworld', x: 5, y: 5 });
    expect(await open(party, h, 'fixPump')).toBeUndefined(); // far from the pump
    expect(errors(h)).toEqual(expect.arrayContaining([ErrorCode.cannot, ErrorCode.outOfRange]));
    assign(me, 'lightLanterns');
    give(me, 'oil', 1);
    stand(party, h, LANTERN);
    expect(await open(party, h, 'lightLanterns')).toBeUndefined(); // it is day
    party.room.state.phase = Phase.night;
    const start = await open(party, h, 'lightLanterns');
    expect(start?.kind).toBe('pour');
    await answer(party, h, 'lightLanterns', pourAnswer(start?.public));
    expect(me.priv.tasks.find((t) => t.id === 'lightLanterns')?.done).toBe(true);
  });

  it('refuses a result for a task that is not open', async () => {
    const { party, h, me } = await world();
    assign(me, 'fixPump');
    give(me, 'wrench', 1);
    stand(party, h, PUMP);
    await answer(party, h, 'fixPump', { slots: [0] });
    expect(errors(h)).toContain(ErrorCode.cannot);
    const start = await open(party, h, 'fixPump');
    await answer(party, h, 'fetchFlour', slideAnswer(start?.public));
    expect(me.priv.tasks[0]?.done).toBe(false);
  });

  it('accepts the Done control only after the assist time', async () => {
    const { party, h, me } = await world();
    assign(me, 'fixPump');
    give(me, 'wrench', 1);
    stand(party, h, PUMP);
    await open(party, h, 'fixPump');
    await answer(party, h, 'fixPump', { assist: true });
    expect(me.priv.tasks[0]?.done).toBe(false);
    advance(party, 20 * 20); // the assist time (minigames.json) at 20 ticks a second
    await answer(party, h, 'fixPump', { assist: true });
    expect(me.priv.tasks[0]?.done).toBe(true);
  });

  it('drops the open puzzle when the seat leaves the node', async () => {
    const { party, h, me } = await world();
    assign(me, 'fixPump');
    give(me, 'wrench', 1);
    stand(party, h, PUMP);
    const start = await open(party, h, 'fixPump');
    stand(party, h, { scene: 'overworld', x: 5, y: 5 });
    await answer(party, h, 'fixPump', slideAnswer(start?.public));
    expect(me.priv.tasks[0]?.done).toBe(false);
    stand(party, h, PUMP);
    await answer(party, h, 'fixPump', slideAnswer(start?.public)); // the puzzle was dropped, not just paused
    expect(me.priv.tasks[0]?.done).toBe(false);
  });
});

describe('the task bar', () => {
  it('counts a ghost only up to the share cap and ignores fake tasks', async () => {
    const { party } = await world();
    for (const p of party.room.state.players.values()) p.priv.tasks.clear();
    const seats = [...party.room.state.players.values()];
    // Four real tasks each on two seats (eight in all); one is a ghost with every task done.
    for (const [i, p] of seats.slice(0, 2).entries()) {
      for (let k = 0; k < 4; k++) {
        assign(p, `t${i}${k}`);
        p.priv.tasks[k]!.done = i === 1;
      }
    }
    assign(seats[2]!, 'fakeOne', true);
    seats[2]!.priv.tasks[0]!.done = true;
    simOf(party.room).players.get(seats[1]!.id)!.dead = true;
    recomputeTaskBar(party.room);
    expect(party.room.state.taskBar).toBe(25); // four ghost tasks of eight would be 50, capped at a quarter
    seats[0]!.priv.tasks[0]!.done = true;
    seats[0]!.priv.tasks[1]!.done = true;
    recomputeTaskBar(party.room);
    expect(party.room.state.taskBar).toBe(50);
  });
});
