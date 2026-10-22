import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, resources, scenes } from '@wdi/content';
import { C2S, ErrorCode, Phase, TICK_RATE, TILE_PX, type SceneStateType } from '@wdi/shared';
import { addStack, count } from '../src/sim/Inventory';
import { activeInPool } from '../src/sim/Resources';
import { mapScenesOf } from '../src/sim/MapSites';
import { simOf } from '../src/sim/RoomSim';
import { fixSeeds } from './seedHelpers';
import {
  SEED_SETS,
  advance,
  bootNpcServer,
  errors,
  pauseClock,
  placeSeat,
  send,
  standardParty,
  type Party,
} from './npcHelpers';
import { sleep } from './simHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

type NodeRow = { id: string; resource: string; active: boolean; respawnTick: number };

/** Every node on the wire, by scene. */
function nodesOf(party: Party): Map<string, NodeRow[]> {
  const out = new Map<string, NodeRow[]>();
  party.room.state.scenes.forEach((scene: SceneStateType, key: string) => {
    if (scene.nodes.size > 0) out.set(key, [...scene.nodes.values()] as NodeRow[]);
  });
  return out;
}
const idsOf = (party: Party) =>
  [...nodesOf(party).values()]
    .flat()
    .map((n) => n.id)
    .sort();

async function party(): Promise<Party> {
  const p = await standardParty(colyseus, 'S1');
  pauseClock(p.room);
  return p;
}

/** Redraws the pool from nodes-stream words: a new `MatchSeeds` is a new match for the node memory. */
function redraw(p: Party, words: readonly [number, number, number, number]): string[] {
  fixSeeds(p.room, { nodes: words });
  advance(p, 1);
  return idsOf(p);
}

describe('node pool', () => {
  it('is empty in the lobby and drawn once the match is placed', async () => {
    const p = await party();
    expect(p.room.state.phase).toBe(Phase.grace);
    expect(idsOf(p).length).toBeGreaterThan(0);
  });

  it('activates poolActiveFrac of each pool and every unpooled node', async () => {
    const p = await party();
    const sim = simOf(p.room);
    const wire = new Set(idsOf(p));
    const pools = new Map<string, string[]>();
    for (const sceneId of mapScenesOf(p.room)) {
      for (const spot of scenes[sceneId].nodes ?? []) {
        if (spot.pool === undefined) expect(wire.has(spot.id)).toBe(true);
        else pools.set(spot.pool, [...(pools.get(spot.pool) ?? []), spot.id]);
      }
    }
    expect(sim.profile).toBe('large');
    expect(pools.size).toBeGreaterThan(0);
    for (const [pool, ids] of pools) {
      const on = ids.filter((id) => wire.has(id)).length;
      expect(on, pool).toBe(activeInPool(ids.length));
      expect(on / ids.length, pool).toBeGreaterThanOrEqual(balance.resources.poolActiveFrac);
    }
    for (const row of [...nodesOf(p).values()].flat()) {
      expect(row.active).toBe(true);
      expect(resources.resources[row.resource]).toBeDefined();
    }
  });

  it('draws the same spots from the same nodes words and others from other words', async () => {
    const p = await party();
    const a = redraw(p, SEED_SETS.S1);
    expect(redraw(p, SEED_SETS.S1)).toEqual(a);
    const others = [SEED_SETS.S2, SEED_SETS.S3, SEED_SETS.S4].map((w) => redraw(p, w));
    expect(others.some((o) => o.join() !== a.join())).toBe(true);
  });

  it('keeps nodes out of the lobby', async () => {
    const p = await party();
    p.room.state.phase = Phase.lobby;
    advance(p, 1);
    expect(nodesOf(p).size).toBe(0);
  });
});

describe('respawn', () => {
  it('turns a depleted node back on after its respawn time, counted in ticks', async () => {
    const p = await party();
    const [sceneKey, rows] = [...nodesOf(p)][0] as [string, NodeRow[]];
    const node = p.room.state.scenes.get(sceneKey as never)!.nodes.get((rows[0] as NodeRow).id)!;
    const ticks = Math.round((resources.resources[node.resource]?.respawnS ?? 0) * TICK_RATE);
    node.active = false;
    node.respawnTick = p.room.state.tick + ticks;
    advance(p, ticks - 1);
    expect(node.active).toBe(false);
    advance(p, 1);
    expect(node.active).toBe(true);
    expect(node.respawnTick).toBe(0);
  });
});

/** Stands the human on the first node of `resource` on the wire and empties their pockets. */
async function atNode(p: Party, resource: string) {
  for (const [sceneKey, rows] of nodesOf(p)) {
    const row = rows.find((n) => n.resource === resource);
    if (!row) continue;
    const spot = scenes[sceneKey as keyof typeof scenes].nodes?.find((n) => n.id === row.id);
    if (!spot) continue;
    const human = p.humans[0]!;
    placeSeat(p, human.id, sceneKey as never, spot.x, spot.y);
    const seat = p.room.state.players.get(human.id)!;
    seat.priv.inventory.slots.clear();
    advance(p, 1);
    return { human, seat, row, node: p.room.state.scenes.get(sceneKey as never)!.nodes.get(row.id)! };
  }
  throw new Error(`no ${resource} node on the wire`);
}

