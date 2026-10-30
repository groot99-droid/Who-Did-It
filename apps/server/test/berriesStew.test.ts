import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, economy, items, recipes, resources, scenes } from '@wdi/content';
import { C2S, TICK_RATE, type SceneStateType } from '@wdi/shared';
import { applyEffect, deriveEffects, hasEffect } from '../src/sim/body/effects';
import { bodyOf } from '../src/sim/body/state';
import { addStack, count } from '../src/sim/Inventory';
import { advance, bootNpcServer, pauseClock, placeSeat, send, standardParty, type Party } from './npcHelpers';
import { sleep } from './simHelpers';

// Round 10 (S2; GDD 3.14): berries are foraged bare-handed, the market buys them below any ask, and a stew cures
// as food does.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

async function party(): Promise<Party> {
  const p = await standardParty(colyseus, 'S1');
  pauseClock(p.room);
  return p;
}

describe('berries', () => {
  it('are foraged with bare hands: the yield lands, the node empties', async () => {
    const p = await party();
    let found: { sceneKey: string; id: string } | null = null;
    p.room.state.scenes.forEach((scene: SceneStateType, key: string) => {
      for (const n of scene.nodes.values())
        if (!found && n.resource === 'berries') found = { sceneKey: key, id: n.id };
    });
    expect(found, 'a berries node is on the wire').not.toBeNull();
    const { sceneKey, id } = found!;
    const spot = scenes[sceneKey as keyof typeof scenes].nodes!.find((n) => n.id === id)!;
    const human = p.humans[0]!;
    const seat = p.room.state.players.get(human.id)!;
    seat.priv.inventory.slots.clear();
    placeSeat(p, human.id, sceneKey as never, spot.x, spot.y);
    advance(p, 1);
    await send(human, C2S.hold, { action: 'gather', targetId: id, on: true }, 60);
    advance(p, 1);
    await sleep(80);
    const res = resources.resources.berries!;
    advance(p, Math.round(res.gatherS * TICK_RATE));
    expect(count(seat, 'berries')).toBe(res.yield);
    expect(p.room.state.scenes.get(sceneKey as never)!.nodes.get(id)!.active).toBe(false);
  });

  it('stand in the forest, the deep forest and the pines, one pool per scene', () => {
    for (const [sceneId, pool] of [
      ['forest', 'galBerries'],
      ['forest_deep', 'fenBerries'],
      ['bp_woods', 'pineBerries'],
    ] as const) {
      const spots = scenes[sceneId].nodes!.filter((n) => n.resource === 'berries');
      expect(spots.length).toBeGreaterThanOrEqual(2);
      for (const s of spots) expect(s.pool).toBe(pool);
    }
  });

  it('are bought at a market below the price of the cheapest dish', () => {
    expect(economy.shops.market!.buys).toContain('berries');
    const pay = economy.prices.berries!.pay!;
    expect(pay).toBeGreaterThan(0);
    expect(pay).toBeLessThan(economy.prices.wakeLoaf!.ask!);
  });
});

describe('stew', () => {
  it('is a food made of game, an herb and a mushroom at an oven', () => {
    expect(items.items.stew!.kind).toBe('food');
    expect(items.items.berries!.kind).toBe('material');
    expect(recipes.recipes.stew!.station).toBe('oven');
    expect(recipes.recipes.stew!.in).toEqual([
      { item: 'game', qty: 1 },
      { item: 'herb', qty: 1 },
      { item: 'mushroom', qty: 1 },
    ]);
  });

  it('cures Famished and Weakened when eaten, and is used up', async () => {
    const p = await party();
    const id = p.humans[0]!.id;
    const seat = p.room.state.players.get(id)!;
    seat.priv.inventory.slots.clear();
    const body = bodyOf(p.room, id)!;
    addStack(seat, 'stew', 1);
    body.lastAteTick = p.room.state.tick - Math.round(balance.body.famishedAfterS * TICK_RATE) - 1;
    applyEffect(p.room, id, body, 'weakened');
    deriveEffects(p.room, id, body);
    expect(hasEffect(body, 'famished')).toBe(true);
    await send(p.humans[0]!, 'act.ability', { abilityId: 'eatStew' }, 60);
    advance(p, 1);
    await sleep(80);
    expect(count(seat, 'stew')).toBe(0);
    expect(hasEffect(body, 'famished')).toBe(false);
    expect(hasEffect(body, 'weakened')).toBe(false);
  });
});
