import { describe, expect, it } from 'vitest';
import { content, validateContent, type Content } from '../src/index.js';

// M5b content (GDD 3.14 to 3.16): the rows and the cross-references `checkM5b` holds them to.

function broken(edit: (c: Content) => void): string[] {
  const copy = structuredClone(content);
  edit(copy);
  return validateContent(copy);
}

const TOOLS = ['lantern', 'crowbar', 'lockpicks', 'snare', 'torch', 'spade', 'axe', 'pickaxe', 'hammer'];
/** Round 10, D4a: the bakery's parts and dishes, made on Hollowmere only. */
const BAKERY = ['dough', 'proofedDough', 'herbFilling', 'wakeLoaf', 'herbBread'];

describe('resources and recipes', () => {
  it('has a recipe for each tool, and every node names a resource', () => {
    expect(
      Object.values(content.recipes.recipes)
        .map((r) => r.out)
        .sort(),
    ).toEqual([...TOOLS, ...BAKERY].sort());
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
        expect.stringContaining('map blackpine (small): recipe torch cannot be crafted'),
        expect.stringContaining('map blackpine (small): recipe lantern cannot be crafted'),
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
        expect.stringContaining('map hollowmere (small): recipe spade cannot be crafted'),
        expect.stringContaining('map hollowmere (small): recipe crowbar cannot be crafted'),
      ]),
    );
  });
});

describe('mobs', () => {
  it('has the four mobs, and every one kills at zero health (GDD 3.22)', () => {
    expect(Object.keys(content.mobs.mobs).sort()).toEqual(['bat', 'boar', 'rat', 'wolf']);
    expect(Object.values(content.mobs.mobs).every((m) => m.kills)).toBe(true);
    for (const m of Object.values(content.mobs.mobs)) {
      expect(m.hp).toBeGreaterThan(0);
      expect(m.dmg).toBeLessThan(content.balance.body.maxHp);
    }
  });

  it('rejects a spawner of an unknown mob and a crowded scene', () => {
    const errors = broken((c) => {
      c.scenes.bp_mine!.spawners![0]!.mob = 'bear';
      c.balance.mobs.maxPerScene = 2;
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('spawner bm.sp_bats unknown mob bear'),
        expect.stringContaining('scene forest: 3 spawners, above mobs.maxPerScene'),
      ]),
    );
  });

  it('keeps the wolf on the light radius of balance.wolves', () => {
    expect(
      broken((c) => {
        c.mobs.mobs.wolf!.fleeLightTiles = 5;
      }),
    ).toEqual(expect.arrayContaining([expect.stringContaining('wolf fleeLightTiles differs')]));
  });
});

describe('quests and mini-games', () => {
  it('gives every npc a place and a quest, and every fetch task a mini-game', () => {
    const givers = Object.values(content.scenes).flatMap((s) => (s.givers ?? []).map((g) => g.npc));
    expect(givers.sort()).toEqual(Object.keys(content.quests.npcs).sort());
    const fetch = Object.values(content.tasks.tasks).filter((t) => t.kind === 'fetch');
    expect(
      Object.values(content.minigames.minigames)
        .map((m) => m.task)
        .sort(),
    ).toEqual(fetch.map((t) => t.id).sort());
  });

  it('rejects a giver of an unknown npc, an npc nowhere and a contract quest', () => {
    const errors = broken((c) => {
      c.scenes.bp_smithy!.givers![0]!.npc = 'tallyman';
      c.quests.quests.mollsHerbs!.kind = 'contract';
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('giver bf.gv_smith unknown npc tallyman'),
        expect.stringContaining('npc smith stands nowhere'),
        expect.stringContaining('mollsHerbs: contract quests wait for round 7'),
      ]),
    );
  });

  it('rejects a quest that wants what its map cannot have or rewards an unshipped item', () => {
    const errors = broken((c) => {
      c.quests.quests.caulkTheSkiff!.wants = [{ item: 'oil', qty: 1 }];
      c.quests.quests.smithsOre!.reward = [{ item: 'crossbow', qty: 1 }];
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('caulkTheSkiff: wants oil, not to be had on its map'),
        expect.stringContaining('smithsOre: rewards unshipped crossbow'),
      ]),
    );
  });

  it('rejects a mini-game on a co-op task and a fetch task without one', () => {
    const errors = broken((c) => {
      c.minigames.minigames.flourCrates!.task = 'shutterWindows';
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('flourCrates: task shutterWindows is no fetch task'),
        expect.stringContaining('fetch task fetchFlour has no mini-game'),
      ]),
    );
  });
});
