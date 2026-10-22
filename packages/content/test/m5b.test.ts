import { describe, expect, it } from 'vitest';
import { content, validateContent, type Content } from '../src/index.js';

// M5b content (GDD 3.14 to 3.16): the rows and the cross-references `checkM5b` holds them to.

function broken(edit: (c: Content) => void): string[] {
  const copy = structuredClone(content);
  edit(copy);
  return validateContent(copy);
}

const TOOLS = ['lantern', 'crowbar', 'lockpicks', 'snare', 'torch', 'spade'];

describe('resources and recipes', () => {
  it('has a recipe for each of the six tools, and every node names a resource', () => {
    expect(
      Object.values(content.recipes.recipes)
        .map((r) => r.out)
        .sort(),
    ).toEqual([...TOOLS].sort());
    for (const scene of Object.values(content.scenes)) {
      for (const n of scene.nodes ?? []) expect(content.resources.resources[n.resource], n.id).toBeDefined();
    }
  });

  it('makes every resource a stackable material item', () => {
    for (const id of Object.keys(content.resources.resources)) {
      expect(content.items.items[id]?.kind, id).toBe('material');
    }
  });

  it('rejects a node of an unknown resource', () => {
    expect(
      broken((c) => {
        c.scenes.bp_woods!.nodes![0]!.resource = 'coal';
      }),
    ).toEqual(expect.arrayContaining([expect.stringContaining('node bw.nd_timber_0 unknown resource coal')]));
  });

  it('rejects a recipe with an unknown input, output or station', () => {
    const errors = broken((c) => {
      c.recipes.recipes.torch!.in[0]!.item = 'pitch';
      c.recipes.recipes.snare!.out = 'net';
      c.recipes.recipes.spade!.station = 'anvil';
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('torch: unknown input pitch'),
        expect.stringContaining('snare: unknown out net'),
        expect.stringContaining('spade: station anvil is no station kind'),
      ]),
    );
  });

  it('rejects a material that is no resource and a resource that is no material', () => {
    const errors = broken((c) => {
      c.items.items.oil!.kind = 'material';
      c.items.items.stone!.kind = 'deliverable';
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('material oil is no resource'),
        expect.stringContaining('stone is not a material item'),
      ]),
    );
  });

  it('rejects a recipe a map cannot make from its own nodes', () => {
    expect(
      broken((c) => {
        c.scenes.bp_woods!.nodes = c.scenes.bp_woods!.nodes!.filter((n) => n.resource !== 'resin');
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('map blackpine: recipe torch cannot be crafted'),
        expect.stringContaining('map blackpine: recipe lantern cannot be crafted'),
      ]),
    );
  });

  it('rejects a tool loop: a spade made of the ore only a spade digs', () => {
    expect(
      broken((c) => {
        c.recipes.recipes.spade!.in = [{ item: 'tinOre', qty: 1 }];
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('map hollowmere: recipe spade cannot be crafted'),
        expect.stringContaining('map hollowmere: recipe crowbar cannot be crafted'),
      ]),
    );
  });
});
