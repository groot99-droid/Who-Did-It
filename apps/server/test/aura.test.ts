import { ColyseusTestServer, boot } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { Phase } from '@wdi/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import { isConverted } from '../src/sim/economy/conversion';
import { hubOf } from '../src/sim/MapSites';
import { endBuff, grantBuff } from '../src/sim/rite/buff';
import { playerOf, setPhase, sleep, teleport } from './killHelpers';
import { type Match, startMatch } from './simHelpers';

// Story R6 (GDD 3.20, DECISIONS A607; A600 R-Q1, R-Q3): the dealt Vicar's conversion aura while it wears the return
// day's buff. Other seats within `rite.aura.tiles` gain Faith privately; I9 converts them at `conversion.faithAt`.

let colyseus: ColyseusTestServer;
const { faithPerS } = balance.rite.aura;
beforeAll(async () => {
  process.env.WDI_DEBUG = '1';
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => {
  delete process.env.WDI_DEBUG;
  await colyseus.shutdown();
});
beforeEach(async () => {
  await colyseus.cleanup();
  balance.rite.aura.faithPerS = 60; // a fast aura for the test clock: faithAt within about a second
});
afterEach(() => void (balance.rite.aura.faithPerS = faithPerS));

const faith = (m: Match, i: number) => playerOf(m, m.bots[i]!).priv!.faith;
/** Puts bot `i` on the hub at tile (x, y). */
const at = (m: Match, i: number, x: number, y: number) =>
  teleport(m, m.bots[i]!, hubOf(m.room) as never, x, y);
const FAR = balance.rite.aura.tiles + 3;

/** Bot0 holds the dealt Vicar, Bot1 the Knife, by day; the others stand around Bot0 on the hub. */
async function day(): Promise<Match> {
  const m = await startMatch(colyseus, 4, { Bot0: 'vicar', Bot1: 'killer' });
  setPhase(m, Phase.day);
  at(m, 0, 10, 10);
  at(m, 1, 10 + FAR + 4, 10);
  at(m, 2, 11, 10); // within the aura
  at(m, 3, 10 + FAR, 10); // beyond it
  await sleep(150);
  return m;
}

describe('the conversion aura (story R6)', () => {
  it('nothing without the buff', async () => {
    const m = await day();
    await sleep(400);
    expect(faith(m, 2)).toBe(0);
  });

  it('the ascended dealt Vicar gives Faith within reach only, and I9 converts', async () => {
    const m = await day();
    grantBuff(m.room, m.bots[0]!.id);
    await sleep(1600);
    expect(faith(m, 2)).toBeGreaterThanOrEqual(balance.conversion.faithAt);
    expect(isConverted(m.room, m.bots[2]!.id)).toBe(true);
    expect(faith(m, 3)).toBe(0);
    expect(faith(m, 0)).toBe(0); // not the Vicar itself
  });

  it('a cover in the Vicar look, ascended, has no aura (it follows the dealt card)', async () => {
    const m = await startMatch(colyseus, 4, { Bot0: 'vicar', Bot1: 'killer' });
    setPhase(m, Phase.day);
    playerOf(m, m.bots[3]!).look = playerOf(m, m.bots[0]!).look;
    at(m, 0, 10 + FAR + 6, 10);
    at(m, 3, 10, 10);
    at(m, 2, 11, 10);
    await sleep(150);
    grantBuff(m.room, m.bots[3]!.id);
    await sleep(600);
    expect(faith(m, 2)).toBe(0);
  });

  it('the buff coming off ends the aura', async () => {
    const m = await day();
    grantBuff(m.room, m.bots[0]!.id);
    await sleep(300);
    endBuff(m.room);
    await sleep(100);
    const then = faith(m, 2);
    expect(then).toBeGreaterThan(0);
    await sleep(500);
    expect(faith(m, 2)).toBe(then);
  });
});
