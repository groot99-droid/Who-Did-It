import { ColyseusTestServer, boot } from '@colyseus/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type SceneId, abilities, navs } from '@wdi/content';
import { ErrorCode, NavGrid, TILE_PX } from '@wdi/shared';
import { createServer } from '../src/server';
import { nightOf } from '../src/sim/nightMemory';
import { simOf } from '../src/sim/RoomSim';
import { applyEffect } from '../src/sim/body/effects';
import { bodyOf } from '../src/sim/body/state';
import { handleOf as h } from './avatarHelpers';
import { act, errorCodes, readyKnife, simOfBot, teleport, tilePx } from './killHelpers';
import { toNight } from './phaseHelpers';
import { type Match, startMatch } from './simHelpers';

// Round 10, x10 (A393): a voided strike (a Bandage, a Watch, a Remedy) knocks both back along the strike's line
// (GDD 3.2); the Charm leaves Wounded and parts nobody.

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  process.env.WDI_DEBUG = '1'; // `debug.play` starts the match (killHelpers, as kill.test.ts)
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => {
  delete process.env.WDI_DEBUG;
  await colyseus.shutdown();
});
beforeEach(async () => colyseus.cleanup());

const SCENE: SceneId = 'overworld';
const TILES = abilities.abilities.bandage!.params!.knockbackTiles!;

async function party(): Promise<Match> {
  const m = await startMatch(colyseus, 5, {
    Bot0: 'killer',
    Bot1: 'townsfolk',
    Bot2: 'detective',
    Bot3: 'doctor',
  });
  toNight(m);
  readyKnife(m, m.bots[0]!);
  for (const i of [2, 3, 4]) teleport(m, m.bots[i]!, SCENE, 36 + i, 18);
  return m;
}

/** The first tile row with `open` free tiles in a run followed by a solid one (`wall` true) or by another free tile. */
function run(m: Match, open: number, wall: boolean): { x: number; y: number } {
  const grid = new NavGrid(navs[SCENE], simOf(m.room).profile);
  for (let y = 1; y < grid.h - 1; y++)
    for (let x = 1; x + open < grid.w; x++) {
      let ok = true;
      for (let i = 0; i < open && ok; i++) ok = !grid.solidAt(x + i, y);
      if (ok && grid.solidAt(x + open, y) === wall) return { x, y };
    }
  throw new Error(`no run of ${open} in ${SCENE}`);
}

type Guard = 'bandage' | 'watch' | 'charm';

/** Guards the victim, strikes it from one tile west, and expects the strike voided. */
async function guardedStrike(m: Match, kx: number, y: number, guard: Guard = 'bandage'): Promise<void> {
  const [k, v] = [m.bots[0]!, m.bots[1]!];
  teleport(m, k, SCENE, kx, y);
  teleport(m, v, SCENE, kx + 1, y);
  if (guard === 'bandage') simOfBot(m, v).bandagedUntilTick = m.room.state.tick + 1000;
  if (guard === 'watch') nightOf(m.room).watch.set(v.id, m.bots[2]!.id); // the Detective keeps watch, white-box
  if (guard === 'charm') applyEffect(m.room, v.id, bodyOf(m.room, v.id)!, 'charm');
  await act(k, 'act.ability', { abilityId: 'kill', targetId: h(m, v) });
  expect(errorCodes(k)).toEqual([ErrorCode.cannot]);
  expect(simOfBot(m, v).dead).toBe(false);
}

describe('the Bandage knockback', () => {
  it('pushes the target on and the attacker back, a tile each along the strike', async () => {
    const m = await party();
    expect(TILES).toBeGreaterThan(0);
    const { x, y } = run(m, 2 + 2 * TILES, false); // attacker, target and a tile for each push, then more floor
    await guardedStrike(m, x + TILES, y);
    const [k, v] = [simOfBot(m, m.bots[0]!), simOfBot(m, m.bots[1]!)];
    expect([v.x, v.y]).toEqual([tilePx(x + 2 * TILES + 1), tilePx(y)]);
    expect([k.x, k.y]).toEqual([tilePx(x), tilePx(y)]);
  });

  it('stops the target at a wall and still sends the attacker back', async () => {
    const m = await party();
    const { x, y } = run(m, 1 + 2 * TILES, true); // the target stands against the wall at the run's end
    const tx = x + 2 * TILES;
    await guardedStrike(m, tx - 1, y);
    const [k, v] = [simOfBot(m, m.bots[0]!), simOfBot(m, m.bots[1]!)];
    expect(Math.floor(v.x / TILE_PX)).toBe(tx);
    expect(v.x).toBeGreaterThanOrEqual(tilePx(tx));
    expect(v.y).toBe(tilePx(y));
    expect([k.x, k.y]).toEqual([tilePx(tx - 1 - TILES), tilePx(y)]);
  });

  it('parts the pair the same when a Watch voids the strike, so the push does not say which guard held', async () => {
    const m = await party();
    const { x, y } = run(m, 2 + 2 * TILES, false);
    await guardedStrike(m, x + TILES, y, 'watch');
    const [k, v] = [simOfBot(m, m.bots[0]!), simOfBot(m, m.bots[1]!)];
    expect([v.x, v.y]).toEqual([tilePx(x + 2 * TILES + 1), tilePx(y)]);
    expect([k.x, k.y]).toEqual([tilePx(x), tilePx(y)]);
  });

  it('leaves both where they stand when a Charm takes the strike: Wounded is not a void', async () => {
    const m = await party();
    const { x, y } = run(m, 2 + 2 * TILES, false);
    await guardedStrike(m, x + TILES, y, 'charm');
    const [k, v] = [simOfBot(m, m.bots[0]!), simOfBot(m, m.bots[1]!)];
    expect([v.x, v.y]).toEqual([tilePx(x + TILES + 1), tilePx(y)]);
    expect([k.x, k.y]).toEqual([tilePx(x + TILES), tilePx(y)]);
    expect(bodyOf(m.room, m.bots[1]!.id)?.hp).toBe(1);
  });
});
