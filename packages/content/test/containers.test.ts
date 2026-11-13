import { describe, expect, it } from 'vitest';
import { classesOfProp, content, validateContent, type Content } from '../src/index.js';

// Round 10 (S1; docs/round9/logic-table.md 6, GDD 3.14): the container classes, the loot tables and the rules that
// deal them, held to the scenes.

function broken(edit: (c: Content) => void): string[] {
  const copy = structuredClone(content);
  edit(copy);
  return validateContent(copy);
}

const NEW = ['fo.bottle_crate', 'fo.barrel', 'fd.barrel', 'fd.blanket_chest', 'ce.tin_crate', 'cg.barrel'];
const t = content.interactions;
const classOf = (id: string, kind = 'dressing') => classesOfProp(t, { id, kind })[0];

describe('containers', () => {
  it('classes every container: open by census, locked and nailed by stem, the kinds left out', () => {
    expect(classOf('ov.barrel_4')).toBe('containerOpen');
    expect(classOf('mh.safe')).toBe('containerLocked');
    expect(classOf('ov.tin_crate_1')).toBe('crateNailed');
    expect(classOf('ov.fern_1')).toBeUndefined(); // keep
    expect(classOf('ov.kit_chest', 'kitChest')).toBeUndefined();
  });

  it('places the six new slots of the woods and the caves as containers', () => {
    const placed = Object.values(content.scenes).flatMap((s) => s.props.map((p) => p.id));
    for (const id of NEW) {
      expect(placed, id).toContain(id);
      expect([...t.containers.classes, ...t.containers.stocked], id).toContain(classOf(id));
    }
  });

  it('rejects an unknown table, scene or class, and a scene whose containers have no table', () => {
    const errors = broken((c) => {
      const box = c.interactions.containers;
      box.classes.push('chestOfDrawers');
      box.themes.nowhere = 'overworld';
      box.themes.forager = 'forest atlantis';
      box.themes.pantry = box.themes.pantry!.replace('bakery', '').trim();
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('containers: unknown class chestOfDrawers'),
        expect.stringContaining('unknown loot table nowhere'),
        expect.stringContaining('unknown scene atlantis'),
        expect.stringContaining('overworld has two tables'),
        expect.stringContaining('scene bakery has container'),
      ]),
    );
  });

  it('rejects a loot item that is no item', () => {
    const errors = broken((c) => void c.interactions.lootTables.stores!.entries.push({ item: 'gold', w: 1 }));
    expect(errors).toEqual(
      expect.arrayContaining([expect.stringContaining('loot stores: unknown item gold')]),
    );
  });
});
