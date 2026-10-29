import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, items } from '@wdi/content';
import { areaOf, Inventory, ItemStack, Player, Private, type PlayerState } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addRefusal,
  addStack,
  count,
  heldItem,
  LAYOUT,
  move,
  select,
  settle,
  stackAt,
  strip,
} from '../src/sim/Inventory';
import { until } from './flowHelpers';
import { bootNpcServer, lobbyOf, send, start, stateOf, toWorld } from './npcHelpers';

// Round 10, A12 (GDD 3.30; docs/round9/round10-plan.md A12): the hotbar, the pack, the belt and the gear slots.

const seat = (): PlayerState => {
  const player = new Player();
  player.priv = new Private();
  player.priv.inventory = new Inventory();
  return player;
};
const at = (p: PlayerState) => p.priv.inventory.slots.map((s) => `${s.slot}:${s.defId}x${s.qty}`);
const push = (p: PlayerState, item: string, qty: number) => {
  const s = new ItemStack();
  s.defId = item;
  s.qty = qty;
  p.priv.inventory.slots.push(s);
};
const put = (p: PlayerState, item: string, qty: number, slot: number) => {
  push(p, item, qty);
  p.priv.inventory.slots.at(-1)!.slot = slot;
};
const belt = LAYOUT.belt;

describe('the slots (GDD 3.30)', () => {
  it('lays out the hotbar, the pack, the belt and the head, body and weapon slots', () => {
    const { hotbar, belt: b } = balance.inventory;
    expect([hotbar, items.inventorySlots - hotbar, b]).toEqual([6, 18, 2]);
    expect(areaOf(LAYOUT, 0)).toBe('hotbar');
    expect(areaOf(LAYOUT, hotbar)).toBe('pack');
    expect(areaOf(LAYOUT, belt)).toBe('belt');
    const gear = [LAYOUT.head, LAYOUT.body, LAYOUT.weapon].map((n) => areaOf(LAYOUT, n));
    expect(gear).toEqual(['head', 'body', 'weapon']);
    expect(areaOf(LAYOUT, LAYOUT.size)).toBeNull();
  });

  it('caps a stack by its kind: materials 16, food 4, anything else 1', () => {
    const p = seat();
    expect(addStack(p, 'timber', 17)).toBe(true);
    expect(addStack(p, 'wakeLoaf', 5)).toBe(true);
    expect(addStack(p, 'candle', 2)).toBe(true);
    expect(at(p)).toEqual([
      '0:timberx16',
      '1:timberx1',
      '2:wakeLoafx4',
      '3:wakeLoafx1',
      '4:candlex1',
      '5:candlex1',
    ]);
  });

  it('puts a tool on the belt first, then in the hotbar; anything else never on the belt', () => {
    const p = seat();
    for (let i = 0; i < 3; i++) expect(addStack(p, 'crowbar', 1)).toBe(true);
    addStack(p, 'stone', 1);
    expect(at(p)).toEqual([`${belt}:crowbarx1`, `${belt + 1}:crowbarx1`, '0:crowbarx1', '1:stonex1']);
  });

  it('refuses a full pack with PACK_FULL and changes nothing', () => {
    const p = seat();
    for (let i = 0; i < items.inventorySlots; i++) addStack(p, 'oil', 1);
    const before = at(p);
    expect(addRefusal(p, 'oil', 1)).toBe('PACK_FULL');
    expect(addStack(p, 'oil', 1)).toBe(false);
    expect(addRefusal(p, 'crowbar', 2)).toBeNull(); // the belt still has room for tools
    expect(addRefusal(p, 'nonesuch', 1)).toBe('BAD_REQUEST');
    expect(at(p)).toEqual(before);
  });

  it('settles stacks pushed by hand into slots of their own', () => {
    const p = seat();
    push(p, 'bandage', 3);
    push(p, 'knife', 1);
    push(p, 'crowbar', 1);
    settle(p);
    expect(at(p)).toEqual(['0:bandagex3', '1:knifex1', `${belt}:crowbarx1`]);
    expect(count(p, 'bandage')).toBe(3);
  });
});

