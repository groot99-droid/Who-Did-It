import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { registeredInvariants, runInvariants } from '../src/sim/auto/invariants';
import { bodies, bodyOf, publishBodies } from '../src/sim/body';
import { simOf } from '../src/sim/RoomSim';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  pauseClock,
  send,
  start,
  toWorld,
} from './npcHelpers';

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const failing = (room: PartyRoom): string[] => runInvariants(room).map((f) => f.name);
const bodyFailure = (room: PartyRoom): string | undefined =>
  runInvariants(room).find((f) => f.name === 'bodyBounds')?.detail;

/** Two humans and two NPC seats, every one a Townsfolk, by day on the test's own steps. */
async function party4(): Promise<Party> {
  const party = await lobbyOf(colyseus, 2);
  for (let i = 0; i < 2; i++) await send(party.humans[0]!, 'lobby.addNpc', {}, 40);
  await start(party);
  await toWorld(party);
  pauseClock(party.room);
  allTownsfolk(party.room);
  holdPhase(party, Phase.day, 900);
  advance(party, 1);
  return party;
}

describe('the bodyBounds invariant (round 8, GDD 3.22; body.md 8)', () => {
  it('is registered on import and stays quiet on a whole party', async () => {
    const party = await party4();
    const { room } = party;
    expect(registeredInvariants()).toContain('bodyBounds');
    expect(bodies(room).size).toBe(4);
    expect(failing(room)).not.toContain('bodyBounds');
    advance(party, 60);
    expect(failing(room)).not.toContain('bodyBounds');
  });

  it('fires on health or stamina out of bounds', async () => {
    const { room, humans } = await party4();
    const body = bodyOf(room, humans[0]!.id)!;
    body.hp = balance.body.maxHp + 1;
    expect(bodyFailure(room)).toMatch(/health 101\/100/);
    body.hp = balance.body.maxHp;
    body.stamina = -1;
    expect(bodyFailure(room)).toMatch(/stamina -1/);
    body.stamina = 0;
    expect(bodyFailure(room)).toBeUndefined();
  });

  it('fires on a dead seat that keeps a body, and on a living one without', async () => {
    const party = await party4();
    const { room, humans } = party;
    const id = humans[1]!.id;
    const sim = simOf(room);
    sim.players.get(id)!.dead = true;
    // The tick of the death is no failure (the body stage has not run yet); the next tick is.
    expect(bodyFailure(room)).toBeUndefined();
    room.state.tick += 1;
    expect(bodyFailure(room)).toMatch(/dead seat/);
    // The publish drops it (a ghost has no body) and empties the wire: quiet again.
    publishBodies(room);
    expect(bodies(room).has(id)).toBe(false);
    expect(room.state.players.get(id)!.priv.body.hp).toBe(0);
    expect(bodyFailure(room)).toBeUndefined();
    sim.players.get(id)!.dead = false;
    expect(bodyFailure(room)).toMatch(/living seat without a body/);
  });
});
