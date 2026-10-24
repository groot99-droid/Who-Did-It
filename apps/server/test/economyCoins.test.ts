import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, scenes } from '@wdi/content';
import { Phase, TICK_RATE, type PlayerState } from '@wdi/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runInvariants } from '../src/sim/auto/invariants';
import { matchEvents } from '../src/sim/auto/log';
import { COINS, dropCoins } from '../src/sim/economy/coins';
import { TOWN, balanceOf, movePurse } from '../src/sim/economy/purse';
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

// Round 8, Session 8C (GDD 3.23; docs/round8/economy.md 2): coins on the ground. 8A's knockout and 8E's mugging call
// `dropCoins`; this test calls it directly.

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
  advance(party, 2); // pays the stakes
  party.room.state.phase = Phase.day;
  party.room.state.phaseEndsTick = party.room.state.tick + 1e6;
  return party;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const me = (party: Party, h: Human): PlayerState => party.room.state.players.get(h.id)!;
const hall = (party: Party) => party.room.state.scenes.get('manor_hall')!;
async function pickUp(party: Party, h: Human, nodeId: string): Promise<void> {
  await send(h, 'act.hold', { action: 'gather', targetId: nodeId, on: true }, 60);
  advance(party, Math.round(balance.economy.coinPickupS * TICK_RATE) + 2);
  await wait(60);
}
const conserved = (party: Party) =>
  expect(runInvariants(party.room).filter((f) => f.name === 'scripConserved')).toEqual([]);

describe('coins on the ground', () => {
  it('drops a share of the purse where the seat stands, and the first to pick it up takes it all', async () => {
    const party = await world();
    const [victim, finder, stranger] = [party.humans[1]!, party.humans[2]!, party.humans[3]!];
    movePurse(party.room, TOWN, victim.id, 10, 'wage');
    placeSeat(party, victim.id, 'manor_hall', HALL.x, HALL.y);
    const before = me(party, victim).priv.purse;

    const id = dropCoins(party.room, victim.id, 6)!;
    expect(me(party, victim).priv.purse).toBe(before - 6);
    const node = hall(party).nodes.get(id)!;
    expect([node.resource, node.active]).toEqual([COINS, true]);
    expect(balanceOf(party.room, `@coins:${id}`)).toBe(6);

    placeSeat(party, stranger.id, 'bakery', 2, 2); // another scene: nothing there
    await pickUp(party, stranger, id);
    expect(errors(stranger)).toHaveLength(1);

    placeSeat(party, finder.id, 'manor_hall', HALL.x, HALL.y);
    const found = me(party, finder).priv.purse;
    await pickUp(party, finder, id);
    expect(me(party, finder).priv.purse).toBe(found + 6);
    expect(hall(party).nodes.has(id)).toBe(false);
    expect(balanceOf(party.room, `@coins:${id}`)).toBe(0);
    const reasons = matchEvents(party.room)
      .filter((e) => e.kind === 'purse' && (e.data?.reason === 'drop' || e.data?.reason === 'pickup'))
      .map((e) => [e.data?.reason, e.data?.delta]);
    expect(reasons).toEqual([
      ['drop', -6],
      ['pickup', 6],
    ]);
    const taken = matchEvents(party.room).filter((e) => e.kind === 'econ.coinsTaken');
    expect(taken.map((e) => [e.seat, e.data])).toEqual([[undefined, { sceneId: 'manor_hall', nodeId: id }]]);
    conserved(party);
  });

  it('drops nothing from an empty purse, and never more than the purse holds', async () => {
    const party = await world();
    const h = party.humans[1]!;
    placeSeat(party, h.id, 'manor_hall', HALL.x, HALL.y);
    movePurse(party.room, h.id, TOWN, me(party, h).priv.purse, 'buy');
    expect(dropCoins(party.room, h.id, 5)).toBeNull();
    movePurse(party.room, TOWN, h.id, 2, 'wage');
    const id = dropCoins(party.room, h.id, 5)!;
    expect(balanceOf(party.room, `@coins:${id}`)).toBe(2);
    expect(me(party, h).priv.purse).toBe(0);
    conserved(party);
  });
});