describe('moving and holding (inv.move, inv.select)', () => {
  it('moves into an empty slot, merges onto its own item and swaps with another', () => {
    const p = seat();
    put(p, 'timber', 10, 0);
    put(p, 'timber', 10, 2);
    put(p, 'stone', 1, 1);
    expect(move(p, 2, 7)).toBeNull();
    expect(move(p, 0, 7)).toBeNull(); // merges as far as it fits
    expect(at(p)).toEqual(['0:timberx4', '7:timberx16', '1:stonex1']);
    expect(move(p, 1, 7)).toBeNull(); // swaps
    expect(at(p)).toEqual(['0:timberx4', '1:timberx16', '7:stonex1']);
  });

  it('keeps the belt for tools and the gear slots for what fits them', () => {
    const p = seat();
    addStack(p, 'stone', 1);
    addStack(p, 'crowbar', 1);
    expect(move(p, 0, belt + 1)).toBe('BAD_REQUEST');
    expect(move(p, belt, 0)).toBe('BAD_REQUEST'); // a swap would put the stone on the belt
    expect(stackAt(p, belt)?.defId).toBe('crowbar');
    expect(move(p, belt, 3)).toBeNull();
    expect(move(p, 3, LAYOUT.weapon)).toBe('BAD_REQUEST'); // no item `equip`s yet (D6)
    expect(move(p, 9, 3)).toBe('BAD_REQUEST'); // nothing in slot 9
  });

  it('holds the selected hotbar slot, and only a hotbar slot', () => {
    const p = seat();
    addStack(p, 'candle', 2);
    expect(select(p, 1)).toBeNull();
    expect(heldItem(p)).toBe('candle');
    expect(select(p, 2)).toBeNull();
    expect(heldItem(p)).toBe('');
    expect(select(p, LAYOUT.pack)).toBe('BAD_REQUEST');
    expect(p.priv.inventory.selected).toBe(2);
  });
});

describe('a dropped body', () => {
  it('drops the hotbar, the pack, the belt and the purse; bound kit and the bank stay', () => {
    const p = seat();
    push(p, 'knife', 1);
    settle(p);
    addStack(p, 'timber', 3);
    addStack(p, 'crowbar', 1);
    p.priv.purse = 9;
    p.priv.bank = 20;
    const out = strip(p);
    expect(out).toEqual({
      stacks: [
        { item: 'timber', qty: 3 },
        { item: 'crowbar', qty: 1 },
      ],
      scrip: 9,
    });
    expect(at(p)).toEqual(['0:knifex1']);
    expect([p.priv.purse, p.priv.bank]).toEqual([0, 20]);
  });
});

describe('in a room', () => {
  let colyseus: ColyseusTestServer;
  let release: () => Promise<void>;
  beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
  afterAll(async () => release());
  beforeEach(async () => colyseus.cleanup());

  it('moves and selects inside step(), seen by the owner only', async () => {
    const party = await lobbyOf(colyseus, 2);
    await start(party);
    await toWorld(party);
    const [a, b] = party.humans;
    const me = party.room.state.players.get(a!.id)!;
    me.priv.inventory.slots.clear();
    addStack(me, 'candle', 1);
    const heard = b!.log.length;
    await send(a!, 'inv.move', { from: 0, to: 4 });
    await send(a!, 'inv.select', { slot: 4 });
    expect(await until(() => heldItem(me) === 'candle')).toBe(true);
    expect(await until(() => stateOf(a!).players.get(a!.id)?.priv?.inventory?.selected === 4)).toBe(true);
    expect(stateOf(a!).players.get(a!.id)!.priv.inventory.slots.at(0)?.slot).toBe(4);
    expect(stateOf(b!).players.get(a!.id)!.priv).toBeUndefined();

    // The A170 audit on both messages: a refusal reaches its sender only, with its reason, and the other client is
    // sent nothing about either message.
    await send(a!, 'inv.move', { from: 9, to: 3 });
    await send(a!, 'inv.select', { slot: LAYOUT.pack });
    const refused = a!.log
      .filter((m) => m.type === 'error')
      .map((m) => (m.payload as { reason?: string }).reason);
    expect(refused.slice(-2)).toEqual(['BAD_REQUEST', 'BAD_REQUEST']);
    expect(me.priv.inventory.selected).toBe(4);
    const toB = b!.log
      .slice(heard)
      .filter((m) => m.type === 'error' || JSON.stringify(m.payload ?? '').includes('inv'));
    expect(toB).toEqual([]);
  });
});
