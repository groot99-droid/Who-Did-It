import { balance, items } from '@wdi/content';
import { areaOf, Inventory, ItemStack, Player, Private, type PlayerState } from '@wdi/shared';
import { describe, expect, it } from 'vitest';
import { addRefusal, addStack, count, LAYOUT, settle, strip } from '../src/sim/Inventory';

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
