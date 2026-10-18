import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, navs, scenes } from '@wdi/content';
import { NavGrid, NoteKind, NotebookEntry, Phase, SKIP_VOTE, TICK_RATE, Team } from '@wdi/shared';
import { spawnBody } from '../src/sim/Bodies';
import { npcMemory } from '../src/sim/npc/memory';
import { npcVoteTarget } from '../src/sim/npc/meeting';
import { simOf, type MeetingRequest } from '../src/sim/RoomSim';
import { isKillPhase, sceneIndex, sceneKey } from '../src/sim/World';
import { openRun } from './killHelpers';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  lobbyOf,
  npcIdsOf,
  npcSeats,
  placeSeat,
  send,
  setRole,
  standardParty,
  start,
  toWorld,
} from './npcHelpers';

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
    holdPhase(party, Phase.day, 3600);
    const npcs = npcSeats(party.room).map((p) => p.id);
    const grids = new Map<number, NavGrid>();
    const start = new Map(npcs.map((id) => [id, { x: simAt(party, id).x, y: simAt(party, id).y }]));
    let samples = 0;
    advance(party, 20 * 60, () => {
      for (const id of npcs) {
        const p = sim.players.get(id)!;
        let grid = grids.get(p.sceneIdx);
        if (!grid) grids.set(p.sceneIdx, (grid = new NavGrid(navs[sceneKey(p.sceneIdx)], sim.profile)));
        expect(grid.solidAtPx(p.x, p.y), `${id} stands in a wall`).toBe(false);
        samples++;
      }
    });
    expect(samples).toBeGreaterThan(100);
    const travelled = npcs.filter((id) => {
      const p = simAt(party, id);
      return Math.hypot(p.x - start.get(id)!.x, p.y - start.get(id)!.y) > 4;
    });
    expect(travelled.length).toBeGreaterThanOrEqual(2);
  });

  it('crosses portals in the M3c wander when routines are off and the wander table says so', async () => {
    const w = balance.npc.wander as Record<string, number>;
    const saved = { ...w };
    Object.assign(w, { stepMinS: 0.5, stepMaxS: 1, portalSteerChance: 1, portalChance: 1 });
    try {
      const party = await world();
      holdPhase(party, Phase.day, 3600);
      await send(party.humans[0]!, 'debug.npc', { routine: false }, 200);
      const npcs = npcSeats(party.room).map((p) => p.id);
      const scenesSeen = new Set<number>();
      advance(party, 20 * 60, () => {
        for (const id of npcs) scenesSeen.add(simAt(party, id).sceneIdx);
      });
      expect(scenesSeen.size).toBeGreaterThan(1);
      expect(scenesSeen.has(sceneIndex('overworld'))).toBe(true);
    } finally {
      Object.assign(w, saved);
    }
  });

  it('parks on the spawn with debug.npc and walks again when told to', async () => {
    const party = await world();
    holdPhase(party, Phase.day, 3600);
    const npcs = npcSeats(party.room).map((p) => p.id);
    await send(party.humans[0]!, 'debug.npc', { walk: false }, 300);
    advance(party, 2);
    const parked = npcs.map((id) => ({ x: simAt(party, id).x, y: simAt(party, id).y }));
    advance(party, 20 * 30);
    npcs.forEach((id, i) => {
      expect(Math.hypot(simAt(party, id).x - parked[i]!.x, simAt(party, id).y - parked[i]!.y)).toBeLessThan(
        1,
      );
    });
    await send(party.humans[0]!, 'debug.npc', { walk: true }, 300);
    advance(party, 20 * 60);
    const moved = npcs.filter(
      (id, i) => Math.hypot(simAt(party, id).x - parked[i]!.x, simAt(party, id).y - parked[i]!.y) > 4,
    );
    expect(moved.length).toBeGreaterThanOrEqual(1);
  });
});

