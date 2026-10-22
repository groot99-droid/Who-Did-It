import type { ColyseusTestServer } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SimEventWire } from '@wdi/shared';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { logHash, logLine, matchEvents } from '../src/sim/auto/log';
import { ANY_SIM, type SimEvent, emitSim, onSim, pendingSim, runEvents } from '../src/sim/events/bus';
import { handleKill } from '../src/sim/Kill';
import { AUTO_STREAMS, bootAutoServer, captureMatchLog, runAutoMatch } from './autoHelpers';
import { handleOf, settle } from './avatarHelpers';
import { readyKnife, teleport } from './killHelpers';
import { advance, pauseClock } from './npcHelpers';
import { toNight } from './phaseHelpers';
import { startMatch } from './simHelpers';

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

  it.each(['main', 'onub'] as const)(
    'a %s auto match logs start, phases, votes and end by seat id, and replays to the same hash',
    async (mode) => {
      const lines: string[] = [];
      captureMatchLog((line) => lines.push(line));
      const run = () =>
        runAutoMatch(colyseus, {
          map: 'hollowmere',
          mode,
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
      expect(autoLines[0]).toMatchObject({ mode, map: 'hollowmere', seats: 6, npcIds: fixedIds });
      expect(autoLines[0].logHash).toBe(autoLines[1].logHash);
      expect(autoLines[0].kinds.end).toBe(1);
    },
    60_000,
  );

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
