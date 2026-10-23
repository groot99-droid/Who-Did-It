import type { ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { balance } from '@wdi/content';
import { Phase, type SimEventWire, TICK_RATE, TILE_PX, VIEW_TAG } from '@wdi/shared';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { enableAuto, queueAutoStart } from '../src/sim/auto/Auto';
import { guardStep, registeredInvariants, runInvariants } from '../src/sim/auto/invariants';
import { npcMemory } from '../src/sim/npc/memory';
import { simOf } from '../src/sim/RoomSim';
import { isWorldPhase } from '../src/sim/World';
import { logHash, logLine, matchEvents } from '../src/sim/auto/log';
import { ANY_SIM, type SimEvent, emitSim, onSim, pendingSim, runEvents } from '../src/sim/events/bus';
import { handleKill } from '../src/sim/Kill';
import { AUTO_STREAMS, bootAutoServer, captureMatchLog, runAutoMatch } from './autoHelpers';
import { handleOf, settle } from './avatarHelpers';
import { readyKnife, teleport } from './killHelpers';
import { idOf, murder, until } from './flowHelpers';
import { advance, pauseClock } from './npcHelpers';
import { toNight } from './phaseHelpers';
import { type Match, sleep, startMatch } from './simHelpers';

// Round 6, 6B (docs/round6/auto-admin.md 5): the sim event bus, the match log, and the invariant registry.

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  process.env.WDI_DEBUG = '1';
  colyseus = await bootAutoServer();
});
afterAll(async () => {
  delete process.env.WDI_DEBUG;
  await colyseus.shutdown();
});
beforeEach(async () => colyseus.cleanup());

/** A clientless room off its clock: it steps only through `advance`. */
async function quietRoom(): Promise<PartyRoom> {
  const room = (await colyseus.createRoom('party', {})) as unknown as PartyRoom;
  pauseClock(room);
  return room;
}

const words = (n: number) => [n, n + 1, n + 2, n + 3] as [number, number, number, number];
const fixedSeeds = Object.fromEntries(AUTO_STREAMS.map((s, i) => [s, words(i * 4 + 1)]));
const fixedIds = Array.from({ length: 6 }, (_, i) => `bus${i}`);
const hashOf = (events: SimEventWire[]) => events.map(logLine).join('\n');

