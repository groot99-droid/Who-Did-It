import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { NavGrid, Phase, TICK_RATE } from '@wdi/shared';
import { navs } from '@wdi/content';
import { spawnBody } from '../src/sim/Bodies';
import { npcMemory } from '../src/sim/npc/memory';
import { simOf, type MeetingRequest } from '../src/sim/RoomSim';
import { sceneKey, sceneIndex } from '../src/sim/World';
import { until } from './flowHelpers';
import { openRun } from './killHelpers';
import {
  type Party,
  allTownsfolk,
  bootNpcServer,
  lobbyOf,
  npcSeats,
  placeSeat,
  send,
  setRole,
  start,
  toWorld,
} from './npcHelpers';
import { sleep } from './simHelpers';

/** A run of eight open overworld tiles: the test scenes stand on it. */
const RUN = openRun('overworld', 8);

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

/** 1 human + 3 NPCs in the first world phase, all Townsfolk. */
async function world(): Promise<Party> {
  const party = await lobbyOf(colyseus, 1);
  await start(party);
  await toWorld(party);
  allTownsfolk(party.room);
  return party;
}

const simAt = (party: Party, id: string) => simOf(party.room).players.get(id)!;

/** Records every meeting request pushed into the sim, even after the phase stage drains the queue. */
function watchRequests(party: Party): MeetingRequest[] {
  const seen: MeetingRequest[] = [];
  const sim = simOf(party.room);
  const push = sim.meetingRequests.push.bind(sim.meetingRequests);
  sim.meetingRequests.push = (...items: MeetingRequest[]) => {
    seen.push(...items);
    return push(...items);
  };
  return seen;
}

/** Everyone but `keep` becomes a ghost, so the scenario has the seats it names and no more. */
function onlyAlive(party: Party, keep: string[]): void {
  for (const [id, p] of simOf(party.room).players) p.dead = !keep.includes(id);
}

