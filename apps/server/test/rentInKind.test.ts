import { ColyseusTestServer, boot } from '@colyseus/testing';
import { type SceneId, economy, scenes } from '@wdi/content';
import { ErrorCode, Phase } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import { TOWN, balanceOf, movePurse } from '../src/sim/economy/purse';
import { duesOf, isBoarded, isIndebted, pryBoards } from '../src/sim/economy/rent';
import { matchEvents } from '../src/sim/auto/log';
import { addStack, count } from '../src/sim/Inventory';
import { act, errorCodes, playerOf, setPhase, sleep, teleport } from './killHelpers';
import { type Match, startMatch } from './simHelpers';

/** Round 10 (D7, GDD 3.23): rent in kind, goods taken at dusk, the boarded house and its boards. */

/** The first two floor tiles side by side in a scene: the prop on one, the seat on the other. */
function floorPair(sceneId: SceneId): { x: number; y: number } {
  const grid = scenes[sceneId].grid;
  for (let y = 0; y < grid.length; y++) {
    const x = grid[y]!.indexOf('..');
    if (x >= 0) return { x, y };
  }
  throw new Error(`no floor in ${sceneId}`);
}

/** The bank counter lands with its art (8J), so these tests stand their own; the mill's tally rack is in (8K). */
const HALL = floorPair('manor_hall');
const bank = { id: 'mh.test_bank', kind: 'bank', x: HALL.x, y: HALL.y };
type Prop = (typeof scenes.manor_hall.props)[number];

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  scenes.manor_hall.props.push(bank as Prop);
  process.env.WDI_DEBUG = '1';
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => {
  scenes.manor_hall.props.splice(scenes.manor_hall.props.indexOf(bank as Prop), 1);
  delete process.env.WDI_DEBUG;
  await colyseus.shutdown();
});
beforeEach(async () => colyseus.cleanup());

/** A match on `map` in a fresh day, every seat holding `scrip`. */
async function inDay(n: number, map: string, scrip: number): Promise<Match> {
  const m = await startMatch(colyseus, n);
  m.room.state.settings.map = map;
  for (const b of m.bots) {
    movePurse(m.room, b.id, TOWN, playerOf(m, b).priv.purse, 'buy');
    movePurse(m.room, TOWN, b.id, scrip, 'stake');
  }
  m.room.state.round = 1;
  setPhase(m, Phase.day);
  await sleep(100);
  return m;
}

/** The rent falls due at once (the shift opened long ago). */
async function rentDue(m: Match): Promise<void> {
  duesOf(m.room).shiftStartTick = -1e6;
  await sleep(100);
}

const kinds = (m: Match, seat: string) =>
  matchEvents(m.room)
    .filter((e) => e.seat === seat)
    .map((e) => e.kind);

const pay = (item: string): number => economy.prices[item]!.pay!;

describe('rent in kind (D7, GDD 3.23)', () => {
  it('pays the purse first and goods at the market price toward the rest', async () => {
    const m = await inDay(2, 'hollowmere', 0);
    const [a, b] = m.bots as [Match['bots'][0], Match['bots'][0]];
    await rentDue(m);
    const herbs = Math.ceil(economy.rent.amount / pay('herb'));
    addStack(playerOf(m, a), 'herb', herbs);
    teleport(m, a, 'manor_hall', bank.x + 1, bank.y);
    await act(a, 'act.payRent', {});
    expect(count(playerOf(m, a), 'herb')).toBe(0);
    expect(duesOf(m.room).debt.has(a.id)).toBe(false);
    expect(kinds(m, a.id)).toContain('rent.paid');
    // Two Scrip of purse, the rest in herbs.
    movePurse(m.room, TOWN, b.id, 2, 'stake');
    addStack(playerOf(m, b), 'herb', 3);
    teleport(m, b, 'manor_hall', bank.x + 1, bank.y);
    await act(b, 'act.payRent', {});
    expect(balanceOf(m.room, b.id)).toBe(0);
    expect(count(playerOf(m, b), 'herb')).toBe(3 - Math.ceil((economy.rent.amount - 2) / pay('herb')));
    expect(duesOf(m.room).debt.has(b.id)).toBe(false);
  });

  it('refuses when the purse and the goods together fall short, and takes nothing', async () => {
    const m = await inDay(1, 'hollowmere', 1);
    const a = m.bots[0]!;
    await rentDue(m);
    addStack(playerOf(m, a), 'timber', 1);
    teleport(m, a, 'manor_hall', bank.x + 1, bank.y);
    await act(a, 'act.payRent', {});
    expect(errorCodes(a)).toContain(ErrorCode.cannot);
    expect(balanceOf(m.room, a.id)).toBe(1);
    expect(count(playerOf(m, a), 'timber')).toBe(1);
  });
});

describe('goods taken and the boarded house (D7, GDD 3.23)', () => {
  it('takes goods to the debt at dusk; what is left owed is Indebted and boarded', async () => {
    const m = await inDay(3, 'hollowmere', 0);
    const [a, b, c] = m.bots as [Match['bots'][0], Match['bots'][0], Match['bots'][0]];
    await rentDue(m);
    addStack(playerOf(m, a), 'herb', Math.ceil(economy.rent.amount / pay('herb')));
    addStack(playerOf(m, b), 'herb', 1);
    setPhase(m, Phase.dusk);
    await sleep(100);
    expect(count(playerOf(m, a), 'herb')).toBe(0); // taken whole: the debt is met
    expect(isIndebted(m.room, a.id)).toBe(false);
    expect(isBoarded(m.room, a.id)).toBe(false);
    expect(count(playerOf(m, b), 'herb')).toBe(0); // all it had
    expect(duesOf(m.room).debt.get(b.id)).toBe(economy.rent.amount - pay('herb'));
    expect(isBoarded(m.room, b.id)).toBe(true);
    expect(duesOf(m.room).debt.get(c.id)).toBe(economy.rent.amount); // nothing to take
    expect(isBoarded(m.room, c.id)).toBe(true);
    expect(kinds(m, a.id)).toContain('rent.seized');
  });

  it('is pried open for the night by a Crowbar or a Hammer, and the boards go back at dawn', async () => {
    const m = await inDay(2, 'hollowmere', 0);
    const [a, b] = m.bots as [Match['bots'][0], Match['bots'][0]];
    await rentDue(m);
    setPhase(m, Phase.dusk);
    await sleep(100);
    expect(isBoarded(m.room, a.id)).toBe(true);
    expect(pryBoards(m.room, a.id)).toBe(false); // bare hands
    addStack(playerOf(m, b), 'hammer', 1);
    expect(pryBoards(m.room, b.id)).toBe(true);
    expect(isBoarded(m.room, b.id)).toBe(false);
    expect(isIndebted(m.room, b.id)).toBe(true); // the debt stands
    m.room.state.round = 2;
    setPhase(m, Phase.day);
    await sleep(100);
    expect(isBoarded(m.room, b.id)).toBe(true);
  });

  it('takes the boards off when the debt is paid', async () => {
    const m = await inDay(1, 'hollowmere', 0);
    const a = m.bots[0]!;
    await rentDue(m);
    setPhase(m, Phase.dusk);
    await sleep(100);
    movePurse(m.room, TOWN, a.id, economy.rent.amount, 'stake');
    teleport(m, a, 'manor_hall', bank.x + 1, bank.y);
    await act(a, 'act.payRent', {});
    expect(isBoarded(m.room, a.id)).toBe(false);
  });
});
