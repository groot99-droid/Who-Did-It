import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase, TICK_RATE, TILE_PX } from '@wdi/shared';
import { spawnBody } from '../src/sim/Bodies';
import { emitNoise } from '../src/sim/Noise';
import { difficultyRow } from '../src/sim/npc/difficulty';
import { npcMemory } from '../src/sim/npc/memory';
import { simOf } from '../src/sim/RoomSim';
import { record } from './killHelpers';
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

// Round 8, 8R (A174, A176; GDD 3.12): the body bands. The forest's open top row
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
