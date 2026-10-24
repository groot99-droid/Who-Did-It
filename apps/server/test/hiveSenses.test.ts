import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { ItemStack, Phase, TICK_RATE, TILE_PX } from '@wdi/shared';
import { spawnBody } from '../src/sim/Bodies';
import { setLight } from '../src/sim/mobs/light';
import { emitNoise } from '../src/sim/Noise';
import { dueReaction, heldReaction, hiveOf, registerTrigger } from '../src/sim/npc/hive';
import { heardBy, seesPoint } from '../src/sim/npc/hive/senses';
import { staggerTicks } from '../src/sim/npc/hive/triggers';
import { npcMemory } from '../src/sim/npc/memory';
import { simOf } from '../src/sim/RoomSim';
import { sceneIndex } from '../src/sim/World';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  pauseClock,
  placeSeat,
  start,
  toWorld,
} from './npcHelpers';

// Round 8, 8R (A174, A176): the trigger registry, and fair senses. An NPC sees through `canSee` and the lights, and hears `emitNoise`, as a human there would.
// The forest's open top row (y 1) holds no scene light, as nightSight.test.ts uses it.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const NIGHT = balance.vision.nightTiles;
const FOREST = sceneIndex('forest');
const px = (t: number) => (t + 0.5) * TILE_PX;

async function world(): Promise<{ party: Party; npcs: string[] }> {
  const party = await lobbyOf(colyseus, 1);
  await start(party);
  await toWorld(party);
  allTownsfolk(party.room);
  pauseClock(party.room);
  const npcs = [...npcMemory(party.room).order];
  return { party, npcs };
}

describe('fair sight (8R)', () => {
  it('by day sees the forest row whole; at night only the night radius, plus a burning lantern', async () => {
    const { party, npcs } = await world();
    const [a] = npcs;
    placeSeat(party, a!, 'forest', 7, 1);
    const p = simOf(party.room).players.get(a!)!;
    const near = px(7 + Math.floor(NIGHT) - 1);
    const lanternFar = px(7 + Math.floor(NIGHT + balance.vision.lanternTiles) - 1);
    const far = px(7 + Math.ceil(NIGHT) + 6);
    holdPhase(party, Phase.day, 60);
    for (const x of [near, lanternFar, far]) expect(seesPoint(party.room, p, FOREST, x, px(1))).toBe(true);
    for (const phase of [Phase.night, Phase.finalNight]) {
      holdPhase(party, phase, 60);
      expect(seesPoint(party.room, p, FOREST, near, px(1))).toBe(true);
      expect(seesPoint(party.room, p, FOREST, lanternFar, px(1))).toBe(false);
      expect(seesPoint(party.room, p, FOREST, far, px(1))).toBe(false);
    }
    const slot = new ItemStack();
    slot.defId = 'lantern';
    slot.qty = 1;
    party.room.state.players.get(a!)!.priv.inventory.slots.push(slot);
    expect(setLight(party.room, a!, true)).toBe(true);
    expect(seesPoint(party.room, p, FOREST, lanternFar, px(1))).toBe(true);
    expect(seesPoint(party.room, p, FOREST, far, px(1))).toBe(false);
    expect(seesPoint(party.room, p, sceneIndex('overworld'), near, px(1))).toBe(false); // another scene
  });
});

describe('fair hearing (8R)', () => {
  it("emitNoise reaches every NPC seat in the scene within its radius, never the noise's maker", async () => {
    const { party, npcs } = await world();
    const [a, b, c] = npcs as [string, string, string];
    holdPhase(party, Phase.night, 60);
    const scream = balance.noise.killScream;
    placeSeat(party, a, 'forest', 7, 1);
    placeSeat(party, b, 'forest', 7 + Math.ceil(scream) + 2, 1);
    placeSeat(party, c, 'forest', 8, 1);
    advance(party, 1);
    emitNoise(party.room, 'forest', px(7), px(1), scream, 'scream', c);
    // Footsteps are noises too: only the scream is looked at.
    const screams = (id: string) => heardBy(party.room, id).filter((f) => f.what === 'scream');
    expect(screams(a)).toHaveLength(1);
    expect(screams(b)).toEqual([]);
    expect(screams(c)).toEqual([]);
    const fact = [...hiveOf(party.room).all('noise')].find((f) => f.what === 'scream');
    expect(fact).toMatchObject({ kind: 'noise', sceneId: 'forest', what: 'scream' });
    advance(party, Math.round(balance.npc.hive.memoryS * TICK_RATE) + 1);
    expect(screams(a)).toEqual([]);
  });
});

describe('the hive triggers (8R, A176)', () => {
  it('staggers one reaction across seats: a hash spread over npc.hive.staggerS, never a lockstep', () => {
    const ticks = Array.from({ length: 50 }, (_, i) => staggerTicks(`seat${i}`, 'shout:1'));
    expect(new Set(ticks).size).toBeGreaterThan(20);
    expect(staggerTicks('seat1', 'shout:1')).toBe(ticks[1]);
  });

  let armed = false;
  registerTrigger({
    id: 'test.bodyNear',
    kind: 'proximity',
    priority: 1,
    fire: ({ board, p }) => {
      if (!armed) return null;
      const [body] = board.all('body');
      return body ? { key: body.ref, fact: body, goal: { scene: p.sceneIdx, x: body.x, y: body.y } } : null;
    },
  });

  it('writes a reaction into every NPC seat, staggered per seat, held while proposed, emptied when not', async () => {
    const { party } = await world();
    holdPhase(party, Phase.day, 120);
    const npcs = [...npcMemory(party.room).order];
    const victim = party.humans[0]!.id;
    spawnBody(party.room, 'forest', victim, 7, 1);
    armed = true;
    advance(party, 1);
    const dues = npcs.map((id) => heldReaction(party.room, id)?.dueTick ?? -1);
    const { min, max } = balance.npc.hive.staggerS;
    for (const [i, id] of npcs.entries()) {
      const r = heldReaction(party.room, id)!;
      expect(r).toMatchObject({ trigger: 'test.bodyNear', kind: 'proximity', key: `body_${victim}` });
      expect(r.dueTick - r.sinceTick).toBe(staggerTicks(id, `test.bodyNear:body_${victim}`));
      expect(r.dueTick - r.sinceTick).toBeGreaterThanOrEqual(Math.round(min * TICK_RATE));
      expect(r.dueTick - r.sinceTick).toBeLessThanOrEqual(Math.round(max * TICK_RATE));
      expect(dues[i]).toBe(r.dueTick);
    }
    advance(party, 5);
    expect(npcs.map((id) => heldReaction(party.room, id)?.dueTick)).toEqual(dues);
    advance(party, Math.round(max * TICK_RATE));
    for (const id of npcs) expect(dueReaction(party.room, id)).not.toBeNull();
    armed = false;
    advance(party, 1);
    for (const id of npcs) expect(heldReaction(party.room, id)).toBeNull();
  });
});
