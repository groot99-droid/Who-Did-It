import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import { spawnBody } from '../src/sim/Bodies';
import { registeredInvariants, runInvariants } from '../src/sim/auto/invariants';
import { hiveOf } from '../src/sim/npc/hive';
import { FACT_KEYS } from '../src/sim/npc/hive/board';
import { openRun } from './killHelpers';
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

const RUN = openRun('overworld', 8);

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** 1 human + 3 NPCs in day, all Townsfolk, off the clock. */
async function world(): Promise<Party> {
  const party = await lobbyOf(colyseus, 1);
  await start(party);
  await toWorld(party);
  allTownsfolk(party.room);
  pauseClock(party.room);
  holdPhase(party, Phase.day, 120);
  return party;
}

const hiveFailures = (party: Party) => runInvariants(party.room).filter((f) => f.name === 'hiveNoSecrets');

describe('the hive blackboard (8R, A176)', () => {
  it('registers hiveNoSecrets', () => {
    expect(registeredInvariants()).toContain('hiveNoSecrets');
  });

  it('holds the public world only: a body by its public of, a figure by the look it draws', async () => {
    const party = await world();
    const [human] = party.humans;
    const seats = [...party.room.state.players.keys()];
    const other = seats.find((id) => id !== human!.id)!;
    placeSeat(party, human!.id, 'overworld', RUN.x, RUN.y);
    spawnBody(party.room, 'overworld', other, RUN.x + 2, RUN.y);
    advance(party, 2);
    const board = hiveOf(party.room);
    const body = board.facts.get(`body:body_${other}`);
    expect(body).toMatchObject({ kind: 'body', sceneId: 'overworld', of: other });
    for (const fact of board.facts.values()) {
      for (const key of Object.keys(fact)) expect(FACT_KEYS.has(key)).toBe(true);
      expect(seats).not.toContain(fact.ref);
    }
    const sightings = [...board.all('sighting')];
    expect(sightings.length).toBeGreaterThan(0);
    const scene = party.room.state.scenes.get('overworld')!;
    for (const fact of sightings) expect(fact.lookOf).toBe(scene.avatars.get(fact.ref)?.lookOf);
    expect(hiveFailures(party)).toEqual([]);
  });

  it('forgets a heard fact after npc.hive.memoryS and everything outside a world phase', async () => {
    const party = await world();
    const board = hiveOf(party.room);
    const fact = board.hear('noise', 'overworld', 100, 100, party.room.state.tick, 'scream');
    advance(party, Math.round(balance.npc.hive.memoryS * TICK_RATE) - 2);
    expect(board.facts.has(`noise:${fact.ref}`)).toBe(true);
    advance(party, 3);
    expect(board.facts.has(`noise:${fact.ref}`)).toBe(false);
    party.room.state.phase = Phase.meetingDiscussion;
    advance(party, 1);
    expect(board.facts.size).toBe(0);
  });

  it('hiveNoSecrets fails a key outside the list, a seat named, a card named, a walker under a look and a stray field', async () => {
    const party = await world();
    const board = hiveOf(party.room);
    const seat = [...party.room.state.players.keys()][1]!;
    const check = (mutate: () => void, expected: RegExp) => {
      advance(party, 1);
      expect(hiveFailures(party)).toEqual([]);
      mutate();
      const [failure] = hiveFailures(party);
      expect(failure?.detail).toMatch(expected);
      board.facts.clear();
      delete (board as unknown as Record<string, unknown>).npcs;
    };
    check(() => {
      const f = board.hear('shout', 'overworld', 0, 0, party.room.state.tick);
      (f as unknown as Record<string, unknown>).seat = seat;
    }, /key seat/);
    check(() => board.hear('noise', 'overworld', 0, 0, party.room.state.tick, seat), /what names a seat/);
    check(() => board.hear('noise', 'overworld', 0, 0, party.room.state.tick, 'killer'), /names a card/);
    check(() => {
      const [fact] = [...board.all('sighting')];
      fact!.lookOf = `${fact!.lookOf}_walker`;
    }, /not the drawn look/);
    check(() => {
      (board as unknown as Record<string, unknown>).npcs = [seat];
    }, /board holds npcs/);
  });
});