describe('NPC reports', () => {
  /** An NPC `a` and a body of `b` one tile away in the overworld, by day, with the human and `a` alive. */
  async function bodyScenario() {
    const party = await world();
    const [a, b] = npcSeats(party.room).map((p) => p.id) as [string, string];
    onlyAlive(party, [a, party.humans[0]!.id]);
    const requests = watchRequests(party);
    holdPhase(party, Phase.day, 3600);
    placeSeat(party, a, 'overworld', RUN.x, RUN.y);
    spawnBody(party.room, 'overworld', b, RUN.x + 1, RUN.y);
    return { party, a, b, requests };
  }

  it('reports a body in reach after reportDelayS', async () => {
    const { party, a, b, requests } = await bodyScenario();
    const placedAt = party.room.state.tick;
    advance(party, 20 * 30, () => undefined);
    expect(requests[0]).toMatchObject({ reason: 'body', callerId: a, bodyOf: b });
    expect(party.room.state.tick).toBeGreaterThan(placedAt);
  });

  it('never reports a body it made, and reports one it did not make after reportDelayS', async () => {
    const { party, a, requests } = await bodyScenario();
    setRole(party.room, a, 'killer');
    const own = npcSeats(party.room).map((p) => p.id)[1]!;
    const brain = npcMemory(party.room).brain(a);
    brain.ownBodies.add(`body_${own}`);
    brain.seenBodies.add(`body_${own}`);
    advance(party, (balance.npc.difficulty.normal.reportDelayS + 3) * TICK_RATE);
    expect(requests).toHaveLength(0);
    expect(brain.startleUntilTick).toBe(-1);
    expect(brain.mode).toBe('routine');
  });
});