describe('the sim event bus', () => {
  it('delivers each event once, in emission order, by kind and to ANY_SIM, after the phases', async () => {
    const room = await quietRoom();
    const party = { humans: [], room };
    advance(party, 1);
    const heard: string[] = [];
    onSim(room, 'vote', (e) => heard.push(`vote:${e.seat}`));
    onSim(room, ANY_SIM, (e) => heard.push(`any:${e.kind}`));
    emitSim(room, { tick: room.state.tick, kind: 'vote', seat: 'a' });
    emitSim(room, { tick: room.state.tick, kind: 'clue', sceneId: 'hm.square' });
    expect(pendingSim(room)).toHaveLength(2);
    advance(party, 1);
    expect(heard).toEqual(['vote:a', 'any:vote', 'any:clue']);
    expect(pendingSim(room)).toHaveLength(0);
    advance(party, 3);
    expect(heard).toHaveLength(3);
  });

  it('holds an event a listener emits for the next tick', async () => {
    const room = await quietRoom();
    const party = { humans: [], room };
    advance(party, 1);
    const ticks: number[] = [];
    onSim(room, 'meeting', (e, r) => emitSim(r, { tick: r.state.tick, kind: 'vote', seat: e.seat ?? '' }));
    onSim(room, 'vote', () => ticks.push(room.state.tick));
    emitSim(room, { tick: room.state.tick, kind: 'meeting', seat: 'a' });
    runEvents(room);
    expect(ticks).toEqual([]);
    expect(pendingSim(room).map((e) => e.kind)).toEqual(['vote']);
    advance(party, 1);
    expect(ticks).toEqual([room.state.tick]);
  });

  it('logs a knife kill as kill, death and the two kill clues on the same tick, by seat id', async () => {
    const m = await startMatch(colyseus, 3, { Bot0: 'killer', Bot1: 'townsfolk' });
    const [k, v] = [m.bots[0]!, m.bots[1]!];
    toNight(m);
    readyKnife(m, k);
    teleport(m, k, 'overworld', 30, 22);
    teleport(m, v, 'overworld', 31, 22);
    settle(m, k, v);
    const seen: SimEvent[] = [];
    onSim(m.room, ANY_SIM, (e) => seen.push(e));
    const tick = m.room.state.tick;
    handleKill(m.room, k.id, { abilityId: 'kill', targetId: handleOf(m, v) });
    runEvents(m.room);
    const kinds = seen.filter((e) => e.kind !== 'phase').map((e) => e.kind); // `toNight` is white-box
    expect(kinds).toEqual(['kill', 'death', 'clue', 'clue']);
    expect(seen.every((e) => e.tick === tick)).toBe(true);
    const [kill, death] = seen.filter((e) => e.kind !== 'phase');
    expect(kill).toMatchObject({ seat: v.id, sceneId: 'overworld', data: { by: k.id } });
    expect(death).toMatchObject({ seat: v.id, data: { cause: 'knife', by: k.id } });
    expect(
      matchEvents(m.room)
        .filter((e) => e.kind !== 'phase')
        .slice(-4)
        .map((e) => e.kind),
    ).toEqual(kinds);
  });

  it('a main auto match logs start, phases, votes and end by seat id, and replays to the same hash', async () => {
    const lines: string[] = [];
    captureMatchLog((line) => lines.push(line));
    const run = () =>
      runAutoMatch(colyseus, {
        map: 'hollowmere',
        seats: 6,
        difficulty: 'normal',
        seeds: fixedSeeds,
        npcIds: fixedIds,
      });
    const a = await run();
    const b = await run();
    const kinds = new Set(a.events.map((e) => e.kind));
    for (const kind of ['start', 'phase', 'meeting', 'vote', 'end']) expect(kinds).toContain(kind);
    expect(a.events[0]?.kind).toBe('start');
    expect(a.events.at(-1)?.kind).toBe('end');
    const seats = new Set(fixedIds);
    for (const e of a.events) if (e.seat) expect(seats).toContain(e.seat);
    expect(a.events.length).toBeGreaterThan(0);
    expect(hashOf(a.events)).toBe(hashOf(b.events));

    const autoLines = lines.map((l) => JSON.parse(l)).filter((r) => r.event === 'auto');
    expect(autoLines).toHaveLength(2);
    expect(autoLines[0]).toMatchObject({ map: 'hollowmere', seats: 6, npcIds: fixedIds });
    expect(autoLines[0].logHash).toBe(autoLines[1].logHash);
    expect(autoLines[0].kinds.end).toBe(1);
  }, 60_000);

  it('keeps the log of the current match only, and hashes it', async () => {
    const room = await quietRoom();
    const party = { humans: [], room };
    advance(party, 1);
    emitSim(room, { tick: 1, kind: 'clue', sceneId: 'x' });
    advance(party, 1);
    const before = logHash(room);
    emitSim(room, { tick: 2, kind: 'start' });
    advance(party, 1);
    expect(matchEvents(room).map((e) => e.kind)).toEqual(['start']);
    expect(logHash(room)).not.toBe(before);
  });
});

const failing = (room: PartyRoom): string[] => runInvariants(room).map((f) => f.name);

/** An all-NPC room off its clock, advanced into its first day with every seat placed. */
async function autoDay(): Promise<PartyRoom> {
  const room = await quietRoom();
  const party = { humans: [], room };
  enableAuto(room, {
    map: 'hollowmere',
    seats: 6,
    difficulty: 'normal',
    seeds: fixedSeeds,
    npcIds: fixedIds,
  });
  queueAutoStart(room);
  const sim = simOf(room);
  const ready = () => room.state.phase === Phase.day && [...sim.players.values()].every((p) => p.placed);
  for (let i = 0; i < 400 * TICK_RATE && !ready(); i++) advance(party, 1);
  if (!ready()) throw new Error('autoDay: no placed day');
  return room;
}

const viewOf = (m: Match, i: number) => {
  const view = m.room.clients.getById(idOf(m, i))?.view;
  if (!view) throw new Error('no view');
  return view;
};
const avatarsOf = (m: Match) => [...m.room.state.scenes.values()].flatMap((s) => [...s.avatars.values()]);