/** Sends the hold, lets the step consume it, and waits for any refusal to reach the client. */
async function hold(p: Party, action: string, targetId: string, on = true): Promise<void> {
  await send(p.humans[0]!, C2S.hold, { action, targetId, on }, 60);
  advance(p, 1);
  await sleep(80);
}
const castTicks = (s: number) => Math.round(s * TICK_RATE);

describe('gather', () => {
  it('yields at the end of the hold, empties the node, and respawns it in ticks', async () => {
    const p = await party();
    const { seat, node, row } = await atNode(p, 'herb');
    const res = resources.resources.herb!;
    await hold(p, 'gather', row.id);
    advance(p, castTicks(res.gatherS) - 1);
    expect(count(seat, 'herb')).toBe(0);
    expect(node.active).toBe(true);
    advance(p, 1);
    expect(count(seat, 'herb')).toBe(res.yield);
    expect(node.active).toBe(false);
    expect(node.respawnTick).toBe(p.room.state.tick + castTicks(res.respawnS));
    advance(p, castTicks(res.respawnS));
    expect(node.active).toBe(true);
  });

  it('is cancelled by movement and yields nothing', async () => {
    const p = await party();
    const { seat, node, human, row } = await atNode(p, 'timber');
    await hold(p, 'gather', row.id);
    advance(p, 5);
    await send(human, C2S.move, { seq: 1, dx: 1, dy: 0, sprint: false, sneak: false }, 100);
    advance(p, castTicks(resources.resources.timber!.gatherS) + 5);
    expect(count(seat, 'timber')).toBe(0);
    expect(node.active).toBe(true);
    expect(simOf(p.room).players.get(human.id)?.hold).toBeNull();
  });

  it('can be let go before the end', async () => {
    const p = await party();
    const { seat, row } = await atNode(p, 'stone');
    await hold(p, 'gather', row.id);
    advance(p, 10);
    await hold(p, 'gather', row.id, false);
    advance(p, castTicks(resources.resources.stone!.gatherS));
    expect(count(seat, 'stone')).toBe(0);
  });

  it('needs a Spade for tin ore, which stays in the inventory', async () => {
    const p = await party();
    const { human, seat, node, row } = await atNode(p, 'tinOre');
    await hold(p, 'gather', row.id);
    expect(errors(human)).toContain(ErrorCode.cannot);
    expect(simOf(p.room).players.get(human.id)?.hold).toBeNull();
    addStack(seat, 'spade', 1);
    await hold(p, 'gather', row.id);
    advance(p, castTicks(resources.resources.tinOre!.gatherS));
    expect(count(seat, 'tinOre')).toBe(1);
    expect(count(seat, 'spade')).toBe(1);
    expect(node.active).toBe(false);
  });

  it('refuses a gather with no room for the yield: five slots, five stacks', async () => {
    const p = await party();
    const { human, seat, row } = await atNode(p, 'herb');
    for (let i = 0; i < 5; i++) addStack(seat, 'crowbar', 1);
    await hold(p, 'gather', row.id);
    expect(errors(human)).toContain(ErrorCode.cannot);
    advance(p, castTicks(resources.resources.herb!.gatherS));
    expect(count(seat, 'herb')).toBe(0);
  });

  it('refuses a node that is out of reach, empty, or not there', async () => {
    const p = await party();
    const { human, node, row } = await atNode(p, 'herb');
    await hold(p, 'gather', 'nonesuch');
    node.active = false;
    node.respawnTick = p.room.state.tick + 1000;
    await hold(p, 'gather', row.id);
    expect(errors(human).filter((c) => c === ErrorCode.cannot)).toHaveLength(2);
    node.active = true;
    simOf(p.room).players.get(human.id)!.x += 10 * TILE_PX;
    await hold(p, 'gather', row.id);
    expect(errors(human)).toContain(ErrorCode.outOfRange);
  });

  it('lets only one of two seats take a node', async () => {
    const p = await party();
    const { seat, node, row, human } = await atNode(p, 'mushroom');
    const sim = simOf(p.room);
    const other = [...p.room.state.players.keys()].find((id) => id !== human.id)!;
    const op = sim.players.get(other)!;
    const me = sim.players.get(human.id)!;
    const otherSeat = p.room.state.players.get(other)!;
    otherSeat.priv.inventory.slots.clear();
    op.x = me.x;
    op.y = me.y;
    op.sceneIdx = me.sceneIdx;
    const at = p.room.state.tick;
    me.hold = { action: 'gather', targetId: row.id, startTick: at };
    op.hold = { action: 'gather', targetId: row.id, startTick: at };
    advance(p, castTicks(resources.resources.mushroom!.gatherS));
    expect(count(seat, 'mushroom') + count(otherSeat, 'mushroom')).toBe(1);
    expect(node.active).toBe(false);
  });
});
