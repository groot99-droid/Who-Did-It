import { describe, expect, it } from 'vitest';
import { previewOf } from './CraftGrid';
import { LAYOUT, accepts, canMove, isBound, slotted, slotsIn, stackLimit } from './slots';

// Round 10, A13 (UI.md 14.44): the screen offers only the moves the server's `inv.move` accepts, and previews the
// product the shared grid match gives. The panels are DOM; the rules they read are tested here.

const stack = (defId: string, qty: number, slot?: number) =>
  slot === undefined ? { defId, qty } : { defId, qty, slot };
const map = (...s: Array<ReturnType<typeof stack>>) => slotted(s);
const [pack0, pack1] = slotsIn(LAYOUT, 'pack') as [number, number];
const [hot0, hot1] = slotsIn(LAYOUT, 'hotbar') as [number, number];
const [belt0] = slotsIn(LAYOUT, 'belt') as [number];
const [head] = slotsIn(LAYOUT, 'head') as [number];

describe('canMove', () => {
  it('moves a stack into an empty slot of the hotbar or the pack, and not onto itself', () => {
    const s = map(stack('timber', 3, hot0));
    expect(canMove(s, hot0, pack0)).toBe(true);
    expect(canMove(s, hot0, hot0)).toBe(false);
    expect(canMove(s, pack1, pack0)).toBe(false); // nothing there to move
  });

  it('puts only tools on the belt and only fitting gear on the gear slots', () => {
    const s = map(stack('timber', 1, hot0), stack('spade', 1, hot1));
    expect(canMove(s, hot0, belt0)).toBe(false);
    expect(canMove(s, hot1, belt0)).toBe(true);
    expect(canMove(s, hot1, head)).toBe(false); // nothing equips there until D6
    expect(accepts(head, 'spade')).toBe(false);
  });

  it('merges onto a stack of the same item below its limit, not a full one', () => {
    expect(stackLimit('timber')).toBe(16);
    expect(canMove(map(stack('timber', 3, hot0), stack('timber', 5, pack0)), hot0, pack0)).toBe(true);
    expect(canMove(map(stack('timber', 3, hot0), stack('timber', 16, pack0)), hot0, pack0)).toBe(false);
  });

  it('swaps two stacks only when each slot takes the other item', () => {
    const s = map(stack('spade', 1, belt0), stack('timber', 2, pack0), stack('crowbar', 1, pack1));
    expect(canMove(s, belt0, pack0)).toBe(false); // the timber in the pack cannot go to the belt in exchange
    expect(canMove(s, pack0, belt0)).toBe(false); // timber cannot take the belt slot
    expect(canMove(s, pack1, belt0)).toBe(true); // a tool for a tool
  });

  it('refuses a slot outside the inventory', () => {
    expect(canMove(map(stack('timber', 1, hot0)), hot0, LAYOUT.size)).toBe(false);
    expect(canMove(map(stack('timber', 1, hot0)), hot0, -1)).toBe(false);
  });
});

describe('slotted', () => {
  it('keeps a stack where it names its slot and gives a loose one the next free general slot', () => {
    const s = slotted([stack('timber', 1, 1), stack('stone', 2), stack('resin', 1), stack('', 0)]);
    expect(s.get(1)?.defId).toBe('timber');
    expect(s.get(0)?.defId).toBe('stone');
    expect(s.get(2)?.defId).toBe('resin');
    expect(s.size).toBe(3);
  });
});

describe('the crafting square', () => {
  it('previews the product of the shared match: shapeless anywhere, shaped only in its shape', () => {
    expect(previewOf(2, ['herb', null, 'timber', 'herb'])).toEqual({ out: 'snare', qty: 1 });
    expect(previewOf(2, ['resin', null, 'timber', null])).toEqual({ out: 'torch', qty: 1 });
    expect(previewOf(2, ['timber', null, 'resin', null])).toBeNull();
    expect(previewOf(2, [null, null, null, null])).toBeNull();
  });

  it('knows a role-bound item, which the grid does not take', () => {
    expect(isBound('knife')).toBe(true);
    expect(isBound('timber')).toBe(false);
  });
});