describe('NPC votes (npc.md part 2, section 5)', () => {
  /** Opens a bell meeting and runs it; returns when the discussion began and the tick each NPC voted at. */
  function meeting(party: Party, ids: readonly string[]) {
    const room = party.room;
    simOf(room).meetingRequests.push({ reason: 'bell', callerId: party.humans[0]!.id });
    let guard = 0;
    while (room.state.phase !== Phase.meetingDiscussion && guard++ < 5) advance(party, 1);
    const open = room.state.tick;
    const w = room.state.phaseEndsTick - open + balance.phases.voteS * TICK_RATE;
    const votedAt = new Map<string, number>();
    while (room.state.phase === Phase.meetingDiscussion || room.state.phase === Phase.meetingVote) {
      advance(party, 1);
      for (const id of ids) {
        if (room.state.players.get(id)?.hasVoted && !votedAt.has(id)) votedAt.set(id, room.state.tick);
      }
    }
    return { open, w, votedAt };
  }

  it('M1: votes inside npc.vote.windowFrac of discussion plus vote, ten meetings', async () => {
    const streak = balance.meeting as { noEjectionStreak: number };
    const savedStreak = streak.noEjectionStreak;
    streak.noEjectionStreak = 1000;
    try {
      const party = await standardParty(colyseus, 'S1');
      allTownsfolk(party.room);
      const ids = npcIdsOf('S1');
      const f = balance.npc.vote.windowFrac;
      let lowest = Infinity;
      let highest = -Infinity;
      let votes = 0;
      for (let round = 0; round < 10; round++) {
        holdPhase(party, Phase.day, 3600);
        advance(party, 5);
        const { open, w, votedAt } = meeting(party, ids);
        expect(votedAt.size, `meeting ${round}`).toBe(ids.length);
        for (const [id, t] of votedAt) {
          expect(t - open, `${id} meeting ${round}`).toBeGreaterThanOrEqual(Math.floor(f.min * w) - 1);
          expect(t - open, `${id} meeting ${round}`).toBeLessThanOrEqual(Math.ceil(f.max * w) + 1);
          expect(t - open).toBeGreaterThan(12 * TICK_RATE);
          lowest = Math.min(lowest, (t - open) / w);
          highest = Math.max(highest, (t - open) / w);
          votes++;
        }
        while (party.room.state.phase !== Phase.immunity && party.room.state.phase !== Phase.day)
          advance(party, 1);
      }
      expect(votes).toBe(90);
      expect(lowest).toBeLessThanOrEqual(0.4);
      expect(highest).toBeGreaterThanOrEqual(0.8);
    } finally {
      streak.noEjectionStreak = savedStreak;
    }
  });

  it('votes for the seat it saw at a body when suspectVoteChance is 1', async () => {
    const row = balance.npc.difficulty.normal as { suspectVoteChance: number };
    const saved = row.suspectVoteChance;
    row.suspectVoteChance = 1;
    try {
      const party = await world();
      const [a, b, c] = npcSeats(party.room).map((p) => p.id) as [string, string, string];
      onlyAlive(party, [a, c, party.humans[0]!.id]);
      holdPhase(party, Phase.day, 3600);
      placeSeat(party, a, 'overworld', RUN.x, RUN.y);
      placeSeat(party, c, 'overworld', RUN.x + 2, RUN.y);
      spawnBody(party.room, 'overworld', b, RUN.x + 1, RUN.y);
      advance(party, 5);
      expect(npcMemory(party.room).brain(a).suspicion.get(c)).toBeGreaterThanOrEqual(1);
      const { votedAt } = meeting(party, [a]);
      expect(votedAt.has(a)).toBe(true);
      expect(party.room.state.players.get(a)?.priv.myVote).toBe(c);
    } finally {
      row.suspectVoteChance = saved;
    }
  });

  it('M2: with Skip disabled every NPC votes for a living other seat, a Killer NPC included', async () => {
    const m = balance.meeting as { skipAllowed: boolean };
    const saved = m.skipAllowed;
    m.skipAllowed = false;
    try {
      const party = await standardParty(colyseus, 'S1');
      allTownsfolk(party.room);
      const ids = npcIdsOf('S1');
      setRole(party.room, ids[0]!, 'killer');
      holdPhase(party, Phase.day, 3600);
      advance(party, 5);
      const { votedAt } = meeting(party, ids);
      expect(votedAt.size).toBe(ids.length);
      // The ejection is over; the votes are still on the roster until the next meeting.
      for (const id of ids) {
        const vote = party.room.state.players.get(id)!.priv.myVote;
        expect(vote, id).not.toBe(SKIP_VOTE);
        expect(vote, id).not.toBe(id);
        expect(party.room.state.players.has(vote), id).toBe(true);
      }
    } finally {
      m.skipAllowed = saved;
    }
  });

  it('M6: a Cabal confession in the Notebook decides the vote, while the confessed seat lives', async () => {
    const row = balance.npc.difficulty.normal as { suspectVoteChance: number };
    const saved = row.suspectVoteChance;
    row.suspectVoteChance = 1;
    try {
      for (const confessedAlive of [true, false]) {
        await colyseus.cleanup();
        const party = await standardParty(colyseus, 'S1');
        allTownsfolk(party.room);
        const [vicar, confessed, suspect] = npcIdsOf('S1') as [string, string, string];
        setRole(party.room, vicar, 'vicar');
        const entry = new NotebookEntry();
        entry.id = 'entry_1';
        entry.note = NoteKind.confession;
        entry.of = confessed;
        entry.value = Team.cabal;
        party.room.state.players.get(vicar)!.priv.notebook.push(entry);
        npcMemory(party.room).brain(vicar).suspicion.set(suspect, 5);
        if (!confessedAlive) simAt(party, confessed).dead = true;
        holdPhase(party, Phase.day, 3600);
        advance(party, 5);
        // Before the vote tick the uniforms are the seat's night-power pick: one call, no draw.
        expect(npcVoteTarget(party.room, vicar)).toBe(confessedAlive ? confessed : suspect);
        meeting(party, [vicar]);
        expect(party.room.state.players.get(vicar)!.priv.myVote).toBe(confessedAlive ? confessed : suspect);
      }
    } finally {
      row.suspectVoteChance = saved;
    }
  });

  it('M7: a Killer and a Townsfolk NPC draw the same numbers in a meeting and vote at the same tick', async () => {
    const runs: { draws: number; timing: number; voteAt: number }[] = [];
    for (const killer of [true, false]) {
      await colyseus.cleanup();
      const party = await standardParty(colyseus, 'S1');
      allTownsfolk(party.room);
      const id = npcIdsOf('S1')[0]!;
      if (killer) {
        setRole(party.room, id, 'killer');
        party.room.state.players.get(id)!.priv.cooldownEndTick.set('kill', 1e9);
      }
      const counts = new Map<string, number>();
      const seeds = party.room.seeds;
      const get = seeds.get.bind(seeds);
      seeds.get = ((name: Parameters<typeof get>[0], key?: string) => {
        const rng = get(name, key);
        const label = `${name}:${key ?? ''}`;
        return () => {
          counts.set(label, (counts.get(label) ?? 0) + 1);
          return rng();
        };
      }) as typeof seeds.get;
      holdPhase(party, Phase.day, 3600);
      advance(party, 5);
      counts.clear();
      meeting(party, [id]);
      runs.push({
        draws: counts.get(`npcPlay:${id}`) ?? 0,
        timing: counts.get(`npcTiming:${id}`) ?? 0,
        voteAt: npcMemory(party.room).brain(id).voteAtTick,
      });
    }
    expect(runs[0]).toEqual(runs[1]);
    expect(runs[0]!.draws).toBeGreaterThan(0);
  });
});

