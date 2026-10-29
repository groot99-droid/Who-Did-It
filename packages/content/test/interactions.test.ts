import { describe, expect, it } from 'vitest';
import {
  CENSUS_DECISIONS,
  Item,
  Mode,
  classesOfProp,
  content,
  decideProp,
  interactions,
  validateContent,
  type CensusDecision,
  type Content,
  type Interaction,
} from '../src/index.js';

// Round 10 (A9; docs/round9/logic-table.md 3 and 5, GDD 3.14): the logic table's schema and validator.

function broken(edit: (c: Content) => void): string[] {
  const copy = structuredClone(content);
  edit(copy);
  return validateContent(copy);
}

const props = Object.values(content.scenes).flatMap((s) => s.props);

const chop: Interaction = {
  verb: 'chop',
  label: 'Chop',
  target: 'testLumber',
  handler: 'stock',
  status: 'live',
  phases: ['day', 'night'],
  modes: [
    {
      tool: { tag: 'cut', tier: 1 },
      holdS: 4,
      drops: [{ item: 'timber', qty: [2, 3] }],
      wear: 1,
      noise: null,
    },
  ],
  ownership: 'wild',
  fail: { NEED_TOOL: 'You tug at the timber. An axe would.' },
  ships: 'V1',
};

describe('interactions.json: the census (logic-table.md 5)', () => {
  it('decides every placed prop once, and the decisions add up to the props placed', () => {
    const tally = Object.fromEntries(CENSUS_DECISIONS.map((d) => [d, 0])) as Record<CensusDecision, number>;
    for (const p of props) {
      const d = decideProp(interactions, p);
      expect(d, p.id).toBeDefined();
      tally[d!] += 1;
    }
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(props.length);
    // Every live prop is read through its class; so are the tool walls of A11.
    for (const p of props.filter((q) => decideProp(interactions, q) === 'live'))
      expect(classesOfProp(interactions, p).length, p.id).toBe(1);
    expect(tally.live).toBeGreaterThan(0);
  });

  it('matches every prop to at most one class', () => {
    for (const p of props) expect(classesOfProp(interactions, p).length, p.id).toBeLessThanOrEqual(1);
    expect(validateContent(content)).toEqual([]);
  });

  it('reserves the stems and the kind round 10 places: trees, berry bushes and beds', () => {
    expect(decideProp(interactions, { id: 'fo.tree_3', kind: 'dressing' })).toBe('interact');
    expect(decideProp(interactions, { id: 'fo.berry_bush', kind: 'decor' })).toBe('interact');
    expect(decideProp(interactions, { id: 'tb.bed', kind: 'bed' })).toBe('interact');
  });

  it('refuses a prop with no decision, a name decided twice and a live kind with no class', () => {
    expect(
      broken((c) => {
        c.scenes.overworld!.props[0]!.kind = 'mysteryBox';
      }),
    ).toEqual(expect.arrayContaining([expect.stringContaining('(kind mysteryBox) has no census decision')]));
    expect(
      broken((c) => {
        c.interactions.census.stems.keep!.push('barrel');
      }),
    ).toEqual(expect.arrayContaining(['interactions.json census.stems: barrel is both container and keep']));
    expect(
      broken((c) => {
        delete c.interactions.classes.bell;
      }),
    ).toEqual(expect.arrayContaining(['interactions.json: live kind bell has no class']));
  });

  it('refuses a prop two classes match', () => {
    expect(
      broken((c) => {
        c.interactions.classes.testLumber = { name: 'Lumber', match: { stems: ['barrel'], kinds: ['bell'] } };
      }),
    ).toEqual(
      expect.arrayContaining([expect.stringMatching(/prop \w+\.\w+ matches classes bell, testLumber/)]),
    );
  });
});

describe('interactions.json: modes and interactions (logic-table.md 3.2)', () => {
  const mode = (m: object) => Mode.safeParse({ tool: null, ...m }).success;

  it('takes print or scratch as a trace, and a mini-game in place of a hold', () => {
    expect(mode({ holdS: 2, leaves: 'print' })).toBe(true);
    expect(mode({ holdS: 2, leaves: 'scratch' })).toBe(true);
    expect(mode({ holdS: 2, leaves: 'smear' })).toBe(false);
    expect(mode({ minigame: 'lockpick', fineChance: 0.1, unlocks: true })).toBe(true);
    expect(mode({})).toBe(false);
    expect(mode({ holdS: 2, fineChance: 1.5 })).toBe(false);
    expect(mode({ holdS: 2, fineChance: -0.1 })).toBe(false);
  });

  it('accepts a tool wall on a class of placed stems', () => {
    expect(
      broken((c) => {
        c.interactions.classes.testLumber = { name: 'Lumber', match: { stems: ['planks'] } };
        c.interactions.interactions.testChop = chop;
      }),
    ).toEqual([]);
  });

  it('refuses an unknown class, item, loot table, live mini-game and a wall with no NEED_TOOL line', () => {
    const errors = broken((c) => {
      c.interactions.interactions.testChop = {
        ...chop,
        target: 'nowhere',
        fail: {},
        modes: [
          { ...chop.modes[0]!, drops: [{ item: 'gold', qty: [1, 1] }], loot: 'void', minigame: 'lockpick' },
        ],
      };
    });
    for (const e of [
      'unknown class nowhere',
      'unknown item gold',
      'unknown loot table void',
      'unknown mini-game',
    ]) {
      expect(errors).toEqual(expect.arrayContaining([expect.stringContaining(e)]));
    }
    expect(errors).toEqual(
      expect.arrayContaining(['interactions.json testChop: a tool wall needs a NEED_TOOL line']),
    );
  });

  it('lets an nfy interaction name a mini-game that has not shipped', () => {
    expect(
      broken((c) => {
        c.interactions.classes.testLumber = { name: 'Lumber', match: { stems: ['planks'] } };
        c.interactions.interactions.pickIt = {
          ...chop,
          status: 'nfy',
          feature: 'lock picking',
          modes: [{ tool: { tag: 'pick', tier: 1 }, minigame: 'lockpick', wear: 0, noise: 'lockpick' }],
        };
      }),
    ).toEqual([]);
  });

  it('refuses a stem placed nowhere and a tier the tag does not have', () => {
    const errors = broken((c) => {
      c.interactions.classes.testLumber = { name: 'Lumber', match: { stems: ['unicorn'] } };
      c.interactions.interactions.testChop = {
        ...chop,
        modes: [{ ...chop.modes[0]!, tool: { tag: 'dig', tier: 2 } }],
      };
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        'interactions.json class testLumber: stem unicorn is placed nowhere',
        'interactions.json testChop: dig has no tier 2',
      ]),
    );
  });
});

describe('items.json: tool tags and uses (A10; logic-table.md 3.3)', () => {
  const item = (patch: object) => Item.safeParse({ ...content.items.items.spade, ...patch }).success;

  it('takes a tier per capability tag and a positive number of uses', () => {
    expect(item({ tool: { cut: 1, break: 2 }, uses: 20 })).toBe(true);
    expect(item({ tool: { saw: 1 } })).toBe(false);
    expect(item({ tool: { cut: 4 } })).toBe(false);
    expect(item({ uses: 0 })).toBe(false);
  });
});
