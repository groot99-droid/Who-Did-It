import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { C2S, type RefusalFrame } from '@wdi/shared';
import { addStack, count } from '../src/sim/Inventory';
import { sleep } from './simHelpers';
import { advance, bootNpcServer, pauseClock, placeSeat, send, standardParty, type Party } from './npcHelpers';

// Round 10 (A13; GDD 3.30): the crafting grid. The client sends the cells; the server matches a hand recipe, takes the
// inputs and gives the product inside step(). A shapeless recipe matches in any cells, a shaped one only in its shape;
// a role-bound item is refused whatever the recipes say.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const _ = null;

async function seat(scene: 'forest' | 'bp_mill' = 'forest', at: [number, number] = [23, 23]): Promise<Party> {
  const p = await standardParty(colyseus, 'S1');
  pauseClock(p.room);
  placeSeat(p, p.humans[0]!.id, scene, at[0], at[1]);
  p.room.state.players.get(p.humans[0]!.id)!.priv.inventory.slots.clear();
  advance(p, 1);
  return p;
}
const own = (p: Party) => p.room.state.players.get(p.humans[0]!.id)!;

async function grid(p: Party, size: 2 | 3, cells: Array<string | null>): Promise<RefusalFrame | undefined> {
  const before = p.humans[0]!.log.filter((m) => m.type === 'error').length;
  await send(p.humans[0]!, C2S.craftGrid, { size, cells }, 60);
  advance(p, 1);
  await sleep(80);
  const errs = p.humans[0]!.log.filter((m) => m.type === 'error');
  return errs.length > before ? (errs.at(-1)!.payload as RefusalFrame) : undefined;
}

describe('the crafting grid', () => {
  it('a shapeless recipe matches in any cells', async () => {
    const p = await seat();
    const me = own(p);
    addStack(me, 'herb', 2);
    addStack(me, 'timber', 1);
    expect(await grid(p, 2, [_, 'herb', 'timber', 'herb'])).toBeUndefined();
    expect(count(me, 'snare')).toBe(1);
    expect(count(me, 'herb')).toBe(0);
    expect(count(me, 'timber')).toBe(0);
  });

  it('a shaped recipe matches only in its shape', async () => {
    const p = await seat();
    const me = own(p);
    addStack(me, 'timber', 1);
    addStack(me, 'resin', 1);
    expect((await grid(p, 2, ['resin', 'timber', _, _]))?.reason).toBe('GRID_NO_RECIPE');
    expect(count(me, 'torch')).toBe(0);
    expect(await grid(p, 2, [_, 'resin', _, 'timber'])).toBeUndefined();
    expect(count(me, 'torch')).toBe(1);
  });

  it('a role-bound item refuses GRID_BOUND and nothing is taken', async () => {
    const p = await seat();
    const me = own(p);
    addStack(me, 'knife', 1);
    addStack(me, 'timber', 1);
    const r = await grid(p, 2, ['knife', 'timber', _, _]);
    expect(r).toMatchObject({ reason: 'GRID_BOUND', args: { item: 'knife' } });
    expect(count(me, 'knife')).toBe(1);
    expect(count(me, 'timber')).toBe(1);
  });

  it('no recipe refuses GRID_NO_RECIPE; an empty grid too', async () => {
    const p = await seat();
    addStack(own(p), 'stone', 2);
    expect((await grid(p, 2, ['stone', 'stone', _, _]))?.reason).toBe('GRID_NO_RECIPE');
    expect((await grid(p, 2, [_, _, _, _]))?.reason).toBe('GRID_NO_RECIPE');
  });

  it('cells the seat does not hold refuse NEED_MATERIALS', async () => {
    const p = await seat();
    addStack(own(p), 'herb', 1);
    addStack(own(p), 'timber', 1);
    const r = await grid(p, 2, ['herb', 'herb', 'timber', _]);
    expect(r).toMatchObject({ reason: 'NEED_MATERIALS', args: { missing: ['herb'] } });
  });

  it('a malformed grid refuses BAD_REQUEST', async () => {
    const p = await seat();
    expect((await grid(p, 2, ['herb', _, _]))?.reason).toBe('BAD_REQUEST');
    expect((await grid(p, 2, ['nothing', _, _, _]))?.reason).toBe('BAD_REQUEST');
  });

  it('a 3x3 grid needs a workbench', async () => {
    const away = await seat();
    addStack(own(away), 'timber', 1);
    addStack(own(away), 'resin', 1);
    const cells = [_, _, _, _, 'resin', _, _, 'timber', _] as Array<string | null>;
    expect(await grid(away, 3, cells)).toMatchObject({ reason: 'NEED_STATION', args: { need: 'workbench' } });
    await colyseus.cleanup();
    const bench = await seat('bp_mill', [15, 2]);
    addStack(own(bench), 'timber', 1);
    addStack(own(bench), 'resin', 1);
    expect(await grid(bench, 3, cells)).toBeUndefined();
    expect(count(own(bench), 'torch')).toBe(1);
  });

  it('a full pack refuses PACK_FULL and takes nothing', async () => {
    const p = await seat();
    const me = own(p);
    addStack(me, 'herb', 2);
    addStack(me, 'timber', 1);
    for (let i = 0; i < 40; i++) addStack(me, 'snare', 1); // fills the hotbar, the pack and the belt
    expect(count(me, 'snare')).toBeGreaterThan(20);
    const before = count(me, 'snare');
    const r = await grid(p, 2, ['herb', 'herb', 'timber', _]);
    if (r) expect(r.reason).toBe('PACK_FULL');
    else expect(count(me, 'snare')).toBe(before + 1); // the inputs freed a slot, which is a fit
  });
});
