import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, scenes } from '@wdi/content';
import { Phase, type PlayerState } from '@wdi/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runInvariants } from '../src/sim/auto/invariants';
import { matchEvents } from '../src/sim/auto/log';
import { STRONGBOX } from '../src/sim/economy/bank';
import { TOWN, balanceOf, bankAccount, movePurse } from '../src/sim/economy/purse';
import { emitSim } from '../src/sim/events/bus';
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

// Round 8, Session 8C (GDD 3.23; docs/round8/economy.md 2): the bank and the heist's take. 8J and 8K place the bank
// counters, so this test stands one of its own in the manor hall (as the shop tests do).

type Prop = (typeof scenes.manor_hall.props)[number];
const BANK_ID = 'mh.bank_counter';
const HALL = (() => {
  const grid = scenes.manor_hall.grid;
  for (let y = 0; y < grid.length; y++) {
    const x = grid[y]!.indexOf('.');
    if (x >= 0) return { x, y };
  }
  throw new Error('no floor in the manor hall');
})();

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
  scenes.manor_hall.props.push({ id: BANK_ID, kind: 'bank', x: HALL.x, y: HALL.y } as Prop);
});
afterAll(async () => {
  const props = scenes.manor_hall.props;
  props.splice(
    props.findIndex((p) => p.id === BANK_ID),
    1,
  );
  await release();
});

async function world(): Promise<{ party: Party; h: Human; me: PlayerState }> {
  const party = await lobbyOf(colyseus, 4);
  await start(party);
  await toWorld(party);
  allTownsfolk(party.room);
  pauseClock(party.room);
  advance(party, 2); // pays the stakes
  party.room.state.phase = Phase.day;
  party.room.state.phaseEndsTick = party.room.state.tick + 1e6;
  const h = party.humans[1]!;
  return { party, h, me: party.room.state.players.get(h.id)! };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function act(party: Party, h: Human, type: string, payload: unknown): Promise<void> {
  await send(h, type, payload, 60);
  advance(party, 2);
  await wait(60);
}
const conserved = (party: Party) =>
  expect(runInvariants(party.room).filter((f) => f.name === 'scripConserved')).toEqual([]);

describe('the bank', () => {
  it('takes deposits and pays withdrawals at its counter, the whole amount or nothing', async () => {
    const { party, h, me } = await world();
    movePurse(party.room, TOWN, h.id, 10, 'wage');
    placeSeat(party, h.id, 'manor_hall', HALL.x, HALL.y);
    const purse = me.priv.purse;

    await act(party, h, 'act.bank', { op: 'deposit', amount: 4 }); // no bank open yet
    expect([me.priv.purse, me.priv.bank]).toEqual([purse, 0]);
    await act(party, h, 'act.hold', { action: 'bank', targetId: BANK_ID, on: true });
    await act(party, h, 'act.bank', { op: 'deposit', amount: 4 });
    await act(party, h, 'act.bank', { op: 'withdraw', amount: 1 });
    expect([me.priv.purse, me.priv.bank]).toEqual([purse - 3, 3]);
    await act(party, h, 'act.bank', { op: 'withdraw', amount: 4 }); // holds 3
    await act(party, h, 'act.bank', { op: 'deposit', amount: purse }); // holds purse - 3
    await act(party, h, 'act.bank', { op: 'steal', amount: 1 });
    expect([me.priv.purse, me.priv.bank]).toEqual([purse - 3, 3]);
    expect(errors(h)).toHaveLength(4);

    // Out of reach: the counter stays shut until the seat comes back.
    placeSeat(party, h.id, 'bakery', 2, 2);
    await act(party, h, 'act.bank', { op: 'withdraw', amount: 1 });
    expect(me.priv.bank).toBe(3);
    const banked = matchEvents(party.room).filter((e) => e.data?.reason === 'bank');
    expect(banked.map((e) => e.data?.delta)).toEqual([-4, 1]); // the purse's side; a bank is no seat's purse
    conserved(party);
  });

  it('gives the heist a share of every balance, rounded down, and the cracker pockets the loot', async () => {
    const { party } = await world();
    const seats = [...party.room.state.players.keys()];
    const before = party.room.state.players.get(seats[0]!)!.priv.purse;
    const deposits = [7, 4, 0, 1];
    seats.forEach((seat, i) => movePurse(party.room, TOWN, bankAccount(seat), deposits[i] ?? 0, 'wage'));
    emitSim(party.room, { tick: party.room.state.tick, kind: 'vendetta.heist.cracked', seat: seats[0]! });
    advance(party, 2);
    const share = balance.economy.heistShare;
    const taken = deposits.map((d) => Math.floor(d * share));
    seats.forEach((seat, i) =>
      expect(party.room.state.players.get(seat)!.priv.bank).toBe((deposits[i] ?? 0) - taken[i]!),
    );
    const total = taken.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
    expect(balanceOf(party.room, STRONGBOX)).toBe(0);
    expect(party.room.state.players.get(seats[0]!)!.priv.purse).toBe(before + total);
    expect(matchEvents(party.room).find((e) => e.kind === 'econ.heistTake')?.data).toEqual({ amount: total });
    conserved(party);
  });
});
