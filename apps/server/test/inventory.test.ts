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
  it('has five slots and stacks a material to stackMax in one slot', () => {
    expect(items.inventorySlots).toBe(5);
    const p = seat();
    expect(addStack(p, 'timber', balance.resources.stackMax)).toBe(true);
    expect(slots(p)).toEqual(['timberx5']);
    expect(addStack(p, 'timber', 1)).toBe(true);
    expect(slots(p)).toEqual(['timberx5', 'timberx1']);
    expect(count(p, 'timber')).toBe(6);
  });

  it('tops up an open stack before it opens a slot', () => {
    const p = seat();
    addStack(p, 'stone', 3);
    addStack(p, 'stone', 4);
    expect(slots(p)).toEqual(['stonex5', 'stonex2']);
  });

  it('gives a tool a slot of its own and refuses what does not fit, changing nothing', () => {
    const p = seat();
    for (let i = 0; i < 5; i++) expect(addStack(p, 'crowbar', 1)).toBe(true);
    expect(addStack(p, 'crowbar', 1)).toBe(false);
    expect(addStack(p, 'timber', 1)).toBe(false);
    expect(slots(p)).toHaveLength(5);

    const q = seat();
    addStack(q, 'timber', 5);
    for (let i = 0; i < 3; i++) addStack(q, 'crowbar', 1); // four slots used
    expect(canAdd(q, 'timber', 6)).toBe(false);
    expect(addStack(q, 'timber', 6)).toBe(false);
    expect(slots(q)).toEqual(['timberx5', 'crowbarx1', 'crowbarx1', 'crowbarx1']);
    expect(addStack(q, 'timber', 5)).toBe(true);
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
    addStack(p, 'herb', 7);
    expect(take(p, 'herb', 3)).toBe(true);
    expect(slots(p)).toEqual(['herbx4']);
    addStack(p, 'herb', 2);
    expect(take(p, 'herb', 5)).toBe(true);
    expect(slots(p)).toEqual(['herbx1']);
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
    for (let i = 0; i < 4; i++) addStack(p, 'crowbar', 1);
    addStack(p, 'timber', 1); // five slots used
    expect(canExchange(p, [{ item: 'timber', qty: 1 }], [{ item: 'torch', qty: 1 }])).toBe(true);
    expect(exchange(p, [{ item: 'timber', qty: 1 }], [{ item: 'torch', qty: 1 }])).toBe(true);
    expect(slots(p)).toEqual(['crowbarx1', 'crowbarx1', 'crowbarx1', 'crowbarx1', 'torchx1']);
  });

  it('changes nothing when the takes are short or the gives do not fit', () => {
    const p = seat();
    for (let i = 0; i < 5; i++) addStack(p, 'crowbar', 1);
    const before = slots(p);
    expect(exchange(p, [{ item: 'timber', qty: 1 }], [])).toBe(false);
    expect(exchange(p, [{ item: 'crowbar', qty: 1 }], [{ item: 'torch', qty: 2 }])).toBe(false);
    expect(slots(p)).toEqual(before);
  });
});
