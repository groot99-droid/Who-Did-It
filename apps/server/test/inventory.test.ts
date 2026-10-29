import { describe, expect, it } from 'vitest';
import { balance, items } from '@wdi/content';
import { Inventory, ItemStack, Player, Private, type PlayerState } from '@wdi/shared';
import { addStack, canAdd, canExchange, count, exchange, take } from '../src/sim/Inventory';

const seat = (): PlayerState => {
  const player = new Player();
  player.priv = new Private();
  player.priv.inventory = new Inventory();
  return player;
};
const slots = (p: PlayerState) => p.priv.inventory.slots.map((s) => `${s.defId}x${s.qty}`);
const give = (p: PlayerState, item: string, qty: number) => {
  const s = new ItemStack();
  s.defId = item;
  s.qty = qty;
  p.priv.inventory.slots.push(s);
};

describe('inventory', () => {
  it('has 24 slots and stacks a material to its stackMax in one slot', () => {
    expect(items.inventorySlots).toBe(24);
    const max = balance.resources.stackMax.material!;
    const p = seat();
    expect(addStack(p, 'timber', max)).toBe(true);
    expect(slots(p)).toEqual([`timberx${max}`]);
    expect(addStack(p, 'timber', 1)).toBe(true);
    expect(slots(p)).toEqual([`timberx${max}`, 'timberx1']);
    expect(count(p, 'timber')).toBe(max + 1);
  });

  it('tops up an open stack before it opens a slot', () => {
    const p = seat();
    addStack(p, 'stone', 10);
    addStack(p, 'stone', 8);
    expect(slots(p)).toEqual(['stonex16', 'stonex2']);
  });

  it('gives an unstacked item a slot of its own and refuses what does not fit, changing nothing', () => {
    const p = seat();
    for (let i = 0; i < items.inventorySlots; i++) expect(addStack(p, 'oil', 1)).toBe(true);
    expect(addStack(p, 'oil', 1)).toBe(false);
    expect(addStack(p, 'timber', 1)).toBe(false);
    expect(slots(p)).toHaveLength(items.inventorySlots);

    const q = seat();
    addStack(q, 'timber', 10);
    for (let i = 0; i < items.inventorySlots - 2; i++) addStack(q, 'oil', 1); // all but one slot used
    expect(canAdd(q, 'timber', 23)).toBe(false);
    expect(addStack(q, 'timber', 23)).toBe(false);
    expect(slots(q)).toEqual(['timberx10', ...Array<string>(items.inventorySlots - 2).fill('oilx1')]);
    expect(addStack(q, 'timber', 22)).toBe(true);
  });

  it('refuses unknown items and non-positive quantities', () => {
    const p = seat();
    expect(addStack(p, 'nonesuch', 1)).toBe(false);
    expect(addStack(p, 'timber', 0)).toBe(false);
    expect(addStack(p, 'timber', -1)).toBe(false);
    expect(addStack(p, 'timber', 1.5)).toBe(false);
    expect(take(p, 'timber', 0)).toBe(false);
    expect(slots(p)).toEqual([]);
  });

  it('takes across stacks, newest first, and drops emptied slots', () => {
    const p = seat();
    addStack(p, 'herb', 20);
    expect(take(p, 'herb', 3)).toBe(true);
    expect(slots(p)).toEqual(['herbx16', 'herbx1']);
    expect(take(p, 'herb', 5)).toBe(true);
    expect(slots(p)).toEqual(['herbx12']);
  });

  it('takes nothing when the seat holds fewer', () => {
    const p = seat();
    addStack(p, 'resin', 2);
    expect(take(p, 'resin', 3)).toBe(false);
    expect(take(p, 'timber', 1)).toBe(false);
    expect(slots(p)).toEqual(['resinx2']);
  });

  it('counts a kit stack and takes a charge from it', () => {
    const p = seat();
    give(p, 'bandage', 3);
    expect(count(p, 'bandage')).toBe(3);
    expect(take(p, 'bandage', 1)).toBe(true);
    expect(slots(p)).toEqual(['bandagex2']);
  });
});

describe('exchange', () => {
  it('takes and gives as one change, the takes freeing slots for the gives', () => {
    const p = seat();
    for (let i = 0; i < items.inventorySlots - 1; i++) addStack(p, 'oil', 1);
    addStack(p, 'timber', 1); // every slot used
    expect(canExchange(p, [{ item: 'timber', qty: 1 }], [{ item: 'torch', qty: 1 }])).toBe(true);
    expect(exchange(p, [{ item: 'timber', qty: 1 }], [{ item: 'torch', qty: 1 }])).toBe(true);
    expect(slots(p)).toEqual([...Array<string>(items.inventorySlots - 1).fill('oilx1'), 'torchx1']);
  });

  it('changes nothing when the takes are short or the gives do not fit', () => {
    const p = seat();
    for (let i = 0; i < items.inventorySlots; i++) addStack(p, 'oil', 1);
    const before = slots(p);
    expect(exchange(p, [{ item: 'timber', qty: 1 }], [])).toBe(false);
    expect(exchange(p, [{ item: 'oil', qty: 1 }], [{ item: 'torch', qty: 2 }])).toBe(false);
    expect(slots(p)).toEqual(before);
  });
});
