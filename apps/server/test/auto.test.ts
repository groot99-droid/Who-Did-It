import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ColyseusTestServer } from '@colyseus/testing';
import { boot } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { GameMode, NpcLevel, Phase, TICK_RATE } from '@wdi/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { createServer } from '../src/server';
import { isNpcSeat } from '../src/sim/Npc';
import { simOf } from '../src/sim/RoomSim';
import { applyClock, autoOf, enableAuto, queueAutoStart } from '../src/sim/auto/Auto';
import { preyFor } from '../src/sim/npc/world';
import { runAutoMatch } from './autoHelpers';
import { BUILD_VERSION } from '@wdi/shared';
import { sleep } from './simHelpers';
import { advance } from './npcHelpers';
import {
  EFFECTIVE_SCALE_TICKS,
  MAX_SIM_MS_PER_TICK,
  type SimClock,
  clockOf,
  effectiveScale,
  stepsThisTick,
} from '../src/sim/auto/clock';

const clock = (over: Partial<SimClock> = {}): SimClock => ({
  scale: 1,
  paused: false,
  pendingSteps: 0,
  carry: 0,
  ...over,
});

describe('the sim clock (GDD 3.19)', () => {
  it('runs one step at 1x whatever the last tick cost, and never touches the carry', () => {
    const c = clock({ carry: 3 });
    for (const ms of [0, 1, 39, 40, 200]) expect(stepsThisTick(c, ms)).toBe(1);
    expect(c.carry).toBe(3);
    expect(effectiveScale(c)).toBe(5 / EFFECTIVE_SCALE_TICKS);
  });

  it('runs `scale` steps when the budget allows', () => {
    for (const scale of [2, 5, 10] as const) {
      const c = clock({ scale });
      expect(stepsThisTick(c, 1)).toBe(scale);
      expect(c.carry).toBe(0);
    }
  });

  it('caps a slow tick at the budget, carries the rest and drops the effective scale; nothing is skipped', () => {
    const c = clock({ scale: 10 });
    const perStep = MAX_SIM_MS_PER_TICK / 4; // four steps fit in the budget
    let ran = 0;
    for (let i = 0; i < EFFECTIVE_SCALE_TICKS; i++) ran += stepsThisTick(c, perStep);
    expect(ran).toBe(4 * EFFECTIVE_SCALE_TICKS);
    expect(c.carry).toBe(6 * EFFECTIVE_SCALE_TICKS);
    expect(effectiveScale(c)).toBe(4);
    // The sim speeds up again: the carry drains on top of the scale until it is gone.
    let drained = 0;
    while (c.carry > 0) drained += stepsThisTick(c, 0.01) - 10;
    expect(drained).toBe(6 * EFFECTIVE_SCALE_TICKS);
  });

  it('still runs one step when a single step costs more than the budget', () => {
    const c = clock({ scale: 5 });
    expect(stepsThisTick(c, MAX_SIM_MS_PER_TICK * 3)).toBe(1);
    expect(c.carry).toBe(4);
  });

  it('runs only the pending single steps while paused, and clears them', () => {
    const c = clock({ scale: 10, paused: true, pendingSteps: 3 });
    expect(stepsThisTick(c, 1)).toBe(3);
    expect(c.pendingSteps).toBe(0);
    expect(stepsThisTick(c, 1)).toBe(0);
    expect(c.carry).toBe(0);
  });

  it('runs one step while paused when commands are queued and none is pending', () => {
    const c = clock({ scale: 10, paused: true });
    expect(stepsThisTick(c, 1, 0)).toBe(0);
    expect(stepsThisTick(c, 1, 2)).toBe(1);
    expect(c.paused).toBe(true);
    c.pendingSteps = 3;
    expect(stepsThisTick(c, 1, 2)).toBe(3);
  });

  it('is written only under sim/auto/: everything else only reads it through stepsThisTick', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.ts')) files.push(path);
      }
    };
    walk(fileURLToPath(new URL('../src', import.meta.url)));
    const uses = files
      .filter((path) => !path.includes(join('src', 'sim', 'auto')))
      .flatMap((path) =>
        readFileSync(path, 'utf8')
          .split('\n')
          .filter((line) => /clockOf\(/.test(line) && !line.trim().startsWith('*'))
          .filter((line) => !/(stepsThisTick|effectiveScale)\(clockOf\(/.test(line))
          .map((line) => `${path.slice(path.indexOf('src'))}: ${line.trim()}`),
      );
    expect(uses).toEqual([]);
  });
});

