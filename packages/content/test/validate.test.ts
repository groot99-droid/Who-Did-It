import { describe, expect, it } from 'vitest';
import { content, parseContent, Scene, validateContent, type Content } from '../src/index.js';

function broken(edit: (c: Content) => void): string[] {
  const copy = structuredClone(content);
  edit(copy);
  return validateContent(copy);
}

describe('validateContent rejects', () => {
  it('a portal to a missing spawn', () => {
    expect(
      broken((c) => {
        c.scenes.overworld!.portals[0]!.toSpawn = 'nowhere';
      }),
    ).toEqual(expect.arrayContaining([expect.stringContaining('unknown spawn tavern_bar.nowhere')]));
  });

  it('a portal to a missing scene', () => {
    expect(
      broken((c) => {
        c.scenes.bakery!.portals[0]!.to = 'lighthouse';
      }),
    ).toEqual(expect.arrayContaining([expect.stringContaining('unknown scene lighthouse')]));
  });

  it('a grid row of the wrong width', () => {
    expect(
      broken((c) => {
        c.scenes.bakery!.grid[3] += '.';
      }),
    ).toEqual(expect.arrayContaining([expect.stringContaining('row 3 has 19 columns')]));
  });

  it('a D with no portal', () => {
    expect(
      broken((c) => {
        const g = c.scenes.bakery!.grid;
        g[6] = '#D' + g[6]!.slice(2);
      }),
    ).toEqual(expect.arrayContaining([expect.stringContaining('"D" at 1,6 has no portal')]));
  });

  it('a portal whose tile is not a D', () => {
    expect(
      broken((c) => {
        c.scenes.bakery!.portals[0]!.x = 7;
      }),
    ).toEqual(expect.arrayContaining([expect.stringContaining('portal bk.door at 7,10 is "#"')]));
  });

  it('a portal gated below the larger of its two scenes', () => {
    expect(
      broken((c) => {
        c.scenes.overworld!.portals.find((p) => p.id === 'ov.chapel')!.minProfile = 'small';
      }),
    ).toEqual(
      expect.arrayContaining([expect.stringContaining('ov.chapel minProfile small, expected large')]),
    );
  });

  it('a deck row with the wrong number of cards', () => {
    expect(
      broken((c) => {
        c.roles.decks['6'].cards.pop();
      }),
    ).toEqual(expect.arrayContaining([expect.stringContaining('deck 6')]));
  });

  it('a deck that lists an unshipped role', () => {
    expect(
      broken((c) => {
        c.roles.decks['9'].cards[c.roles.decks['9'].cards.indexOf('baker')] = 'ranger';
      }),
    ).toEqual(expect.arrayContaining([expect.stringContaining('ranger')]));
  });

  it('an ability or item reference that does not exist', () => {
    expect(
      broken((c) => {
        c.roles.roles.killer!.abilities.push('teleport');
        c.items.items.knife!.use = 'stab';
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unknown ability teleport'),
        expect.stringContaining('item knife: unknown ability stab'),
      ]),
    );
  });

  it('a task whose tool comes from the scene it is delivered to', () => {
    expect(
      broken((c) => {
        c.tasks.tasks.fixPump!.source = { scene: 'overworld', prop: 'ov.bell' };
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('task fixPump: the tool must come from another scene'),
      ]),
    );
  });
});

describe('schemas reject', () => {
  it('unknown grid characters and unknown fields', () => {
    const scene = structuredClone(content.scenes.bakery!);
    expect(Scene.safeParse({ ...scene, grid: ['#X#'] }).success).toBe(false);
    expect(Scene.safeParse({ ...scene, extra: 1 }).success).toBe(false);
  });

  it('a balance file missing a player count', () => {
    const raw = structuredClone(content) as unknown as Record<string, Record<string, unknown>>;
    delete (raw.balance!.byCount as Record<string, unknown>)['7'];
    expect(() => parseContent(raw as never)).toThrow();
  });
});

describe('validateContent rejects cutscene data', () => {
  it('an index entry of the wrong kind or an unknown cutscene', () => {
    const errors = broken((c) => {
      c.cutscenes.deaths.knife = 'openingHollowmere';
      c.cutscenes.openings.blackpine = 'nowhere';
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('of kind opening, expected death'),
        expect.stringContaining('unknown cutscene "nowhere"'),
      ]),
    );
  });

  it('a camera step off the scene, an opening longer than openingS, and a step in the wrong kind', () => {
    const errors = broken((c) => {
      const open = c.cutscenes.cutscenes.openingHollowmere!;
      open.maxS = c.balance.phases.openingS + 1;
      open.steps.push({ t: 'hold' });
      const cam = open.steps.find((s) => s.t === 'camera');
      if (cam?.t === 'camera') cam.to = { x: 999, y: 0 };
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('outside overworld'),
        expect.stringContaining('longer than phases.openingS'),
        expect.stringContaining('hold belongs to a death cutscene'),
      ]),
    );
  });

  it('an opening whose steps stop short of its maxS', () => {
    const errors = broken((c) => {
      c.cutscenes.cutscenes.openingBlackpine!.steps = c.cutscenes.cutscenes.openingBlackpine!.steps.filter(
        (s) => s.t !== 'wait',
      );
    });
    expect(errors).toEqual(
      expect.arrayContaining([expect.stringContaining('opening "openingBlackpine" steps run')]),
    );
  });
});
