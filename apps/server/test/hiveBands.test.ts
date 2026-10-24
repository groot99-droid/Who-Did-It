import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase, S2C, TICK_RATE, TILE_PX } from '@wdi/shared';
import { runAction } from '../src/sim/Actions';
import { spawnBody } from '../src/sim/Bodies';
import { runInvariants } from '../src/sim/auto/invariants';
import { emitNoise } from '../src/sim/Noise';
import { difficultyRow } from '../src/sim/npc/difficulty';
import { hiveOf } from '../src/sim/npc/hive';
import { npcMemory } from '../src/sim/npc/memory';
import { simOf } from '../src/sim/RoomSim';
import { record } from './killHelpers';
import { sleep } from './simHelpers';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  pauseClock,
  placeSeat,
  setRole,
  start,
  toWorld,
} from './npcHelpers';

// Round 8, 8R (A174, A176; GDD 3.8, 3.12): the body bands, the shout and the night bell. The forest's open top row
// (y 1) holds no scene light, as nightSight.test.ts and hiveSenses.test.ts use it.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const px = (t: number) => (t + 0.5) * TILE_PX;
const seconds = (s: number) => Math.round(s * TICK_RATE);

/** `humans` humans and the NPC seats, all Townsfolk, off the clock; the NPCs past the first `keep` lie dead. */
async function world(humans: number, keep: number): Promise<{ party: Party; npcs: string[] }> {
  const party = await lobbyOf(colyseus, humans);
  await start(party);
  await toWorld(party);
  allTownsfolk(party.room);
  pauseClock(party.room);
  const npcs = [...npcMemory(party.room).order];
  for (const id of npcs.slice(keep)) simOf(party.room).players.get(id)!.dead = true;
  for (const h of party.humans) placeSeat(party, h.id, 'overworld', 5, 5);
  return { party, npcs };
}

/**
 * The ticks a report takes `tiles` from a body: the noticing stagger, the walk, the difficulty row's delay and 2 s of
 * slack. The routine alone, which found such a body only by chance, took longer in both regression cases.
 */
const deadline = (party: Party, tiles: number) =>
  seconds(
    balance.npc.hive.staggerS.max +
      tiles / balance.movement.walkTilesPerS +
      difficultyRow(party.room).reportDelayS +
      2,
  );

const requestsOf = (party: Party) => record({ room: party.room } as never).requests;

describe('the body bands (8R)', () => {
  it('the playtest bug: an NPC Detective nine tiles from a body by day walks to it and reports it', async () => {
    const { party, npcs } = await world(1, 1);
    const [det, dead] = npcs as [string, string];
    setRole(party.room, det, 'detective');
    holdPhase(party, Phase.day, 120);
    placeSeat(party, det, 'forest', 7, 1);
    spawnBody(party.room, 'forest', dead, 16, 1);
    const requests = requestsOf(party);
    for (let i = 0; i < deadline(party, 9) && requests.length === 0; i++) advance(party, 1);
    expect(requests).toEqual([expect.objectContaining({ reason: 'body', callerId: det, bodyOf: dead })]);
  });

  it('a kill scream heard at night from six tiles draws the NPC to a body it cannot see, and it reports it', async () => {
    const { party, npcs } = await world(1, 1);
    const [a, dead] = npcs as [string, string];
    holdPhase(party, Phase.night, 120);
    placeSeat(party, a, 'forest', 7, 1);
    spawnBody(party.room, 'forest', dead, 13, 1);
    advance(party, 1);
    expect(simOf(party.room).reportedBodies.size).toBe(0);
    emitNoise(party.room, 'forest', px(13), px(1), balance.noise.killScream, 'scream', dead);
    const requests = requestsOf(party);
    for (let i = 0; i < deadline(party, 6) && requests.length === 0; i++) advance(party, 1);
    expect(requests).toEqual([expect.objectContaining({ reason: 'body', callerId: a })]);
  });

  it('the shout reaches the nearest Detective on its own client only; the board keeps where, never who', async () => {
    const { party, npcs } = await world(2, 1);
    const [a, dead] = npcs as [string, string];
    const [holder, other] = party.humans as [(typeof party.humans)[0], (typeof party.humans)[0]];
    setRole(party.room, holder.id, 'detective');
    holdPhase(party, Phase.day, 120);
    placeSeat(party, a, 'forest', 7, 1);
    spawnBody(party.room, 'forest', dead, 10, 1);
    let shoutFact = false;
    for (let i = 0; i < seconds(5); i++) {
      advance(party, 1);
      const [fact] = hiveOf(party.room).all('shout');
      if (fact) {
        shoutFact = true;
        expect(Object.keys(fact).sort()).toEqual(['kind', 'ref', 'sceneId', 'tick', 'x', 'y']);
      }
      expect(runInvariants(party.room).filter((f) => f.name === 'hiveNoSecrets')).toEqual([]);
    }
    expect(shoutFact).toBe(true);
    await sleep(300);
    const shouts = (h: typeof holder) => h.log.filter((m) => m.type === S2C.shout).map((m) => m.payload);
    expect(shouts(holder)).toEqual([{ sceneId: 'forest', x: expect.any(Number), y: expect.any(Number) }]);
    expect(shouts(other)).toEqual([]);
  });

  it('the first NPC in the bell band stays by the body; the next runs for the bell and rings it at night', async () => {
    const { party, npcs } = await world(1, 2);
    const [a, b, dead] = npcs as [string, string, string];
    holdPhase(party, Phase.night, 120);
    placeSeat(party, a, 'overworld', 28, 22);
    placeSeat(party, b, 'overworld', 29, 22);
    spawnBody(party.room, 'overworld', dead, 28, 21);
    const requests = requestsOf(party);
    for (let i = 0; i < seconds(20) && requests.length === 0; i++) advance(party, 1);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.reason).toBe('bell');
    expect([a, b]).toContain(requests[0]!.callerId);
  });

  it('waits through immunity by the body instead of a refused report, and reports once a verb works', async () => {
    const { party, npcs } = await world(1, 1);
    const [a, dead] = npcs as [string, string];
    holdPhase(party, Phase.immunity, 120);
    placeSeat(party, a, 'forest', 7, 1);
    spawnBody(party.room, 'forest', dead, 8, 1);
    const requests = requestsOf(party);
    advance(party, seconds(10));
    expect(requests).toEqual([]);
    holdPhase(party, Phase.day, 120);
    for (let i = 0; i < seconds(10) && requests.length === 0; i++) advance(party, 1);
    expect(requests).toEqual([expect.objectContaining({ reason: 'body', callerId: a })]);
  });
});

describe('the night bell (A174)', () => {
  it('rings at night only while an unreported body lies in the world', async () => {
    const { party, npcs } = await world(1, 1);
    const [, dead] = npcs as [string, string];
    const human = party.humans[0]!.id;
    holdPhase(party, Phase.night, 120);
    placeSeat(party, human, 'overworld', 28, 21);
    const requests = requestsOf(party);
    runAction(party.room, human, 'act.bell', {});
    expect(requests).toEqual([]);
    spawnBody(party.room, 'forest', dead, 7, 1);
    runAction(party.room, human, 'act.bell', {});
    expect(requests).toEqual([expect.objectContaining({ reason: 'bell', callerId: human })]);
  });
});
