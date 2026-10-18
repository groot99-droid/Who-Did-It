import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { balance, navs } from '@wdi/content';
import { NavGrid, TICK_RATE, TILE_PX, overlapsSolid } from '@wdi/shared';
import { createServer } from '../src/server';
import { FOOT_HALF_PX, POSITION_RING_TICKS } from '../src/sim/constants';
import { parseMove, speedPxPerTick } from '../src/sim/Movement';
import { simOf } from '../src/sim/RoomSim';
import { type Match, move, sleep, startMatch } from './simHelpers';

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  process.env.WDI_DEBUG = '1';
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => {
  delete process.env.WDI_DEBUG;
  await colyseus.shutdown();
});
beforeEach(async () => colyseus.cleanup());

describe('input parsing and the speed table', () => {
  it('normalises the vector server-side and rejects junk', () => {
    const diag = parseMove({ seq: 1, dx: 5, dy: 5, sprint: false, sneak: false }, 0);
    expect(Math.hypot(diag?.dx ?? 0, diag?.dy ?? 0)).toBeCloseTo(1);
    expect(parseMove({ seq: 1, dx: 0.0001, dy: 0 }, 0)).toMatchObject({ dx: 0, dy: 0 });
    expect(parseMove({ seq: 1, dx: Infinity, dy: 0 }, 0)).toBeNull();
    expect(parseMove({ seq: 'x', dx: 1, dy: 0 }, 0)).toBeNull();
    expect(parseMove(null, 0)).toBeNull();
  });

  it('takes walk, run and sneak speeds from balance.json, sneak winning over sprint', () => {
    const px = (t: number) => (t * TILE_PX) / TICK_RATE;
    expect(speedPxPerTick(false, false)).toBeCloseTo(px(balance.movement.walkTilesPerS));
    expect(speedPxPerTick(true, false)).toBeCloseTo(px(balance.movement.runTilesPerS));
    expect(speedPxPerTick(false, true)).toBeCloseTo(
      px(balance.movement.walkTilesPerS * balance.movement.sneakFactor),
    );
    expect(speedPxPerTick(true, true)).toBe(speedPxPerTick(false, true));
  });
});

describe('server movement', () => {
  let match: Match;
  beforeEach(async () => {
    match = await startMatch(colyseus, 4);
  });

  it('places everyone on a square spawn and publishes int16 pixel positions', () => {
    for (const bot of match.bots) {
      const player = match.room.state.players.get(bot.id);
      expect(player?.priv.sceneId).toBe(0);
      expect(player?.alive).toBe(true);
      expect(Number.isInteger(player?.presence.x)).toBe(true);
      expect(player?.presence.x).toBeGreaterThan(0);
    }
  });

  it('caps speed at the run speed whatever the client sends', async () => {
    const bot = match.bots[0]!;
    const p = simOf(match.room).players.get(bot.id)!;
    const t0 = match.room.state.tick;
    const from = { x: p.x, y: p.y };
    // Flood: a huge vector, sprint, many messages per tick. Only the newest per tick is applied.
    for (let i = 0; i < 20; i++) {
      move(bot, 0, 1e9, true);
      await sleep(25);
    }
    const ticks = match.room.state.tick - t0;
    const dist = Math.hypot(p.x - from.x, p.y - from.y);
    expect(dist).toBeLessThanOrEqual(speedPxPerTick(true, false) * ticks + 1e-6);
  });

  it('walks slower than it runs and slower still when sneaking', async () => {
    const dists: number[] = [];
    for (const [i, mode] of [
      [0, { sprint: false, sneak: false }],
      [1, { sprint: true, sneak: false }],
      [2, { sprint: false, sneak: true }],
    ] as const) {
      const bot = match.bots[i]!;
      const p = simOf(match.room).players.get(bot.id)!;
      const from = p.y;
      // Face the open lane south of the square so no wall interferes.
      for (let k = 0; k < 12; k++) {
        move(bot, 0, 1, mode.sprint, mode.sneak);
        await sleep(50);
      }
      dists.push(Math.abs(p.y - from));
    }
    const [walk, run, sneak] = dists as [number, number, number];
    expect(run).toBeGreaterThan(walk * 1.2);
    expect(sneak).toBeLessThan(walk * 0.85);
  });

  it('never lets a bot into a wall, however long it pushes', async () => {
    const grid = new NavGrid(navs.overworld, simOf(match.room).profile);
    const bot = match.bots[0]!;
    const p = simOf(match.room).players.get(bot.id)!;
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
      [1, 1],
      [-1, -1],
    ] as const) {
      for (let k = 0; k < 50; k++) {
        move(bot, dx, dy, true);
        await sleep(50);
        expect(overlapsSolid(grid, p.x, p.y, FOOT_HALF_PX, FOOT_HALF_PX)).toBe(false);
      }
    }
  }, 30000);

  it('keeps 250 ms of position history per player', async () => {
    const bot = match.bots[0]!;
    const p = simOf(match.room).players.get(bot.id)!;
    for (let k = 0; k < 10; k++) {
      move(bot, 0, 1);
      await sleep(50);
    }
    expect(POSITION_RING_TICKS).toBe(5);
    expect(p.historyLength).toBe(POSITION_RING_TICKS + 1);
    const now = p.positionAt(0)!;
    const before = p.positionAt(POSITION_RING_TICKS)!;
    expect(Math.hypot(now.x - before.x, now.y - before.y)).toBeGreaterThan(0);
    expect(p.positionAt(99)).toEqual(before);
  });

  it('stops a player whose client goes quiet, and ignores stale sequence numbers', async () => {
    const bot = match.bots[0]!;
    const p = simOf(match.room).players.get(bot.id)!;
    move(bot, 0, 1);
    await sleep(100);
    bot.room.send('input.move', { seq: 0, dx: 0, dy: -1, sprint: false, sneak: false });
    await sleep(100);
    expect(p.input?.dy).toBe(1);
    await sleep(500);
    const y = p.y;
    await sleep(300);
    expect(p.y).toBe(y);
  });
});
