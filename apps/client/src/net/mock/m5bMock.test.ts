import { describe, expect, it } from 'vitest';
import { TICK_RATE, TILE_PX } from '@wdi/shared/constants';
import { MockM5b, type MockSceneM5b } from './m5bMock';

const scenes: Record<string, MockSceneM5b> = {
  yard: {
    nodes: [
      { id: 'yd.nd_timber', resource: 'timber', x: 2, y: 2 },
      { id: 'yd.nd_tin', resource: 'tinOre', x: 3, y: 2 },
      { id: 'yd.nd_resin', resource: 'resin', x: 2, y: 3 },
    ],
    givers: [{ id: 'yd.gv', npc: 'harbourmaster', x: 2, y: 4 }],
    props: [{ kind: 'oven', x: 4, y: 4 }],
  },
};
const at = (x: number, y: number, scene = 'yard') => ({
  scene,
  x: (x + 0.5) * TILE_PX,
  y: (y + 0.5) * TILE_PX,
});
const run = (m: MockM5b, from: number, ticks: number, me = at(2, 2)) => {
  let done: string | null = null;
  for (let t = from; t < from + ticks; t++) done = m.step(t, me, false) ?? done;
  return done;
};

describe('MockM5b gathering', () => {
  it('draws the scene nodes in tile centres and only those of the scene', () => {
    const m = new MockM5b(scenes, null);
    expect(m.nodes('yard').map((n) => n.id)).toEqual(['yd.nd_timber', 'yd.nd_tin', 'yd.nd_resin']);
    expect(m.nodes('yard')[0]).toMatchObject({ x: 2.5 * TILE_PX, active: true });
    expect(m.nodes('elsewhere')).toEqual([]);
  });

  it('gathers after the resource hold, empties the node and regrows it', () => {
    const m = new MockM5b(scenes, null);
    expect(m.startHold('gather', 'yd.nd_timber', true, at(2, 2), 0)).toBeNull();
    expect(run(m, 0, 2 * TICK_RATE)).toBeNull(); // timber takes 3 s
    expect(run(m, 2 * TICK_RATE, 2 * TICK_RATE)).toBe('gather');
    expect(m.inventory()).toEqual([{ defId: 'timber', qty: 1 }]);
    expect(m.nodes('yard')[0]!.active).toBe(false);
    run(m, 4 * TICK_RATE, 100 * TICK_RATE);
    expect(m.nodes('yard')[0]!.active).toBe(true);
  });

  it('refuses a node out of reach, a spent node and a tool-bound node without the tool', () => {
    const m = new MockM5b(scenes, null);
    expect(m.startHold('gather', 'yd.nd_timber', true, at(20, 20), 0)).toMatchObject({ code: 427 });
    expect(m.startHold('gather', 'yd.nd_tin', true, at(2, 2), 0)).toMatchObject({ code: 422 });
    expect(m.startHold('gather', 'nope', true, at(2, 2), 0)).toMatchObject({ code: 422 });
  });

  it('a step off the spot cancels the hold and yields nothing', () => {
    const m = new MockM5b(scenes, null);
    m.startHold('gather', 'yd.nd_resin', true, at(2, 3), 0);
    m.step(5, at(2, 3), true);
    expect(run(m, 6, 10 * TICK_RATE, at(2, 3))).toBeNull();
    expect(m.inventory()).toEqual([]);
  });
});

describe('MockM5b crafting and quests', () => {
  const kit = { scene: 'yard', x: 2.5 * TILE_PX, y: 2.5 * TILE_PX };

  it('crafts a torch from timber and resin anywhere, taking the inputs at the end', () => {
    const m = new MockM5b(scenes, kit);
    for (const [node, t0] of [
      ['kit.timber', 0],
      ['kit.resin', 400],
    ] as const) {
      expect(m.startHold('gather', node, true, kit, t0)).toBeNull();
      run(m, t0, 5 * TICK_RATE, kit);
    }
    expect(m.startHold('craft', 'torch', true, kit, 1000)).toBeNull();
    expect(run(m, 1000, 3 * TICK_RATE, kit)).toBe('craft');
    expect(m.inventory().find((s) => s.defId === 'torch')?.qty).toBe(1);
    expect(m.inventory().some((s) => s.defId === 'timber')).toBe(false);
  });

  it('refuses a station recipe away from the station and a recipe missing its materials', () => {
    const m = new MockM5b(scenes, null);
    expect(m.startHold('craft', 'torch', true, at(2, 2), 0)).toMatchObject({ code: 422 });
    expect(m.startHold('craft', 'lantern', true, at(2, 2), 0)).toMatchObject({ code: 427 });
  });

  it('takes a quest at the giver, follows the pockets and hands it in for the reward', () => {
    const m = new MockM5b(scenes, kit);
    const near = at(2, 4);
    expect(m.questAccept('caulkTheSkiff', at(20, 20), scenes)).toMatchObject({ code: 427 });
    expect(m.questAccept('caulkTheSkiff', near, scenes)).toBeNull();
    expect(m.questAccept('caulkTheSkiff', near, scenes)).toMatchObject({ msg: 'already taken' });
    expect(m.questTurnIn('caulkTheSkiff', near, scenes)).toMatchObject({ msg: 'you lack what is wanted' });
    let t = 0;
    for (const node of ['kit.resin', 'kit.timber']) {
      m.startHold('gather', node, true, kit, t);
      run(m, t, 4 * TICK_RATE, kit);
      t += 4 * TICK_RATE;
    }
    m.startHold('gather', 'kit.resin', true, kit, t); // spent: refused
    m.refreshQuests();
    expect(m.quests()).toEqual([{ id: 'caulkTheSkiff', progress: 2, done: false }]);
  });

  it('refuses a third quest while two are held', () => {
    const m = new MockM5b({ yard: { givers: [{ id: 'a', npc: 'moll', x: 1, y: 1 }] } }, null);
    const here = at(1, 1);
    const g = { yard: { givers: [{ id: 'a', npc: 'moll', x: 1, y: 1 }] } };
    expect(m.questAccept('mollsHerbs', here, g)).toBeNull();
    expect(m.questAccept('mollsMushrooms', here, g)).toBeNull();
    expect(m.questAccept('stackTheYard', here, g)).toMatchObject({ code: 427 });
  });

  it('lights a carried light only when the pockets hold one', () => {
    const m = new MockM5b(scenes, null);
    m.light(true);
    expect(m.lanternLit).toBe(false);
  });
});
