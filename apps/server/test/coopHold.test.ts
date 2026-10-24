import type { ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { scenes, tasks } from '@wdi/content';
import { ErrorCode, Phase, S2C, TICK_RATE, TaskEntry, type PlayerState } from '@wdi/shared';
import { matchEvents } from '../src/sim/auto/log';
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

// Round 7, 7M (GDD 3.5, A133 (11)): the co-op hold of Shutter the windows. New file.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const SHUTTER = tasks.tasks.shutterWindows!;
const NODE = SHUTTER.targets[0]!;
const PROP = scenes[NODE.scene as 'overworld']!.props.find((q) => q.id === NODE.prop)!;
const HOLD_TICKS = Math.round(SHUTTER.holdS * TICK_RATE);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function world(): Promise<{ party: Party; a: Human; b: Human; pa: PlayerState; pb: PlayerState }> {
  const party = await lobbyOf(colyseus, 4);
  await start(party);
  await toWorld(party);
  allTownsfolk(party.room);
  for (const p of party.room.state.players.values()) p.priv.tasks.clear();
  pauseClock(party.room);
  party.room.state.phase = Phase.day;
  party.room.state.phaseEndsTick = party.room.state.tick + 1e6;
  const a = party.humans[1]!;
  const b = party.humans[2]!;
  for (const h of [a, b]) placeSeat(party, h.id, NODE.scene as 'overworld', PROP.x, PROP.y);
  return { party, a, b, pa: party.room.state.players.get(a.id)!, pb: party.room.state.players.get(b.id)! };
}
function assign(me: PlayerState, fake = false, id = SHUTTER.id): void {
  const t = new TaskEntry();
  t.id = id;
  t.fake = fake;
  me.priv.tasks.push(t);
}
async function hold(party: Party, h: Human, on = true): Promise<void> {
  await send(h, 'act.hold', { action: 'task', targetId: SHUTTER.id, on }, 60);
  advance(party, 1);
  await wait(40);
}
const done = (me: PlayerState) => me.priv.tasks.some((t) => t.id === SHUTTER.id && t.done);
const dones = (party: Party) => matchEvents(party.room).filter((e) => e.kind === 'taskDone');
const heard = (h: Human) =>
  h.log
    .filter((m) => m.type === S2C.coopHold)
    .map((m) => m.payload as { taskId: string; holders: number; progress: number });
/** Every `coopHold` b heard, byte for byte what a heard over the same span: the payload names no seat and no list. */
function sameWire(a: Human, b: Human): void {
  const hb = heard(b);
  expect(hb.length).toBeGreaterThan(0);
  expect(heard(a).slice(-hb.length)).toEqual(hb);
}

describe('the co-op hold (GDD 3.5)', () => {
  it('needs two hands: one alone pauses, two finish it for both lists, real and fake alike', async () => {
    const { party, a, b, pa, pb } = await world();
    assign(pa);
    assign(pb, true);
    await hold(party, a);
    advance(party, HOLD_TICKS + 5);
    await wait(40);
    expect(done(pa)).toBe(false);
    expect(heard(a).at(-1)).toMatchObject({ holders: 1, progress: 0 });
    await hold(party, b);
    advance(party, HOLD_TICKS);
    await wait(60);
    expect(done(pa)).toBe(true);
    expect(done(pb)).toBe(true);
    expect(party.room.state.taskBar).toBe(100);
    expect(
      dones(party)
        .map((e) => [e.seat, e.data?.fake])
        .sort(),
    ).toEqual(
      [
        [a.id, false],
        [b.id, true],
      ].sort(),
    );
    expect(pa.priv.ledger).toHaveLength(1);
    expect(pb.priv.ledger).toHaveLength(1);
    const seen = heard(a);
    expect(seen.some((m) => m.holders === 2 && m.progress > 0 && m.progress < 1)).toBe(true);
    expect(seen.at(-1)).toMatchObject({ holders: 2, progress: 1 });
    sameWire(a, b); // the fake list's holder hears exactly what the real one hears
  });

  it('pauses while one hand is off and keeps the progress, but starts over once both have let go', async () => {
    const { party, a, b, pa } = await world();
    assign(pa);
    assign(pa, false, 'fixPump'); // a second real task, so the first completion does not fill the bar and end the match
    await hold(party, a);
    await hold(party, b);
    advance(party, HOLD_TICKS / 2);
    await hold(party, b, false);
    advance(party, HOLD_TICKS);
    await wait(40);
    expect(done(pa)).toBe(false);
    expect(heard(a).at(-1)).toMatchObject({ holders: 1 });
    // Resumed, the hold needs only its other half: a count that had started over would still be short here.
    await hold(party, b);
    advance(party, HOLD_TICKS / 2 + 5);
    await wait(40);
    expect(done(pa)).toBe(true);
    // Round two: both let go half way, so the next hold begins from nothing.
    pa.priv.tasks.clear();
    assign(pa);
    await hold(party, a);
    await hold(party, b);
    advance(party, HOLD_TICKS / 2);
    await hold(party, a, false);
    await hold(party, b, false);
    await hold(party, a);
    await hold(party, b);
    advance(party, HOLD_TICKS / 2);
    await wait(40);
    expect(done(pa)).toBe(false);
    advance(party, HOLD_TICKS / 2);
    await wait(40);
    expect(done(pa)).toBe(true);
  });

  it('lets a helper without the task hold, who earns nothing, and refuses a hold from too far', async () => {
    const { party, a, b, pa, pb } = await world();
    assign(pa);
    assign(pa, false, 'fixPump');
    await hold(party, a);
    await hold(party, b);
    advance(party, HOLD_TICKS + 2);
    await wait(60);
    expect(done(pa)).toBe(true);
    expect(pb.priv.tasks).toHaveLength(0);
    expect(pb.priv.ledger).toHaveLength(0);
    expect(dones(party)).toHaveLength(1);
    expect(party.room.state.taskBar).toBe(50);
    sameWire(a, b); // the helper learns nothing beyond what the holder with the task hears
    placeSeat(party, b.id, NODE.scene as 'overworld', PROP.x + 6, PROP.y + 6);
    await hold(party, b);
    expect(errors(b).at(-1)).toBe(ErrorCode.outOfRange);
  });
});