describe('NPC walking', () => {
  it('moves NPCs and keeps every position inside the nav grid', async () => {
    const party = await world();
    const sim = simOf(party.room);
    const npcs = npcSeats(party.room).map((p) => p.id);
    const grids = new Map<number, NavGrid>();
    const start = new Map(npcs.map((id) => [id, { x: simAt(party, id).x, y: simAt(party, id).y }]));
    let samples = 0;
    for (let i = 0; i < 60; i++) {
      await sleep(50);
      for (const id of npcs) {
        const p = sim.players.get(id)!;
        let grid = grids.get(p.sceneIdx);
        if (!grid) grids.set(p.sceneIdx, (grid = new NavGrid(navs[sceneKey(p.sceneIdx)], sim.profile)));
        expect(grid.solidAtPx(p.x, p.y), `${id} stands in a wall`).toBe(false);
        samples++;
      }
    }
    expect(samples).toBeGreaterThan(100);
    const travelled = npcs.filter((id) => {
      const p = simAt(party, id);
      return Math.hypot(p.x - start.get(id)!.x, p.y - start.get(id)!.y) > 4;
    });
    expect(travelled.length).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it('crosses portals when the wander table says so', async () => {
    const w = balance.npc.wander as Record<string, number>;
    const saved = { ...w };
    Object.assign(w, { stepMinS: 0.5, stepMaxS: 1, portalSteerChance: 1, portalChance: 1 });
    try {
      const party = await world();
      const npcs = npcSeats(party.room).map((p) => p.id);
      const scenesSeen = new Set<number>();
      await until(() => {
        for (const id of npcs) scenesSeen.add(simAt(party, id).sceneIdx);
        return npcs.some((id) => simAt(party, id).sceneIdx !== sceneIndex('overworld'));
      }, 25_000);
      expect(npcs.some((id) => simAt(party, id).sceneIdx !== sceneIndex('overworld'))).toBe(true);
      expect(scenesSeen.size).toBeGreaterThan(1);
    } finally {
      Object.assign(w, saved);
    }
  }, 40_000);

  it('parks on the spawn with debug.npc and walks again when told to', async () => {
    const party = await world();
    const npcs = npcSeats(party.room).map((p) => p.id);
    await send(party.humans[0]!, 'debug.npc', { walk: false }, 300);
    const parked = npcs.map((id) => ({ x: simAt(party, id).x, y: simAt(party, id).y }));
    await sleep(1500);
    npcs.forEach((id, i) => {
      expect(Math.hypot(simAt(party, id).x - parked[i]!.x, simAt(party, id).y - parked[i]!.y)).toBeLessThan(
        1,
      );
    });
    await send(party.humans[0]!, 'debug.npc', { walk: true }, 2500);
    const moved = npcs.filter(
      (id, i) => Math.hypot(simAt(party, id).x - parked[i]!.x, simAt(party, id).y - parked[i]!.y) > 4,
    );
    expect(moved.length).toBeGreaterThanOrEqual(1);
  }, 30_000);
});

describe('NPC reports', () => {
  it('reports a body in reach after reportDelayS', async () => {
    const party = await world();
    const [a, b] = npcSeats(party.room).map((p) => p.id) as [string, string];
    const human = party.humans[0]!.id;
    onlyAlive(party, [a, human]);
    const requests = watchRequests(party);
    await send(party.humans[0]!, 'debug.npc', { walk: false }, 200);
    party.room.state.phase = Phase.day;
    party.room.state.phaseEndsTick = party.room.state.tick + 20 * 3600;
    placeSeat(party, a, 'overworld', RUN.x + 0, RUN.y);
    const body = { x: 41 };
    // `walk: false` stops the walk, not the report: unpark so the report stage runs.
    spawnBody(party.room, 'overworld', b, RUN.x + body.x - 40, RUN.y);
    npcMemory(party.room).walk = true;
    const placedAt = party.room.state.tick;
    await until(() => requests.length > 0, 15_000);
    expect(requests[0]).toMatchObject({ reason: 'body', callerId: a, bodyOf: b });
    const waited = party.room.state.tick - placedAt;
    expect(waited).toBeGreaterThanOrEqual(balance.npc.difficulty.normal.reportDelayS * TICK_RATE - 2);
  }, 30_000);

  it('never reports when it holds the Knife', async () => {
    const party = await world();
    const [a, b] = npcSeats(party.room).map((p) => p.id) as [string, string];
    setRole(party.room, a, 'killer');
    onlyAlive(party, [a, party.humans[0]!.id]);
    const requests = watchRequests(party);
    party.room.state.phase = Phase.day;
    party.room.state.phaseEndsTick = party.room.state.tick + 20 * 3600;
    placeSeat(party, a, 'overworld', RUN.x + 0, RUN.y);
    spawnBody(party.room, 'overworld', b, RUN.x + 1, RUN.y);
    await sleep((balance.npc.difficulty.normal.reportDelayS + 3) * 1000);
    expect(requests).toHaveLength(0);
  }, 30_000);
});

describe('NPC votes', () => {
  it('votes inside npc.vote.delayMinS..delayMaxS after the discussion opens', async () => {
    const party = await world();
    const npcs = npcSeats(party.room);
    const human = party.humans[0]!.id;
    simOf(party.room).meetingRequests.push({ reason: 'bell', callerId: human });
    await until(() => party.room.state.phase === Phase.meetingDiscussion);
    const opened = party.room.state.tick;
    const votedAt = new Map<string, number>();
    await until(() => {
      for (const p of npcs) if (p.hasVoted && !votedAt.has(p.id)) votedAt.set(p.id, party.room.state.tick);
      return votedAt.size === npcs.length;
    }, 20_000);
    expect(votedAt.size).toBe(npcs.length);
    for (const tick of votedAt.values()) {
      expect(tick - opened).toBeGreaterThanOrEqual(balance.npc.vote.delayMinS * TICK_RATE - 3);
      expect(tick - opened).toBeLessThanOrEqual(balance.npc.vote.delayMaxS * TICK_RATE + 3);
    }
    const living = new Set([...party.room.state.players.keys(), 'skip']);
    for (const p of npcs) expect(living.has(p.priv.myVote)).toBe(true);
  }, 40_000);

  it('votes for the seat it saw at a body when suspectVoteChance is 1', async () => {
    const row = balance.npc.difficulty.normal as { suspectVoteChance: number };
    const saved = row.suspectVoteChance;
    row.suspectVoteChance = 1;
    try {
      const party = await world();
      const [a, b, c] = npcSeats(party.room).map((p) => p.id) as [string, string, string];
      onlyAlive(party, [a, c, party.humans[0]!.id]);
      party.room.state.phase = Phase.day;
      party.room.state.phaseEndsTick = party.room.state.tick + 20 * 3600;
      placeSeat(party, a, 'overworld', RUN.x + 0, RUN.y);
      placeSeat(party, c, 'overworld', RUN.x + 2, RUN.y);
      spawnBody(party.room, 'overworld', b, RUN.x + 1, RUN.y);
      await until(() => npcMemory(party.room).brain(a).suspicion.has(c), 5000);
      expect(npcMemory(party.room).brain(a).suspicion.get(c)).toBeGreaterThanOrEqual(1);
      simOf(party.room).meetingRequests.push({ reason: 'bell', callerId: party.humans[0]!.id });
      await until(() => party.room.state.players.get(a)?.hasVoted === true, 20_000);
      expect(party.room.state.players.get(a)?.priv.myVote).toBe(c);
    } finally {
      row.suspectVoteChance = saved;
    }
  }, 60_000);
});

describe('NPC Killer', () => {
  it('strikes a lone human at night, then runs for a basin', async () => {
    const row = balance.npc.difficulty.normal as { killChancePer10s: number };
    const saved = row.killChancePer10s;
    row.killChancePer10s = 1;
    try {
      const party = await world();
      const [k] = npcSeats(party.room).map((p) => p.id) as [string];
      const human = party.humans[0]!.id;
      setRole(party.room, k, 'killer');
      onlyAlive(party, [k, human]);
      party.room.state.phase = Phase.night;
      party.room.state.phaseEndsTick = party.room.state.tick + 20 * 3600;
      party.room.state.players.get(k)?.priv.cooldownEndTick.set('kill', 0);
      placeSeat(party, k, 'overworld', RUN.x + 0, RUN.y);
      placeSeat(party, human, 'overworld', RUN.x + 4, RUN.y);
      await until(() => simAt(party, human).dead, 15_000);
      expect(simAt(party, human).dead).toBe(true);
      expect(npcMemory(party.room).brain(k).flee).not.toBeNull();
    } finally {
      row.killChancePer10s = saved;
    }
  }, 30_000);

  it('does nothing while a third seat is in the scene', async () => {
    const row = balance.npc.difficulty.normal as { killChancePer10s: number };
    const saved = row.killChancePer10s;
    row.killChancePer10s = 1;
    try {
      const party = await world();
      const [k, other] = npcSeats(party.room).map((p) => p.id) as [string, string];
      const human = party.humans[0]!.id;
      setRole(party.room, k, 'killer');
      onlyAlive(party, [k, other, human]);
      party.room.state.phase = Phase.night;
      party.room.state.phaseEndsTick = party.room.state.tick + 20 * 3600;
      party.room.state.players.get(k)?.priv.cooldownEndTick.set('kill', 0);
      await send(party.humans[0]!, 'debug.npc', { walk: false }, 200);
      npcMemory(party.room).walk = true;
      for (const [id, x] of [
        [k, 40],
        [other, 42],
        [human, 44],
      ] as const) {
        placeSeat(party, id, 'overworld', RUN.x + x - 40, RUN.y);
      }
      // The two NPCs wander off on their own, so only assert the strike never lands while all three share.
      const until2 = Date.now() + 3000;
      while (Date.now() < until2) {
        const p = simOf(party.room);
        const together = [k, other, human].every(
          (id) => p.players.get(id)!.sceneIdx === p.players.get(k)!.sceneIdx,
        );
        if (together) expect(p.players.get(human)!.dead).toBe(false);
        await sleep(100);
      }
    } finally {
      row.killChancePer10s = saved;
    }
  }, 30_000);
});
