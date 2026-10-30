import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { effects, recipes, scenes } from '@wdi/content';
import { C2S, TICK_RATE } from '@wdi/shared';
import { applyEffect, hasEffect } from '../src/sim/body/effects';
import { bodyOf } from '../src/sim/body/state';
import { addStack, count } from '../src/sim/Inventory';
import { mapScenesOf } from '../src/sim/MapSites';
import { advance, bootNpcServer, pauseClock, placeSeat, send, standardParty, type Party } from './npcHelpers';
import { sleep } from './simHelpers';

// Round 10 (D4a; GDD 3.14): the bakery's parts, up to the Herb Bread, and its poison resistance.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

async function party(): Promise<Party> {
  const p = await standardParty(colyseus, 'S1');
  pauseClock(p.room);
  const seat = p.room.state.players.get(p.humans[0]!.id)!;
  seat.priv.inventory.slots.clear();
  return p;
}

/** Stands the human beside the first prop of `kind` on the map and makes `recipeId` there. */
async function make(p: Party, recipeId: string): Promise<void> {
  const kind = recipes.recipes[recipeId]!.station!;
  const sceneId = mapScenesOf(p.room).find((s) => scenes[s].props.some((q) => q.kind === kind))!;
  const prop = scenes[sceneId].props.find((q) => q.kind === kind)!;
  const human = p.humans[0]!;
  placeSeat(p, human.id, sceneId, prop.x, prop.y);
  advance(p, 1);
  await send(human, C2S.hold, { action: 'craft', targetId: recipeId, on: true }, 60);
  advance(p, Math.round(recipes.recipes[recipeId]!.craftS * TICK_RATE) + 1);
}

describe('the Herb Bread', () => {
  it('is made in parts across the bakery: mixer, proofer, cold shelves, then the oven', async () => {
    const p = await party();
    const seat = p.room.state.players.get(p.humans[0]!.id)!;
    addStack(seat, 'flour', 2);
    addStack(seat, 'herb', 2);
    for (const step of ['dough', 'proofedDough', 'herbFilling', 'herbBread']) await make(p, step);
    expect(count(seat, 'herbBread')).toBe(1);
    expect(
      count(seat, 'flour') + count(seat, 'herb') + count(seat, 'dough') + count(seat, 'proofedDough'),
    ).toBe(0);
  });

  it('eating it gives the buff, and a Poisoned that starts then lasts half as long', async () => {
    const p = await party();
    const id = p.humans[0]!.id;
    const seat = p.room.state.players.get(id)!;
    const body = bodyOf(p.room, id)!;
    addStack(seat, 'herbBread', 1);
    applyEffect(p.room, id, body, 'poisoned');
    const full = body.effects.get('poisoned')!.untilTick - p.room.state.tick;
    body.effects.clear();
    await send(p.humans[0]!, 'act.ability', { abilityId: 'eatHerbBread' }, 60);
    advance(p, 1);
    await sleep(80);
    expect(count(seat, 'herbBread')).toBe(0);
    expect(hasEffect(body, 'resistant')).toBe(true);
    applyEffect(p.room, id, body, 'poisoned');
    const eased = body.effects.get('poisoned')!.untilTick - p.room.state.tick;
    expect(eased).toBe(Math.round(full * effects.effects.resistant.poisonFactor!));
  });
});
