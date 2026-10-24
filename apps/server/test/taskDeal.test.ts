import type { ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { balance, maps, roles, scenes, tasks } from '@wdi/content';
import { C2S, ItemStack, Phase, S2C, TaskEntry, Winner, type PlayerState } from '@wdi/shared';
import { recomputeTaskBar } from '../src/sim/Minigames';
import { simOf } from '../src/sim/RoomSim';
import { dealTasks, taskPool } from '../src/sim/Tasks';
import { fixSeeds } from './seedHelpers';
import {
  advance,
  allTownsfolk,
  bootNpcServer,
  lobbyOf,
  npcSeats,
  pauseClock,
  placeSeat,
  send,
  start,
  toWorld,
  type Party,
} from './npcHelpers';

// Round 7, 7M (GDD 3.5, A133): the task deal at match start. New file; no existing test is edited.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

const WORDS = [11, 22, 33, 44] as const;
const HOLLOWMERE = maps.hollowmere.scenes;
const TASK_IDS = Object.values(tasks.tasks).map((t) => t.id);
const listOf = (p: PlayerState) => [...p.priv.tasks].map((t) => ({ id: t.id, done: t.done, fake: t.fake }));
const factionOf = (party: Party, id: string): string =>
  roles.roles[party.room.state.players.get(id)!.priv.role.roleId]?.faction ?? '';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('taskPool', () => {
  it('holds every task of Hollowmere at every profile, the co-op one among them (PR 4)', () => {
    for (const profile of ['small', 'medium', 'large'] as const) {
      expect(taskPool(HOLLOWMERE, profile)).toEqual(TASK_IDS);
    }
    expect(taskPool(HOLLOWMERE, 'small')).toContain('shutterWindows');
  });

  it('keeps only tasks whose source and a target stand on the map', () => {
    expect(taskPool(maps.blackpine.scenes, 'large')).toEqual([]);
    expect(taskPool(['overworld'], 'small')).toEqual([]);
    expect(taskPool(['overworld', 'apoth_shop'], 'small')).toEqual(['fixPump']);
    expect(taskPool(['overworld', 'tavern_back'], 'small')).toEqual(['lightLanterns']);
  });
});

describe('the deal at Start', () => {
  it('deals each Village seat tasksEach real tasks and the Cabal as many fake ones, from the pool, no repeats', async () => {
    const party = await lobbyOf(colyseus, 4);
    await start(party);
    const each = balance.byCount['4'].tasksEach;
    expect(party.room.state.taskBar).toBe(0);
    let cabal = 0;
    for (const h of party.humans) {
      const list = listOf(party.room.state.players.get(h.id)!);
      const fake = factionOf(party, h.id) === 'cabal';
      if (fake) cabal++;
      expect(list).toHaveLength(each);
      expect(new Set(list.map((t) => t.id)).size).toBe(each);
      for (const t of list) {
        expect(TASK_IDS).toContain(t.id);
        expect(t).toMatchObject({ done: false, fake });
      }
    }
    expect(cabal).toBe(1); // the Killer is always dealt (GDD 3.9)
  });

  it('draws the same lists for the same seats from the same tasks words', async () => {
    const lists: string[][][] = [];
    for (let run = 0; run < 2; run++) {
      const party = await lobbyOf(colyseus, 4);
      fixSeeds(party.room, { tasks: WORDS });
      await start(party);
      lists.push(party.humans.map((h) => listOf(party.room.state.players.get(h.id)!).map((t) => t.id)));
      await colyseus.cleanup();
    }
    expect(lists[0]).toEqual(lists[1]);
    expect(lists[0]!.flat().length).toBeGreaterThan(0);
  });

  it('deals a neutral seat a fake list and an NPC seat none', async () => {
    const party = await lobbyOf(colyseus, 2);
    await start(party);
    const [a, b] = party.humans;
    const npcs = npcSeats(party.room);
    expect(npcs.length).toBe(2);
    const dealt = new Map<string, string>([
      [a!.id, 'drifter'],
      [b!.id, 'townsfolk'],
      ...npcs.map(
        (p, i) =>
          [
            [...party.room.state.players.entries()].find(([, q]) => q === p)![0],
            i === 0 ? 'killer' : 'detective',
          ] as [string, string],
      ),
    ]);
    dealTasks(party.room, dealt);
    const each = balance.byCount['4'].tasksEach;
    const drifter = listOf(party.room.state.players.get(a!.id)!);
    expect(drifter).toHaveLength(each);
    expect(drifter.every((t) => t.fake)).toBe(true);
    const villager = listOf(party.room.state.players.get(b!.id)!);
    expect(villager).toHaveLength(each);
    expect(villager.every((t) => !t.fake)).toBe(true);
    for (const npc of npcs) expect(npc.priv.tasks.length).toBe(0);
  });

  it('deals nothing on Blackpine, where no task has a station', async () => {
    const party = await lobbyOf(colyseus, 4);
    await send(party.humans[0]!, C2S.lobbySettings, { map: 'blackpine' });
    expect(party.room.state.settings.map).toBe('blackpine');
    await start(party);
    for (const h of party.humans) expect(party.room.state.players.get(h.id)!.priv.tasks.length).toBe(0);
    expect(party.room.state.taskBar).toBe(0);
  });
});

describe('the bar', () => {
  it('moves with finished real tasks, ignores fake ones, and a full bar wins for the Village in play', async () => {
    const party = await lobbyOf(colyseus, 4);
    await start(party);
    await toWorld(party);
    pauseClock(party.room);
    party.room.state.phase = Phase.day;
    party.room.state.phaseEndsTick = party.room.state.tick + 1e6;
    const real = [...party.room.state.players.values()].flatMap((p) =>
      [...p.priv.tasks].filter((t) => !t.fake),
    );
    const fake = [...party.room.state.players.values()].flatMap((p) =>
      [...p.priv.tasks].filter((t) => t.fake),
    );
    expect(real.length).toBe(3 * balance.byCount['4'].tasksEach);
    expect(fake.length).toBe(balance.byCount['4'].tasksEach);
    for (const t of fake) t.done = true;
    recomputeTaskBar(party.room);
    expect(party.room.state.taskBar).toBe(0);
    real[0]!.done = true;
    recomputeTaskBar(party.room);
    expect(party.room.state.taskBar).toBe(Math.floor(100 / real.length));
    expect(party.room.state.phase).toBe(Phase.day);
    for (const t of real) t.done = true;
    recomputeTaskBar(party.room);
    expect(party.room.state.taskBar).toBe(100);
    expect(party.room.state.phase).toBe(Phase.gameOver);
    expect(party.room.state.winner).toBe(Winner.village);
  });

  it('lets a ghost open its own task (GDD 3.8)', async () => {
    const party = await lobbyOf(colyseus, 4);
    await start(party);
    await toWorld(party);
    allTownsfolk(party.room);
    pauseClock(party.room);
    party.room.state.phase = Phase.day;
    party.room.state.phaseEndsTick = party.room.state.tick + 1e6;
    const h = party.humans[1]!;
    const me = party.room.state.players.get(h.id)!;
    // White-box: one real task, its tool in hand, the seat dead and standing at the pump.
    dealTasks(party.room, new Map([[h.id, 'townsfolk']]));
    me.priv.tasks.clear();
    const entry = new TaskEntry();
    entry.id = 'fixPump';
    me.priv.tasks.push(entry);
    me.priv.inventory.slots.clear();
    const wrench = new ItemStack();
    wrench.defId = 'wrench';
    wrench.qty = 1;
    me.priv.inventory.slots.push(wrench);
    const pump = scenes.overworld.props.find((q) => q.id === 'ov.pump')!;
    placeSeat(party, h.id, 'overworld', pump.x, pump.y);
    simOf(party.room).players.get(h.id)!.dead = true;
    await send(h, 'act.hold', { action: 'task', targetId: 'fixPump', on: true }, 80);
    advance(party, 3);
    await wait(80);
    const opened = h.log.find((m) => m.type === S2C.minigameStart)?.payload as { kind: string } | undefined;
    expect(opened).toMatchObject({ kind: 'slide' });
  });
});
