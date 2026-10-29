import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { items, recipes, scenes } from '@wdi/content';
import { C2S, ErrorCode, TICK_RATE } from '@wdi/shared';
import { mapScenesOf } from '../src/sim/MapSites';
import { addStack, count } from '../src/sim/Inventory';
import { simOf } from '../src/sim/RoomSim';
import {
  advance,
  bootNpcServer,
  errors,
  pauseClock,
  placeSeat,
  send,
  standardParty,
  type Party,
} from './npcHelpers';
import { sleep } from './simHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const cast = (id: string) => Math.round((recipes.recipes[id]?.craftS ?? 0) * TICK_RATE);

async function party(): Promise<Party> {
  const p = await standardParty(colyseus, 'S1');
  pauseClock(p.room);
  return p;
}

/** The human with an empty inventory, stood on a floor tile beside the first prop of `kind` (or anywhere). */
function standBy(p: Party, kind: string | null) {
  const human = p.humans[0]!;
  const seat = p.room.state.players.get(human.id)!;
  seat.priv.inventory.slots.clear();
  const sceneId =
    kind === null
      ? 'overworld'
      : mapScenesOf(p.room).find((s) => scenes[s].props.some((q) => q.kind === kind));
  if (!sceneId) throw new Error(`no ${kind} on the map`);
  const prop = kind === null ? { x: 1, y: 1 } : scenes[sceneId].props.find((q) => q.kind === kind)!;
  placeSeat(p, human.id, sceneId, prop.x, prop.y);
  advance(p, 1);
  return { human, seat, sceneId };
}

async function craft(p: Party, recipeId: string, on = true): Promise<void> {
  await send(p.humans[0]!, C2S.hold, { action: 'craft', targetId: recipeId, on }, 60);
  advance(p, 1);
  await sleep(80);
}

const give = (seat: ReturnType<typeof standBy>['seat'], what: Record<string, number>) => {
  for (const [item, qty] of Object.entries(what)) addStack(seat, item, qty);
};

describe('craft', () => {
  it('crafts a recipe with no station anywhere: inputs go at the end, the tool arrives', async () => {
    const p = await party();
    const { seat } = standBy(p, null);
    give(seat, { timber: 1, resin: 1 });
    await craft(p, 'torch');
    advance(p, cast('torch') - 1);
    expect(count(seat, 'torch')).toBe(0);
    expect(count(seat, 'timber')).toBe(1);
    advance(p, 1);
    expect(count(seat, 'torch')).toBe(1);
    expect(count(seat, 'timber') + count(seat, 'resin')).toBe(0);
  });

  it('crafts at a station in reach, and refuses without one', async () => {
    const p = await party();
    const { human, seat, sceneId } = standBy(p, 'basin');
    give(seat, { timber: 2, stone: 1 });
    await craft(p, 'spade');
    advance(p, cast('spade'));
    expect(count(seat, 'spade')).toBe(1);

    const away = simOf(p.room).players.get(human.id)!;
    away.x += 10 * 32; // far from the basin, same scene
    give(seat, { timber: 2, stone: 1 });
    await craft(p, 'spade');
    expect(errors(human)).toContain(ErrorCode.cannot);
    expect(away.hold).toBeNull();
    expect(sceneId).toBeDefined();
  });

  it('takes nothing when interrupted by movement', async () => {
    const p = await party();
    const { human, seat } = standBy(p, null);
    give(seat, { herb: 2, timber: 1 });
    await craft(p, 'snare');
    advance(p, 5);
    await send(human, C2S.move, { seq: 1, dx: 1, dy: 0, sprint: false, sneak: false }, 100);
    advance(p, cast('snare') + 5);
    expect(count(seat, 'snare')).toBe(0);
    expect(count(seat, 'herb')).toBe(2);
    expect(count(seat, 'timber')).toBe(1);
  });

  it('refuses short inputs and an unknown recipe', async () => {
    const p = await party();
    const { human, seat } = standBy(p, null);
    give(seat, { timber: 1 });
    await craft(p, 'torch');
    await craft(p, 'nonesuch');
    expect(errors(human).filter((c) => c === ErrorCode.cannot)).toHaveLength(2);
  });

  it('crafts from a full inventory, the inputs freeing the slot the tool takes', async () => {
    const p = await party();
    const { seat } = standBy(p, null);
    for (let i = 0; i < items.inventorySlots - 2; i++) addStack(seat, 'crowbar', 1);
    give(seat, { timber: 1, resin: 1 }); // every slot used
    await craft(p, 'torch');
    advance(p, cast('torch'));
    expect(count(seat, 'torch')).toBe(1);
    expect(seat.priv.inventory.slots.length).toBe(items.inventorySlots - 1);
  });

  it('leaves no mark of the crafter: any role may craft a lantern', async () => {
    const p = await party();
    const { seat } = standBy(p, 'oven');
    give(seat, { tinOre: 1, resin: 1 });
    await craft(p, 'lantern');
    advance(p, cast('lantern'));
    expect(count(seat, 'lantern')).toBe(1);
    expect(seat.priv.inventory.slots.some((s) => s.defId === 'lantern' && s.qty === 1)).toBe(true);
  });
});