describe('the round-6 invariants', () => {
  it('registers the seven checks of auto-admin.md 5', () => {
    expect(registeredInvariants()).toEqual([
      'privLeak',
      'seatLeak',
      'npcStuck',
      'phaseOverrun',
      'step',
      'matchLength',
      'killClues',
    ]);
  });

  it("privLeak and seatLeak stay quiet through visibility.test.ts's ghost case and fire on a constructed leak", async () => {
    const m = await startMatch(colyseus, 5);
    await sleep(300);
    expect(failing(m.room)).toEqual([]);
    // A ghost receives every seat of its scene (A30, GDD 3.17); the living never do.
    murder(m, 3);
    const ghostHolds = () => avatarsOf(m).some((a) => viewOf(m, 3).hasTag(a, VIEW_TAG.ghost));
    expect(await until(ghostHolds)).toBe(true);
    expect(failing(m.room)).toEqual([]);

    const [avatar] = avatarsOf(m);
    viewOf(m, 0).add(avatar!, VIEW_TAG.ghost);
    expect(failing(m.room)).toEqual(['seatLeak']);
    viewOf(m, 0).remove(avatar!, VIEW_TAG.ghost);
    expect(failing(m.room)).toEqual([]);

    viewOf(m, 1).add(m.room.state.players.get(idOf(m, 2))!, VIEW_TAG.priv);
    const [leak] = runInvariants(m.room);
    expect(leak).toMatchObject({ name: 'privLeak', tick: m.room.state.tick });
    expect(leak?.detail).toContain(idOf(m, 2));
  }, 20_000);

  it('npcStuck fires once on an NPC held off its goal for longer than npc.stuckInvariantS', async () => {
    const room = await autoDay();
    const party = { humans: [], room };
    const sim = simOf(room);
    const [id, brain] = [...npcMemory(room).brains].find(([sid]) => sim.players.get(sid)?.placed)!;
    const p = sim.players.get(id)!;
    const hold = { x: p.x, y: p.y, scene: p.sceneIdx };
    const goal = { scene: p.sceneIdx, x: p.x + 6 * TILE_PX, y: p.y };
    const pin = () => {
      brain.act = { kind: 'travel', untilTick: room.state.tick + 9999, stationId: '', goal };
      Object.assign(p, { x: hold.x, y: hold.y });
      room.state.phaseEndsTick = room.state.tick + 9999;
    };
    const limit = balance.npc.stuckInvariantS * TICK_RATE;
    const names: string[] = [];
    for (let t = 0; t < limit + 3 * TICK_RATE; t++) {
      pin();
      advance(party, 1);
      pin();
      if (room.state.tick % 20 === 0) names.push(...failing(room));
    }
    expect(isWorldPhase(room.state.phase)).toBe(true);
    expect(names).toEqual(['npcStuck']);
  });

  it('phaseOverrun fires on a phase past its end tick and not on time', async () => {
    const room = await autoDay();
    expect(failing(room)).toEqual([]);
    room.state.phaseEndsTick = room.state.tick - 1;
    expect(failing(room)).toEqual([]);
    room.state.phaseEndsTick = room.state.tick - 2;
    expect(failing(room)).toEqual(['phaseOverrun']);
  });

  it('step reports an exception caught by guardStep once', async () => {
    const room = await quietRoom();
    expect(guardStep(room, () => undefined)).toBe(true);
    expect(failing(room)).toEqual([]);
    expect(
      guardStep(room, () => {
        throw new Error('boom');
      }),
    ).toBe(false);
    const [f] = runInvariants(room);
    expect(f).toMatchObject({ name: 'step', tick: room.state.tick });
    expect(f?.detail).toContain('boom');
    expect(failing(room)).toEqual([]);
  });

  it('matchLength fires past the Final Night round', async () => {
    const main = await autoDay();
    main.state.round = balance.finalNight.afterCycle + 1;
    expect(failing(main)).toEqual([]);
    main.state.round++;
    expect(failing(main)).toEqual(['matchLength']);
  });

  it('killClues fires once on a kill that left no clue in its scene, and not on a knife kill', async () => {
    const room = await autoDay();
    const party = { humans: [], room };
    const t = room.state.tick;
    emitSim(room, {
      tick: t,
      kind: 'kill',
      seat: 'bus1',
      sceneId: 'overworld',
      data: { by: 'bus0' },
    });
    emitSim(room, { tick: t, kind: 'clue', sceneId: 'tavern_bar', data: { id: 'c', kind: 0 } });
    advance(party, 1);
    const [f] = runInvariants(room);
    expect(f).toMatchObject({ name: 'killClues' });
    expect(f?.detail).toContain('bus1');
    expect(failing(room)).toEqual([]);
    emitSim(room, { tick: t + 1, kind: 'kill', seat: 'bus2', sceneId: 'overworld' });
    emitSim(room, { tick: t + 1, kind: 'clue', sceneId: 'overworld', data: { id: 'd', kind: 0 } });
    advance(party, 1);
    expect(failing(room)).toEqual([]);
  });
});
