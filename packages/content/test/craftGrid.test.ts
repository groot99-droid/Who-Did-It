import { describe, expect, it } from 'vitest';
import { content, validateContent, type Content } from '../src/index.js';

// Round 10 (A13; logic-table 8.6, 10.1): no recipe takes a role-bound item, and a recipe's shape shows its inputs.

function broken(edit: (c: Content) => void): string[] {
  const copy = structuredClone(content);
  edit(copy);
  return validateContent(copy);
}

describe('recipes and the crafting grid', () => {
  it('ships clean: the torch is shaped, the rest shapeless', () => {
    expect(validateContent(content)).toEqual([]);
    expect(content.recipes.recipes.torch?.shape).toEqual([['resin'], ['timber']]);
    expect(content.recipes.recipes.snare?.shape).toBeUndefined();
  });

  it('refuses a recipe that takes a role-bound item', () => {
    const errors = broken((c) => {
      c.recipes.recipes.snare!.in = [{ item: 'knife', qty: 1 }];
    });
    expect(errors).toContain('recipes.json snare: takes the role-bound item knife');
  });

  it('refuses a shape that does not show the inputs', () => {
    const errors = broken((c) => {
      c.recipes.recipes.torch!.shape = [['resin'], ['stone']];
    });
    expect(errors).toContain('recipes.json torch: its shape does not show its inputs');
  });
});