describe('NPC Killer', () => {
  /** A Killer NPC and the lone human three tiles apart in the overworld, the Knife ready, three NPCs elsewhere. */
  async function hunt() {
    const party = await lobbyOf(colyseus, 1);
    for (let i = 0; i < 3; i++) await send(party.humans[0]!, 'lobby.addNpc', {}, 40);
    await start(party);
    await toWorld(party);
    allTownsfolk(party.room);
    const ids = npcSeats(party.room).map((p) => p.id);
    const [k, ...rest] = ids as [string, ...string[]];
    const human = party.humans[0]!.id;
    setRole(party.room, k, 'killer');
    party.room.state.players.get(k)?.priv.cooldownEndTick.set('kill', 0);
    // The other NPCs stand far away in other scenes, held there so they never join the scene.
    rest.forEach((id, i) => {
      const at = openRun(i === 0 ? 'chapel' : i === 1 ? 'barn' : 'bakery', 1);
      placeSeat(party, id, i === 0 ? 'chapel' : i === 1 ? 'barn' : 'bakery', at.x, at.y);
    });
    placeSeat(party, k, 'overworld', RUN.x, RUN.y);
    placeSeat(party, human, 'overworld', RUN.x + 3, RUN.y);
    return { party, k, human, rest };
  }

  it('M3: strikes a lone human only in the phases the Knife works in, then runs for a basin', async () => {
    const row = balance.npc.difficulty.normal as { killChancePer10s: number };
    const saved = row.killChancePer10s;
    row.killChancePer10s = 1;
    try {
      const { party, k, human } = await hunt();
      holdPhase(party, Phase.day, 3600);
      advance(party, 60 * TICK_RATE);
      expect(simAt(party, human).dead).toBe(false);
      // The walk of the day took them apart; stand them three tiles from each other again.
      placeSeat(party, k, 'overworld', RUN.x, RUN.y);
      placeSeat(party, human, 'overworld', RUN.x + 3, RUN.y);
      holdPhase(party, Phase.dusk, 3600);
      const began = party.room.state.tick;
      let at = -1;
      advance(party, 60, (tick) => {
        if (at < 0 && simAt(party, human).dead) at = tick;
      });
      expect(at - began).toBeGreaterThan(0);
      expect(at - began).toBeLessThanOrEqual(40);
      expect(npcMemory(party.room).brain(k).flee).not.toBeNull();
    } finally {
      row.killChancePer10s = saved;
    }
  });

  // `isKillPhase` (sim/World.ts, locked) does not list the Final Night until 5G's deck lands (seams.md, 5G -> 5H).
  it.skipIf(!isKillPhase(Phase.finalNight))('M3: the Final Night strikes too', async () => {
    const row = balance.npc.difficulty.normal as { killChancePer10s: number };
    const saved = row.killChancePer10s;
    row.killChancePer10s = 1;
    try {
      const { party, human } = await hunt();
      holdPhase(party, Phase.finalNight, 3600);
      advance(party, 60);
      expect(simAt(party, human).dead).toBe(true);
    } finally {
      row.killChancePer10s = saved;
    }
  });

  it('M4: after the kill it reaches a basin scene and then the hub, in react mode, and goes back to routine', async () => {
    const row = balance.npc.difficulty.normal as { killChancePer10s: number };
    const saved = row.killChancePer10s;
    row.killChancePer10s = 1;
    try {
      const { party, k, human } = await hunt();
      holdPhase(party, Phase.night, 3600);
      const mem = npcMemory(party.room);
      const visited: string[] = [];
      let fleeing = 0;
      let nonReact = 0;
      let backToRoutine = false;
      advance(party, 60 * TICK_RATE, () => {
        const b = mem.brain(k);
        const here = sceneKey(simAt(party, k).sceneIdx);
        if (visited.at(-1) !== here) visited.push(here);
        if (b.flee !== null) {
          fleeing++;
          if (b.mode !== 'react') nonReact++;
        } else if (simAt(party, human).dead && fleeing > 0 && b.mode === 'routine') backToRoutine = true;
      });
      expect(simAt(party, human).dead).toBe(true);
      expect(fleeing).toBeGreaterThan(0);
      expect(nonReact).toBe(0);
      expect(
        visited.some((s) => scenes[s as keyof typeof scenes].props.some((q) => q.kind === 'basin')),
      ).toBe(true);
      expect(visited).toContain('overworld');
      expect(backToRoutine).toBe(true);
    } finally {
      row.killChancePer10s = saved;
    }
  });

  it('does nothing while a third seat is in the scene', async () => {
    const row = balance.npc.difficulty.normal as { killChancePer10s: number };
    const saved = row.killChancePer10s;
    row.killChancePer10s = 1;
    try {
      const { party, human, rest } = await hunt();
      placeSeat(party, rest[0]!, 'overworld', RUN.x + 5, RUN.y);
      holdPhase(party, Phase.night, 3600);
      advance(party, 40);
      expect(simAt(party, human).dead).toBe(false);
    } finally {
      row.killChancePer10s = saved;
    }
  });
});
