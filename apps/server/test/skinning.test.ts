import type { ColyseusTestServer } from '@colyseus/testing';
import { items, mobs, recipes } from '@wdi/content';
import { Phase, TILE_PX, segmentBlocked } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handleBodyAbility } from '../src/sim/body';
import { hurtCreature } from '../src/sim/body/fists';
import { addStack, count } from '../src/sim/Inventory';
import { wornOf } from '../src/sim/interact/resolve';
import { type MobBody, mobBodies } from '../src/sim/Mobs';
import { simOf } from '../src/sim/RoomSim';
import { navGrid } from '../src/sim/World';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  pauseClock,
  placeSeat,
  send,
  start,
  toWorld,
} from './npcHelpers';

// Round 10 (D6b; GDD 3.22, logic-table 8.4): a Skinning knife takes hide and game off a fallen creature, once.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const skin = (party: Party, id: string): void => handleBodyAbility(party.room, id, { abilityId: 'skin' });
const ready = (party: Party, id: string): void => {
  party.room.state.players.get(id)!.priv.cooldownEndTick.set('skin', 0);
};

/** A seat standing beside the wolf of the night, with a Skinning knife, and that wolf. */
async function atWolf(): Promise<{ party: Party; a: string; wolf: MobBody }> {
  const party = await lobbyOf(colyseus, 2);
  for (let i = 0; i < 2; i++) await send(party.humans[0]!, 'lobby.addNpc', {}, 40);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  holdPhase(party, Phase.night, 900);
  advance(party, 1);
  const a = party.humans[0]!.id;
  const wolf = [...mobBodies(party.room).values()].find((m) => m.def.id === 'wolf')!;
  const grid = navGrid(wolf.site.scene, simOf(party.room).profile);
  const wx = Math.floor(wolf.x / TILE_PX);
  const wy = Math.floor(wolf.y / TILE_PX);
  const near = (
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const
  )
    .map(([dx, dy]) => ({ x: wx + dx, y: wy + dy }))
    .find(
      (t) =>
        !grid.solidAt(t.x, t.y) &&
        !segmentBlocked(grid, wolf.x, wolf.y, (t.x + 0.5) * TILE_PX, (t.y + 0.5) * TILE_PX),
    )!;
  placeSeat(party, a, wolf.site.scene, near.x, near.y);
  advance(party, 1);
  const p = party.room.state.players.get(a)!;
  p.priv.inventory.slots.clear();
  addStack(p, 'skinningKnife', 1);
  return { party, a, wolf };
}

describe('skinning', () => {
  it('gives the hide and game of the row, once, and wears the knife', async () => {
    const { party, a, wolf } = await atWolf();
    const p = party.room.state.players.get(a)!;
    skin(party, a); // alive: nothing to skin
    expect(count(p, 'hide')).toBe(0);
    hurtCreature(party.room, wolf, wolf.def.hp, a);
    skin(party, a);
    expect(count(p, 'hide')).toBe(mobs.mobs.wolf!.skin!.hide);
    expect(count(p, 'game')).toBe(mobs.mobs.wolf!.skin!.game);
    expect(wornOf(party.room, a, 'skinningKnife')).toBe(1);
    ready(party, a);
    skin(party, a); // the same corpse again
    expect(count(p, 'hide')).toBe(mobs.mobs.wolf!.skin!.hide);
  });

  it('needs the knife, and the Knife of the Killer is no part of it', async () => {
    const { party, a, wolf } = await atWolf();
    const p = party.room.state.players.get(a)!;
    p.priv.inventory.slots.clear();
    addStack(p, 'knife', 1);
    hurtCreature(party.room, wolf, wolf.def.hp, a);
    skin(party, a);
    expect(count(p, 'hide')).toBe(0);
  });

  it('is neutral kit, sold at the stalls, and hide makes the jerkin', () => {
    expect(items.items.skinningKnife).toMatchObject({ roleBound: false, tool: { skin: 1 }, uses: 20 });
    expect(recipes.recipes.leatherJerkin!.in).toEqual([{ item: 'hide', qty: 3 }]);
    expect(mobs.mobs.bat!.skin).toBeUndefined();
  });
});