describe('the all-NPC match (GDD 3.19)', () => {
  let colyseus: ColyseusTestServer;
  beforeAll(async () => {
    colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
  });
  afterAll(async () => colyseus.shutdown());

  const oneDay = Math.ceil(
    (balance.phases.roleRevealS + balance.phases.graceS + balance.phases.dayS) * TICK_RATE,
  );
  const create = async () => (await colyseus.createRoom('party', {})) as unknown as PartyRoom;

  it('seats every NPC under the given ids, with no leader and the settings applied', async () => {
    const room = await create();
    const npcIds = ['autonpc01', 'autonpc02', 'autonpc03', 'autonpc04', 'autonpc05'];
    enableAuto(room, { map: 'blackpine', mode: 'onub', seats: 5, difficulty: 'hard', npcIds });
    expect([...room.state.players.keys()]).toEqual(npcIds);
    expect(npcIds.every((id) => isNpcSeat(room, id))).toBe(true);
    expect(room.state.leaderId).toBe('');
    expect(room.state.settings.map).toBe('blackpine');
    expect(room.state.settings.mode).toBe(GameMode.onub);
    expect(room.state.settings.npcDifficulty).toBe(NpcLevel.hard);
    // Every stream is fixed, so the record replays the whole match.
    expect(Object.keys(autoOf(room)?.options.seeds ?? {})).toContain('npcPlay');
    expect(room.fixedSeeds).toBe(autoOf(room)?.options.seeds);
    expect(() => enableAuto(room, { map: 'atlantis', mode: 'main', seats: 5, difficulty: 'easy' })).toThrow();
    await room.disconnect();
  });

  it('starts inside the step with no human and no lobby.start', async () => {
    const room = await create();
    enableAuto(room, { map: 'hollowmere', mode: 'main', seats: 6, difficulty: 'normal' });
    applyClock(room, { paused: true });
    queueAutoStart(room);
    expect(room.state.phase).toBe(Phase.lobby);
    advance({ humans: [], room }, 1);
    expect(room.state.phase).toBe(Phase.roleReveal);
    expect(autoOf(room)?.started).toBe(true);
    await room.disconnect();
  });

  it('resets to the lobby with the same seats and the clock paused', async () => {
    const room = await create();
    enableAuto(room, { map: 'hollowmere', mode: 'main', seats: 6, difficulty: 'normal' });
    const ids = [...room.state.players.keys()];
    queueAutoStart(room);
    advance({ humans: [], room }, 2);
    autoOf(room)?.commands.push({ kind: 'reset' });
    advance({ humans: [], room }, 1);
    expect(room.state.phase).toBe(Phase.lobby);
    expect([...room.state.players.keys()]).toEqual(ids);
    expect(clockOf(room).paused).toBe(true);
    await room.disconnect();
  });

  it('applies clock commands inside the step', async () => {
    const room = await create();
    enableAuto(room, { map: 'hollowmere', mode: 'main', seats: 4, difficulty: 'normal' });
    autoOf(room)?.commands.push({ kind: 'clock', scale: 10 }, { kind: 'clock', scale: 3 as never });
    expect(clockOf(room).scale).toBe(1);
    advance({ humans: [], room }, 1);
    expect(clockOf(room).scale).toBe(10);
    await room.disconnect();
  });

  it('lets an NPC Killer take an NPC as prey only under auto.npcPrey', async () => {
    const room = await create();
    enableAuto(room, { map: 'hollowmere', mode: 'main', seats: 4, difficulty: 'normal' });
    queueAutoStart(room);
    advance({ humans: [], room }, 1);
    const sim = simOf(room);
    const [a, b] = [...room.state.players.values()];
    if (!a || !b) throw new Error('no seats');
    for (const p of sim.players.values()) p.placed = false;
    const pa = sim.ensure(a.id);
    const pb = sim.ensure(b.id);
    pa.placed = pb.placed = true;
    pa.sceneIdx = pb.sceneIdx = 0;
    const isNpc = (id: string) => isNpcSeat(room, id);
    expect(preyFor(room, a, pa, isNpc)).toBe(b.id);
    (autoOf(room) as { npcPrey: boolean }).npcPrey = false;
    expect(preyFor(room, a, pa, isNpc)).toBeNull();
    sim.auto = null;
    expect(preyFor(room, a, pa, isNpc)).toBeNull();
    await room.disconnect();
  });

  for (const mode of ['main', 'onub'] as const) {
    it(`plays one day of a ${mode} match on Hollowmere with six NPC seats`, async () => {
      const r = await runAutoMatch(colyseus, {
        map: 'hollowmere',
        mode,
        seats: 6,
        difficulty: 'normal',
        maxTicks: oneDay,
      });
      expect(r.failures).toEqual([]);
      expect(r.ticks).toBeGreaterThan(0);
      expect(r.npcIds).toHaveLength(6);
    }, 60_000);
  }

  it('replays the same match from the same seeds and seat ids', async () => {
    const opts = { map: 'hollowmere', mode: 'main', seats: 6, difficulty: 'hard', maxTicks: oneDay } as const;
    const a = await runAutoMatch(colyseus, opts);
    const b = await runAutoMatch(colyseus, { ...opts, seeds: a.seeds, npcIds: a.npcIds });
    const c = await runAutoMatch(colyseus, opts);
    expect(b.digest).toBe(a.digest);
    expect(b.ticks).toBe(a.ticks);
    expect(c.digest).not.toBe(a.digest);
  }, 60_000);

  it('disposes an auto room no client ever joined', async () => {
    const room = await create();
    const id = room.roomId;
    enableAuto(room, { map: 'hollowmere', mode: 'main', seats: 4, difficulty: 'normal' });
    // The seat-reservation timer Colyseus arms after onCreate, shortened: an empty room goes when it fires.
    (room as unknown as { resetAutoDisposeTimeout(s: number): void }).resetAutoDisposeTimeout(0.05);
    await sleep(300);
    expect(colyseus.getRoomById(id)).toBeUndefined();
  });

  it('keeps a party room at one step per tick', async () => {
    const human = await colyseus.sdk.create('party', {
      name: 'Solo',
      build: BUILD_VERSION,
      deviceId: 'dev-solo',
    });
    const room = colyseus.getRoomById(human.roomId) as unknown as PartyRoom;
    await sleep(1500);
    const clock = clockOf(room);
    expect(autoOf(room)).toBeNull();
    expect(clock).toMatchObject({ scale: 1, paused: false, carry: 0, pendingSteps: 0 });
    expect(effectiveScale(clock)).toBe(1);
    await human.leave();
  });
});
