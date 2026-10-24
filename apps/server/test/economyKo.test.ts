import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, scenes } from '@wdi/content';
import { Phase } from '@wdi/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runInvariants } from '../src/sim/auto/invariants';
import { knockOut } from '../src/sim/body/damage';
import { bodyOf } from '../src/sim/body/state';
import { COINS } from '../src/sim/economy/coins';
import { TOWN, balanceOf, bankAccount, movePurse } from '../src/sim/economy/purse';
import {
  advance,
  allTownsfolk,
  bootNpcServer,
  lobbyOf,
  pauseClock,
  placeSeat,
  start,
  toWorld,
  type Party,
} from './npcHelpers';

// Round 8, Session 8C (GDD 3.23, 3.22): 8A's knockout drops `body.koPurseShare` of the purse as coins on the ground.

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
});
afterAll(async () => {
  await release();
});

async function world(): Promise<Party> {
  const party = await lobbyOf(colyseus, 4);
  await start(party);
  await toWorld(party);
  allTownsfolk(party.room);
  pauseClock(party.room);
  advance(party, 2); // pays the stakes and makes the bodies
  party.room.state.phase = Phase.day;
  party.room.state.phaseEndsTick = party.room.state.tick + 1e6;
  return party;
}

const heaps = (party: Party) =>
  [...party.room.state.scenes.get('manor_hall')!.nodes.values()].filter((n) => n.resource === COINS);

describe('the knockout drops coins', () => {
  it('drops the share of the purse, rounded down, where the seat lies, and leaves the bank alone', async () => {
    const party = await world();
    const room = party.room;
    const seat = party.humans[1]!.id;
    placeSeat(party, seat, 'manor_hall', HALL.x, HALL.y);
    movePurse(room, seat, TOWN, balanceOf(room, seat), 'buy');
    movePurse(room, TOWN, seat, 11, 'wage');
    movePurse(room, seat, bankAccount(seat), 4, 'bank');

    knockOut(room, seat, bodyOf(room, seat)!);
    advance(party, 1);

    const share = Math.floor(7 * balance.body.koPurseShare);
    const [heap, ...more] = heaps(party);
    expect(more).toHaveLength(0);
    expect(balanceOf(room, `@coins:${heap!.id}`)).toBe(share);
    expect(room.state.players.get(seat)!.priv.purse).toBe(7 - share);
    expect(balanceOf(room, bankAccount(seat))).toBe(4);
    expect(runInvariants(room).filter((f) => f.name === 'scripConserved')).toEqual([]);
  });

  it('drops nothing when the share is under one Scrip', async () => {
    const party = await world();
    const room = party.room;
    const seat = party.humans[2]!.id;
    placeSeat(party, seat, 'manor_hall', HALL.x, HALL.y);
    movePurse(room, seat, TOWN, balanceOf(room, seat), 'buy');
    movePurse(room, TOWN, seat, 1, 'wage');
    knockOut(room, seat, bodyOf(room, seat)!);
    advance(party, 1);
    expect(Math.floor(balance.body.koPurseShare)).toBe(0); // one Scrip's share rounds down to nothing
    expect(heaps(party)).toHaveLength(0);
    expect(room.state.players.get(seat)!.priv.purse).toBe(1);
  });
});
