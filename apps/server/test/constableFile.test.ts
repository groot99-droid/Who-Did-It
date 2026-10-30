import type { ColyseusTestServer } from '@colyseus/testing';
import type { Client } from 'colyseus';
import { balance } from '@wdi/content';
import { C2S, ClueKind, ManhuntState, Phase, TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { spawnClue } from '../src/sim/Clues';
import { constableCandidate, fileByConstables, warrantsOf } from '../src/sim/law/Petition';
import { isNpcSeat } from '../src/sim/Npc';
import { addNpcSeat } from '../src/sim/npc/seats';
import { isPaintTown } from '../src/sim/paintTown';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  pauseClock,
  setRole,
  start,
  toWorld,
} from './npcHelpers';

/**
 * The Constables' own petitions (round 10, B3c; GDD 3.31; world-mode 1.6 and 12 R3; A329): on their posted briefings,
 * when exactly one roster figure's public traits fit them, in Paint The Town Red only. Nothing but the briefings and
 * the public traits is read: swapping two seats' cards changes nothing.
 */

const S = (s: number): number => Math.round(s * TICK_RATE);

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** Three humans and the NPC fill by day; the NPC seat is tall with the first scarf, every other seat short. */
async function world(): Promise<{ party: Party; target: string }> {
  const party = await lobbyOf(colyseus, 3);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  holdPhase(party, Phase.day, 3600);
  const target = [...party.room.state.players.keys()].find((id) => isNpcSeat(party.room, id))!;
  for (const [id, p] of party.room.state.players) {
    p.traits.height = id === target ? 2 : 0;
    p.traits.scarf = id === target ? 0 : 1;
  }
  advance(party, 1);
  return { party, target };
}

/** A real Paint The Town Red match (as `paintTown.test.ts` sets one up): two humans and four NPC seats, dealt. */
async function paintParty(): Promise<{ party: Party; target: string }> {
  const party = await lobbyOf(colyseus, 2);
  pauseClock(party.room);
  for (let i = 0; i < 4; i++) addNpcSeat(party.room, party.room.seeds.get('npcNames'));
  party.room.lobbyCommands.push({ sessionId: party.humans[0]!.id } as Client, C2S.lobbyStart, {});
  advance(party, 1);
  party.room.state.phaseEndsTick = party.room.state.tick;
  for (let i = 0; i < 40; i++) advance(party, 1);
  holdPhase(party, Phase.day, 3600);
  const target = [...party.room.state.players.keys()].find((id) => isNpcSeat(party.room, id))!;
  for (const [id, p] of party.room.state.players) {
    p.traits.height = id === target ? 2 : 0;
    p.traits.scarf = id === target ? 0 : 1;
  }
  return { party, target };
}

/** Footprints and a thread in the bakery, briefed after `law.briefingAfterS`. */
function brief(party: Party, height: number, scarf: number): void {
  spawnClue(party.room, 'bakery', { kind: ClueKind.footprints, value: height, dir: 0, tx: 3, ty: 4 });
  spawnClue(party.room, 'bakery', { kind: ClueKind.thread, value: scarf, dir: 0, tx: 5, ty: 4 });
  advance(party, S(balance.law.briefingAfterS) + 2);
}

describe("the Constables' own petitions (GDD 3.31, B3c)", () => {
  it('file on two briefings that fit one figure; the petition passes and the manhunt hunts it', async () => {
    const { party, target } = await world();
    brief(party, 2, 0);
    fileByConstables(party.room);
    const row = party.room.state.petition.toJSON() as Record<string, unknown>;
    expect([row.accused, row.charge, row.needed, row.signed]).toEqual([target, 'murder', 0, 0]);
    expect(row.entries).toEqual([
      { clueKind: ClueKind.thread, value: 0, sceneId: expect.any(Number), backed: true },
      { clueKind: ClueKind.footprints, value: 2, sceneId: expect.any(Number), backed: true },
    ]);
    advance(party, 1);
    expect(warrantsOf(party.room).map((w) => [w.accused, w.watchers])).toEqual([[target, []]]);
    expect([party.room.state.manhunt.accused, party.room.state.manhunt.state]).toEqual([
      target,
      ManhuntState.hunting,
    ]);
  });

  it('file on their own in a real Paint The Town Red match, through the step', async () => {
    const { party, target } = await paintParty();
    expect(isPaintTown(party.room)).toBe(true);
    brief(party, 2, 0);
    advance(party, 2);
    expect(warrantsOf(party.room).map((w) => w.accused)).toEqual([target]);
    expect(party.room.state.manhunt.accused).toBe(target);
  });

  it('never file in world mode, nor on a tie, nor on one briefed trait', async () => {
    const { party, target } = await world();
    brief(party, 2, 0);
    advance(party, S(5)); // runPetition: the mode gate is closed outside Paint The Town Red
    expect(party.room.state.petition.id).toBe('');
    const other = [...party.room.state.players.keys()].find((id) => id !== target)!;
    const t = party.room.state.players.get(other)!.traits;
    t.height = 2;
    t.scarf = 0;
    expect(constableCandidate(party.room)).toBeNull(); // a tie
    t.height = 0;
    party.room.state.players.get(target)!.traits.scarf = 2;
    expect(constableCandidate(party.room)).toBeNull(); // only the height fits
  });

  it("A170-style: swapping two seats' cards leaves the decision and the public row identical", async () => {
    const { party, target } = await world();
    brief(party, 2, 0);
    const before = constableCandidate(party.room);
    const a = target;
    const b = [...party.room.state.players.keys()].find((id) => id !== target);
    setRole(party.room, a!, 'killer');
    setRole(party.room, b!, 'detective');
    const swappedOnce = JSON.stringify(constableCandidate(party.room));
    setRole(party.room, a!, 'detective');
    setRole(party.room, b!, 'killer');
    expect(JSON.stringify(constableCandidate(party.room))).toBe(swappedOnce);
    expect(JSON.stringify(before)).toBe(swappedOnce);
    fileByConstables(party.room);
    const rowA = JSON.stringify(party.room.state.petition.toJSON());
    expect(rowA).toContain(target);
    expect(rowA).not.toContain('killer');
  });
});
