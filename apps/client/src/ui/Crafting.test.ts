import { beforeEach, describe, expect, it } from 'vitest';
import { M5B_COPY as C } from './copy/m5b';
import { isHandRecipe, mountCrafting, recipeRows } from './Crafting';
import { type FakeNode, installFakeDom } from './main/fakeDom';
import type { StackSnap } from '../net/world';

// Round 10, 10Y (A374; UI.md 14.54): a hand recipe's row points to the crafting square; a station recipe keeps Make.

describe('isHandRecipe', () => {
  it('is the recipes with no station', () => {
    const hand = recipeRows([])
      .filter(isHandRecipe)
      .map((r) => r.id);
    expect(hand.sort()).toEqual(['leatherJerkin', 'snare', 'torch']);
  });
});

describe('mountCrafting', () => {
  let root: FakeNode;
  let inventory: StackSnap[];
  let toggled: string[];
  let squares: number;
  beforeEach(() => {
    root = installFakeDom()();
    inventory = [];
    toggled = [];
    squares = 0;
  });
  const mount = () =>
    mountCrafting(root as unknown as HTMLElement, {
      inventory: () => inventory,
      crafting: () => null,
      toggle: (id) => toggled.push(id),
      progress: () => 0,
      openSquare: () => squares++,
    });

  it('gives a hand recipe a live button to the square and a station recipe Make, disabled without its inputs', () => {
    const panel = mount();
    panel.open();
    const torch = root.byTestId('craft-torch')!;
    expect(torch.content).toBe(C['craft.square']);
    expect(torch.attrs.has('disabled')).toBe(false);
    expect(torch.className).toContain('wdi-btn--ghost');
    const lantern = root.byTestId('craft-lantern')!;
    expect(lantern.content).toBe(C['craft.make']);
    expect(lantern.attrs.has('disabled')).toBe(true);
    torch.click();
    lantern.click();
    expect(squares).toBe(1);
    expect(toggled).toEqual(['lantern']); // the fake DOM does not swallow a disabled click; the browser does
    panel.destroy();
  });

  it('keeps Make live for a station recipe whose inputs are in the pockets, and never offers a hand recipe the hold', () => {
    inventory = [
      { defId: 'tinOre', qty: 1 },
      { defId: 'resin', qty: 1 },
      { defId: 'timber', qty: 1 },
    ] as StackSnap[];
    const panel = mount();
    panel.open();
    const lantern = root.byTestId('craft-lantern')!;
    expect(lantern.attrs.has('disabled')).toBe(false);
    lantern.click();
    expect(toggled).toEqual(['lantern']);
    const torch = root.byTestId('craft-torch')!;
    expect(torch.content).toBe(C['craft.square']);
    torch.click();
    expect(toggled).toEqual(['lantern']);
    expect(squares).toBe(1);
    panel.destroy();
  });
});
