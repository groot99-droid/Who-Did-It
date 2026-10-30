import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { Phase } from '@wdi/shared';
import { avatarMemory, avatarOf } from '../src/sim/Avatars';
import { emitSim } from '../src/sim/events/bus';
import { mapScenesOf } from '../src/sim/MapSites';
import { moodPool } from '../src/sim/npc/moodHooks';
import { npcMemory } from '../src/sim/npc/memory';
import { needsOf } from '../src/sim/npc/needs';
import { profileOfRoom, stationsOf } from '../src/sim/npc/routine';
import { simOf } from '../src/sim/RoomSim';
import { openRun } from './killHelpers';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  npcSeats,
  placeSeat,
  start,
  toWorld,
} from './npcHelpers';

/** The mood hooks (round 10, T6b, GDD 3.24): a mood narrows a work trip's pool, the Angry hook follows the face. */

const RUN = openRun('overworld', 8);
const always = () => 0;
const never = () => 0.999;

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

async function world(): Promise<{ party: Party; a: string; human: string }> {
  const party = await lobbyOf(colyseus, 1);
  await start(party);
  await toWorld(party);
  allTownsfolk(party.room);
  const [a] = npcSeats(party.room).map((p) => p.id) as [string];
  const human = party.humans[0]!.id;
  for (const [id, p] of simOf(party.room).players) p.dead = id !== a && id !== human;
  holdPhase(party, Phase.day, 3600);
  placeSeat(party, a, 'overworld', RUN.x, RUN.y);
  placeSeat(party, human, 'overworld', RUN.x + 3, RUN.y);
  advance(party, 2);
  return { party, a, human };
}

const poolOf = (party: Party) => stationsOf(mapScenesOf(party.room), profileOfRoom(party.room));

function narrow(party: Party, a: string, rng: () => number) {
  const brain = npcMemory(party.room).brain(a);
  const p = simOf(party.room).players.get(a)!;
  return moodPool(party.room, brain, a, brain.persona?.home ?? null, p, poolOf(party), rng);
}

describe('mood hooks', () => {
  it('leave a Calm seat, and a failed chance roll, with the whole pool and draw nothing when Calm', async () => {
    const { party, a } = await world();
    let draws = 0;
    expect(narrow(party, a, () => (draws++, 0))).toHaveLength(poolOf(party).length);
    expect(draws).toBe(0);
    const n = needsOf(npcMemory(party.room).brain(a));
    n.mood = 'hungry';
    expect(narrow(party, a, never)).toHaveLength(poolOf(party).length);
  });

  it('send a Hungry seat to the bakery, and a Desperate one to scenes nobody stands in', async () => {
    const { party, a } = await world();
    const n = needsOf(npcMemory(party.room).brain(a));
    n.mood = 'hungry';
    const food = narrow(party, a, always);
    expect(food.length).toBeGreaterThan(0);
    expect(food.every((st) => st.scene === 'bakery')).toBe(true);
    n.mood = 'desperate';
    expect(narrow(party, a, always).every((st) => st.scene !== 'overworld')).toBe(true);
  });

  it('keep an Angry seat in its own scene near the drawn face that struck it, and only while that face is in sight', async () => {
    const { party, a, human } = await world();
    const n = needsOf(npcMemory(party.room).brain(a));
    // The striker is drawn with a look that is not its own: the hook follows what the avatar shows.
    const handle = avatarMemory(party.room).handleOf.get(human)!;
    avatarOf(party.room, handle)!.lookOf = 'villager';
    emitSim(party.room, {
      tick: party.room.state.tick,
      kind: 'body.hit',
      data: { target: a, by: human, dmg: 1 },
    });
    advance(party, 1);
    n.mood = 'angry';
    n.angryAt = human;
    const near = narrow(party, a, always);
    expect(near.length).toBeGreaterThan(0);
    expect(near.every((st) => st.scene === 'overworld')).toBe(true);
    // Out of the scene, jailed-equivalent or dead: the normal pool.
    placeSeat(party, human, 'tavern_bar', 4, 4);
    advance(party, 2);
    expect(narrow(party, a, always)).toHaveLength(poolOf(party).length);
    placeSeat(party, human, 'overworld', RUN.x + 3, RUN.y);
    simOf(party.room).players.get(human)!.dead = true;
    advance(party, 2);
    expect(narrow(party, a, always)).toHaveLength(poolOf(party).length);
  });
});
