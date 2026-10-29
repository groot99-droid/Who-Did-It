import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { interactions, items, resources } from '@wdi/content';
import { C2S, REFUSAL_REASONS, TICK_RATE, TILE_PX, type RefusalFrame } from '@wdi/shared';
import { addStack, count } from '../src/sim/Inventory';
import { wornOf } from '../src/sim/interact/resolve';
import { advance, bootNpcServer, pauseClock, placeSeat, send, standardParty, type Party } from './npcHelpers';
import { sleep } from './simHelpers';

// Round 10 (A11; docs/round9/logic-table.md 5.1 and 10, GDD 3.14): the tool walls on piles. Bare hands get nothing
// from a lumber pile, a boulder or a nailed crate and the refusal names the tool; the tool lands the drops, wears,
// and the prop comes back after its respawn. Nodes keep bare hands and a held tool only speeds them up.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const ticks = (s: number) => Math.round(s * TICK_RATE);

interface Wall {
  name: string;
  scene: 'forest' | 'overworld' | 'cave_gallery';
  prop: string;
  at: [number, number];
  interaction: string;
  tool: string;
  holdS: number;
}
const WALLS: Wall[] = [
  {
    name: 'woodpile',
    scene: 'forest',
    prop: 'fo.woodpile',
    at: [23, 23],
    interaction: 'chopLumber',
    tool: 'axe',
    holdS: 4,
  },
  {
    name: 'stump',
    scene: 'forest',
    prop: 'fo.stump_0',
    at: [27, 13],
    interaction: 'grubStump',
    tool: 'axe',
    holdS: 3,
  },
  {
    name: 'boulder',
    scene: 'forest',
    prop: 'fo.boulder_0',
    at: [16, 13],
    interaction: 'breakBoulder',
    tool: 'pickaxe',
    holdS: 6,
  },
  {
    name: 'ore pile',
    scene: 'cave_gallery',
    prop: 'cg.ore_pile',
    at: [23, 4],
    interaction: 'breakOre',
    tool: 'pickaxe',
    holdS: 4,
  },
  {
    name: 'nailed crate',
    scene: 'overworld',
    prop: 'ov.tin_crate',
    at: [27, 17],
    interaction: 'pryCrate',
    tool: 'crowbar',
    holdS: 3,
  },
];

async function at(w: { scene: Wall['scene']; at: [number, number] }): Promise<Party> {
  const p = await standardParty(colyseus, 'S1');
  pauseClock(p.room);
  const human = p.humans[0]!;
  placeSeat(p, human.id, w.scene, w.at[0], w.at[1]);
  p.room.state.players.get(human.id)!.priv.inventory.slots.clear();
  advance(p, 1);
  return p;
}

async function hold(p: Party, targetId: string): Promise<void> {
  await send(p.humans[0]!, C2S.hold, { action: 'interact', targetId, on: true }, 60);
  advance(p, 1);
  await sleep(80);
}

const refusals = (p: Party): RefusalFrame[] =>
  p.humans[0]!.log.filter((m) => m.type === 'error').map((m) => m.payload as RefusalFrame);

