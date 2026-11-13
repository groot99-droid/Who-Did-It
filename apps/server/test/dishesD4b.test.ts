import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, economy, items, recipes } from '@wdi/content';
import { Phase } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectsOn, hasEffect } from '../src/sim/body/effects';
import { bodyOf } from '../src/sim/body/state';
import { addStack, count } from '../src/sim/Inventory';
import {
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  type Party,
  pauseClock,
  start,
  toWorld,
} from './npcHelpers';
import { sleep } from './simHelpers';

// Round 10, D4b (GDD 3.14): the pastry parts and the Game Pie, the Berry Tart (Heartened) and the Miner's Pasty
// (Tireless).

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());
vi.setConfig({ testTimeout: 20_000 });

async function party(): Promise<Party> {
  const p = await lobbyOf(colyseus, 2);
  await start(p);
  await toWorld(p);
  pauseClock(p.room);
  allTownsfolk(p.room);
  advance(p, 1);
  return p;
}

async function eat(p: Party, item: string, ability: string): Promise<void> {
  const h = p.humans[0]!;
  const seat = p.room.state.players.get(h.id)!;
  addStack(seat, item as never, 1);
  h.room.send('act.ability', { abilityId: ability });
  await sleep(60);
  advance(p, 1);
  expect(count(seat, item as never)).toBe(0);
}

describe('the recipes', () => {
  it('chain from shaped pastry and a filling to the three dishes', () => {
    const r = recipes.recipes;
    expect(r.shapedPastry!.in).toEqual([{ item: 'proofedDough', qty: 1 }]);
    const parts = (id: string) => r[id]!.in.map((i) => i.item).sort();
    expect(parts('gamePie')).toEqual(['gameFilling', 'shapedPastry']);
    expect(parts('berryTart')).toEqual(['berryFilling', 'shapedPastry']);
    expect(parts('minersPasty')).toEqual(['mushroomGameFilling', 'shapedPastry']);
    expect(r.gamePie!.station).toBe('brickOven');
    for (const id of ['gamePie', 'berryTart', 'minersPasty']) expect(items.items[id]!.kind).toBe('food');
  });

  it('sells the Game Pie at a market, and nothing else of the three', () => {
    expect(economy.shops.market!.buys).toContain('gamePie');
    expect(economy.prices.gamePie!.pay).toBe(12);
    expect(economy.shops.market!.buys).not.toContain('berryTart');
  });
});

describe('the Berry Tart (Heartened)', () => {
  it('raises max health and health by 10, and the next dawn takes it back', async () => {
    const p = await party();
    const body = bodyOf(p.room, p.humans[0]!.id)!;
    const base = balance.body.maxHp;
    holdPhase(p, Phase.day, 2000);
    const hp = body.hp;
    await eat(p, 'berryTart', 'eatBerryTart');
    expect(hasEffect(body, 'heartened')).toBe(true);
    expect(body.maxHp).toBe(base + 10);
    expect(body.hp).toBe(hp + 10);
    holdPhase(p, Phase.night, balance.phases.nightS);
    advance(p, 2);
    expect(hasEffect(body, 'heartened')).toBe(true);
    holdPhase(p, Phase.day, balance.phases.dayS);
    advance(p, 1);
    expect(hasEffect(body, 'heartened')).toBe(false);
    expect(body.maxHp).toBe(base);
    expect(body.hp).toBeLessThanOrEqual(base);
  });

  it('is replaced by the next dish eaten, taking its bonus with it', async () => {
    const p = await party();
    const body = bodyOf(p.room, p.humans[0]!.id)!;
    holdPhase(p, Phase.day, 2000);
    await eat(p, 'berryTart', 'eatBerryTart');
    await eat(p, 'minersPasty', 'eatMinersPasty');
    expect(hasEffect(body, 'heartened')).toBe(false);
    expect(hasEffect(body, 'tireless')).toBe(true);
    expect(body.maxHp).toBe(balance.body.maxHp);
  });
});

describe("the Miner's Pasty (Tireless)", () => {
  it('stops the stamina drain while running and runs out on its clock', async () => {
    const p = await party();
    const body = bodyOf(p.room, p.humans[0]!.id)!;
    holdPhase(p, Phase.day, 2000);
    await eat(p, 'minersPasty', 'eatMinersPasty');
    expect(effectsOn(body)).toContain('tireless');
    expect(body.effects.get('tireless')!.untilTick).toBeGreaterThan(p.room.state.tick);
    advance(p, 120 * 20 + 20);
    expect(hasEffect(body, 'tireless')).toBe(false);
  });
});
