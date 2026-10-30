import type { ColyseusTestServer } from '@colyseus/testing';
import { economy, scenes } from '@wdi/content';
import { ItemStack, Phase, type PlayerState, S2C } from '@wdi/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runInvariants } from '../src/sim/auto/invariants';
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

// Round 8, Session 8C (GDD 3.23; docs/round8/economy.md 2): shops. 8J and 8K place the counters in the scenes, so
// these tests stand two counters of their own on a floor tile (6Z's ruling on #141's shop step).

type Spot = { scene: 'bakery' | 'overworld'; x: number; y: number };
type Prop = (typeof scenes.bakery.props)[number];

/** The first floor tile of a scene, where a fixture counter stands. */
function floorOf(scene: Spot['scene']): Spot {
  const grid = scenes[scene].grid;
  for (let y = 0; y < grid.length; y++) {
    const x = grid[y]!.indexOf('.');
    if (x >= 0) return { scene, x, y };
  }
  throw new Error(`no floor in ${scene}`);
}

const BAKERY = floorOf('bakery');
const MARKET = floorOf('overworld');
const fixtures: Array<[Spot, string]> = [
  [BAKERY, economy.shops.bakery!.prop],
  [MARKET, economy.shops.market!.prop],
];

const moved: Array<[Prop, number, number]> = [];
let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
  for (const [at, id] of fixtures) {
    const placed = scenes[at.scene].props.find((p) => p.id === id);
    if (placed) {
      // A counter the scene already places moves onto the fixture tile for these tests.
      moved.push([placed, placed.x, placed.y]);
      Object.assign(placed, { x: at.x, y: at.y });
    } else scenes[at.scene].props.push({ id, kind: 'counter', x: at.x, y: at.y } as Prop);
  }
});
afterAll(async () => {
  for (const [at, id] of fixtures) {
    if (moved.some(([p]) => p.id === id)) continue;
    const props = scenes[at.scene].props;
    props.splice(
      props.findIndex((p) => p.id === id),
      1,
    );
  }
  for (const [p, x, y] of moved) Object.assign(p, { x, y });
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
  const me = party.room.state.players.get(h.id)!;
  me.priv.inventory.slots.clear();
  return { party, h, me };
}

const qty = (me: PlayerState, defId: string): number =>
  me.priv.inventory.slots.reduce((n, s) => (s.defId === defId ? n + s.qty : n), 0);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sends one message, then runs the steps that consume it. */
async function act(party: Party, h: Human, type: string, payload: unknown): Promise<void> {
  await send(h, type, payload, 60);
  advance(party, 2);
  await wait(60);
}

const holdShop = (party: Party, h: Human, shopId: string) =>
  act(party, h, 'act.hold', { action: 'shop', targetId: economy.shops[shopId]!.prop, on: true });

const conserved = (party: Party) =>
  expect(runInvariants(party.room).filter((f) => f.name === 'scripConserved')).toEqual([]);

describe('shops', () => {
  it('open on a hold at the counter with their prices, and sell for Scrip to the town', async () => {
    const { party, h, me } = await world();
    placeSeat(party, h.id, BAKERY.scene, BAKERY.x, BAKERY.y);
    await holdShop(party, h, 'bakery');
    const open = h.log.find((m) => m.type === S2C.shopOpen)?.payload;
    expect(open).toEqual({
      shopId: 'bakery',
      stock: economy.shops.bakery!.sells.map((itemId) => ({
        itemId,
        price: economy.prices[itemId]!.ask,
        left: expect.any(Number),
      })),
      buys: [],
    });
    // Nobody else hears of it.
    for (const other of party.humans)
      if (other !== h) expect(other.log.some((m) => m.type === S2C.shopOpen)).toBe(false);

    const purse = me.priv.purse;
    const ask = economy.prices.flour!.ask!;
    await act(party, h, 'act.buy', { shopId: 'bakery', itemId: 'flour', qty: 2 });
    expect(qty(me, 'flour')).toBe(2);
    expect(me.priv.purse).toBe(purse - 2 * ask);
    const buys = matchEvents(party.room).filter((e) => e.kind === 'purse' && e.data?.reason === 'buy');
    expect(buys.map((e) => e.data)).toEqual([{ seat: h.id, delta: -2 * ask, reason: 'buy' }]);
    conserved(party);
  });

  it('refuse a purse that falls short, an item not sold, a shop not open and a counter out of reach', async () => {
    const { party, h, me } = await world();
    placeSeat(party, h.id, BAKERY.scene, BAKERY.x, BAKERY.y);
    const before = () => [me.priv.purse, qty(me, 'flour')];
    const start = before();

    await act(party, h, 'act.buy', { shopId: 'bakery', itemId: 'flour', qty: 1 }); // not open yet
    await holdShop(party, h, 'bakery');
    await act(party, h, 'act.buy', { shopId: 'bakery', itemId: 'rope', qty: 1 }); // the store's, not the bakery's
    await act(party, h, 'act.buy', { shopId: 'bakery', itemId: 'flour', qty: 0 });
    const tooMany = Math.floor(me.priv.purse / economy.prices.flour!.ask!) + 1;
    await act(party, h, 'act.buy', { shopId: 'bakery', itemId: 'flour', qty: tooMany });
    expect(before()).toEqual(start);
    expect(errors(h).filter((c) => c === 422)).toHaveLength(4);

    placeSeat(party, h.id, MARKET.scene, MARKET.x, MARKET.y);
    await act(party, h, 'act.buy', { shopId: 'bakery', itemId: 'flour', qty: 1 });
    expect(before()).toEqual(start);
    expect(errors(h)).toHaveLength(5);
    conserved(party);
  });

  it('buy materials at the market: the town pays into the purse and the items leave', async () => {
    const { party, h, me } = await world();
    placeSeat(party, h.id, MARKET.scene, MARKET.x, MARKET.y);
    const s = new ItemStack();
    s.defId = 'timber';
    s.qty = 3;
    me.priv.inventory.slots.push(s);
    await holdShop(party, h, 'market');
    const purse = me.priv.purse;
    await act(party, h, 'act.sell', { shopId: 'market', itemId: 'timber', qty: 4 }); // holds only 3
    expect([qty(me, 'timber'), me.priv.purse]).toEqual([3, purse]);
    await act(party, h, 'act.sell', { shopId: 'market', itemId: 'timber', qty: 3 });
    expect([qty(me, 'timber'), me.priv.purse]).toEqual([0, purse + 3 * economy.prices.timber!.pay!]);
    await act(party, h, 'act.sell', { shopId: 'market', itemId: 'flour', qty: 1 }); // not bought here
    expect(errors(h)).toHaveLength(2);
    conserved(party);
  });
});