describe('the tool walls (A11)', () => {
  for (const w of WALLS) {
    it(`${w.name}: bare hands get NEED_TOOL naming the ${w.tool}; the ${w.tool} lands the drops and wears`, async () => {
      const p = await at(w);
      const seat = p.room.state.players.get(p.humans[0]!.id)!;
      await hold(p, w.prop);
      expect(refusals(p).at(-1)).toMatchObject({
        reason: 'NEED_TOOL',
        args: { need: w.tool },
        interaction: w.interaction,
      });
      expect(refusals(p).at(-1)?.msg).toBe(interactions.interactions[w.interaction]!.fail.NEED_TOOL);
      addStack(seat, w.tool, 1);
      await hold(p, w.prop);
      advance(p, ticks(w.holdS) + 2);
      const mode = interactions.interactions[w.interaction]!.modes[0]!;
      expect(wornOf(p.room, p.humans[0]!.id, w.tool)).toBe(mode.wear);
      const sure = (mode.drops ?? []).filter((d) => d.chance === undefined);
      for (const d of sure) expect(count(seat, d.item), d.item).toBeGreaterThanOrEqual(d.qty[0]);
      const state = p.room.state.scenes.get(w.scene)!.propStates.get(w.prop)!;
      expect(state.state).toBe(interactions.interactions[w.interaction]!.after!.state);
    });
  }

  it("a broken boulder is rubble for 1200 s (the respawn itself is the resolver's, tested in interact.test.ts)", async () => {
    const w = WALLS[2]!;
    const p = await at(w);
    addStack(p.room.state.players.get(p.humans[0]!.id)!, 'pickaxe', 1);
    await hold(p, w.prop);
    advance(p, ticks(w.holdS) + 2);
    const states = p.room.state.scenes.get(w.scene)!.propStates;
    expect(states.get(w.prop)!.state).toBe('rubble');
    expect(states.get(w.prop)!.untilTick - p.room.state.tick).toBeGreaterThan(ticks(1195));
    expect(states.get(w.prop)!.untilTick - p.room.state.tick).toBeLessThanOrEqual(ticks(1200));
  });

  it('the hammer pries a crate as the crowbar does', async () => {
    const w = WALLS[4]!;
    const p = await at(w);
    addStack(p.room.state.players.get(p.humans[0]!.id)!, 'hammer', 1);
    await hold(p, w.prop);
    advance(p, ticks(w.holdS) + 2);
    expect(p.room.state.scenes.get(w.scene)!.propStates.get(w.prop)?.state).toBe('broken');
    expect(wornOf(p.room, p.humans[0]!.id, 'hammer')).toBe(1);
  });

  it('rubble clears slowly by hand', async () => {
    const p = await at({ scene: 'cave_gallery', at: [31, 19] });
    const seat = p.room.state.players.get(p.humans[0]!.id)!;
    await hold(p, 'cg.rubble_0');
    advance(p, ticks(12) + 2);
    expect(count(seat, 'stone')).toBe(1);
  });
});

describe('nodes keep bare hands (R8)', () => {
  /** Seconds a gather hold on the first active timber node takes, with or without the axe. */
  async function gatherSeconds(withAxe: boolean): Promise<number> {
    const p = await standardParty(colyseus, 'S1');
    pauseClock(p.room);
    advance(p, 2);
    const human = p.humans[0]!;
    let found: { scene: string; node: { id: string; x: number; y: number } } | undefined;
    p.room.state.scenes.forEach((scene, id) => {
      scene.nodes.forEach((n) => {
        if (!found && n.resource === 'timber' && n.active) found = { scene: id, node: n };
      });
    });
    if (!found) throw new Error('no active timber node');
    placeSeat(
      p,
      human.id,
      found.scene as never,
      Math.floor(found.node.x / TILE_PX),
      Math.floor(found.node.y / TILE_PX),
    );
    const seat = p.room.state.players.get(human.id)!;
    seat.priv.inventory.slots.clear();
    if (withAxe) addStack(seat, 'axe', 1);
    advance(p, 1);
    await send(human, C2S.hold, { action: 'gather', targetId: found.node.id, on: true }, 60);
    for (let t = 1; t <= ticks(4); t++) {
      advance(p, 1);
      if (count(seat, 'timber') > 0) return t / TICK_RATE;
    }
    return Infinity;
  }

  it('bare hands gather timber in gatherS; a held axe cuts the hold to fastTool.gatherS', async () => {
    const r = resources.resources.timber!;
    expect(await gatherSeconds(false)).toBeCloseTo(r.gatherS, 0);
    expect(await gatherSeconds(true)).toBeCloseTo(r.fastTool!.gatherS, 0);
  });
});

describe('the table is whole', () => {
  it('every interaction fail key is a refusal reason, and every wall tool is a neutral item', () => {
    for (const [id, it] of Object.entries(interactions.interactions)) {
      for (const key of Object.keys(it.fail)) expect(REFUSAL_REASONS, `${id}.${key}`).toContain(key);
      for (const m of it.modes)
        if (m.tool) {
          const carriers = Object.values(items.items).filter(
            (i) => (i.tool?.[m.tool!.tag] ?? 0) >= m.tool!.tier,
          );
          expect(
            carriers.some((i) => !i.roleBound),
            id,
          ).toBe(true);
        }
    }
  });
});
