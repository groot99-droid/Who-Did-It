import { ColyseusTestServer, boot } from '@colyseus/testing';
import { type SceneId, economy, scenes } from '@wdi/content';
import { EffectId, ErrorCode, Phase } from '@wdi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import { TOWN, balanceOf, movePurse } from '../src/sim/economy/purse';
import { curfewBars, duesOf, isIndebted } from '../src/sim/economy/rent';
import { matchEvents } from '../src/sim/auto/log';
import { addStack, count } from '../src/sim/Inventory';
import { act, errorCodes, playerOf, setPhase, sleep, teleport } from './killHelpers';
import { type Match, lastEvent, startMatch } from './simHelpers';

/** Round 8 (GDD 3.23), Session 8D: rent, the quota, Indebted and the curfew door. */

/** The first two floor tiles side by side in a scene: the prop on one, the seat on the other. */
function floorPair(sceneId: SceneId): { x: number; y: number } {
  const grid = scenes[sceneId].grid;
  for (let y = 0; y < grid.length; y++) {
    const x = grid[y]!.indexOf('..');
    if (x >= 0) return { x, y };
  }
  throw new Error(`no floor in ${sceneId}`);
}

/** The bank counter and the tally rack land with their art (8J, 8K), so these tests stand their own. */
const HALL = floorPair('manor_hall');
const MILL = floorPair('bp_mill');
const bank = { id: 'mh.test_bank', kind: 'bank', x: HALL.x, y: HALL.y };
const rack = { id: economy.quota.racks[0]!, kind: 'rack', x: MILL.x, y: MILL.y };
type Prop = (typeof scenes.manor_hall.props)[number];

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  scenes.manor_hall.props.push(bank as Prop);
  scenes.bp_mill.props.push(rack as Prop);
  process.env.WDI_DEBUG = '1';
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => {
  scenes.manor_hall.props.splice(scenes.manor_hall.props.indexOf(bank as Prop), 1);
  scenes.bp_mill.props.splice(scenes.bp_mill.props.indexOf(rack as Prop), 1);
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

describe('rent (GDD 3.23)', () => {
  it('falls due midway through the day and is paid whole at a bank counter', async () => {
    const m = await inDay(2, 'hollowmere', 20);
    const [a, b] = m.bots as [Match['bots'][0], Match['bots'][0]];
    expect(duesOf(m.room).debt.size).toBe(0);
    await rentDue(m);
    expect(duesOf(m.room).debt.get(a.id)).toBe(economy.rent.amount);
    expect(kinds(m, a.id)).toContain('rent.due');

    await act(a, 'act.payRent', {});
    expect(errorCodes(a)).toContain(ErrorCode.outOfRange);
    teleport(m, a, 'manor_hall', bank.x + 1, bank.y);
    await act(a, 'act.payRent', {});
    expect(balanceOf(m.room, a.id)).toBe(20 - economy.rent.amount);
    expect(duesOf(m.room).debt.has(a.id)).toBe(false);
    expect(kinds(m, a.id)).toContain('rent.paid');
    await act(a, 'act.payRent', {});
    expect(balanceOf(m.room, a.id)).toBe(20 - economy.rent.amount);

    // Unpaid by dusk: Indebted, privately, until it pays.
    setPhase(m, Phase.dusk);
    await sleep(100);
    expect(isIndebted(m.room, a.id)).toBe(false);
    expect(isIndebted(m.room, b.id)).toBe(true);
    expect(playerOf(m, b).priv.body.effects.map((e) => e.id)).toEqual([EffectId.indebted]);
    teleport(m, b, 'manor_hall', bank.x + 1, bank.y);
    await act(b, 'act.payRent', {});
    expect(isIndebted(m.room, b.id)).toBe(false);
    expect(playerOf(m, b).priv.body.effects.length).toBe(0);
  });

  it('refuses a payment the purse cannot cover, and the debt carries over', async () => {
    const m = await inDay(1, 'hollowmere', economy.rent.amount - 1);
    const a = m.bots[0]!;
    await rentDue(m);
    teleport(m, a, 'manor_hall', bank.x + 1, bank.y);
    await act(a, 'act.payRent', {});
    expect(errorCodes(a)).toContain(ErrorCode.cannot);
    expect(balanceOf(m.room, a.id)).toBe(economy.rent.amount - 1);
    setPhase(m, Phase.dusk);
    await sleep(100);
    m.room.state.round = 2;
    setPhase(m, Phase.day);
    await sleep(100);
    await rentDue(m);
    expect(duesOf(m.room).debt.get(a.id)).toBe(2 * economy.rent.amount);
  });

  it('falls due on no map outside `rent.maps`', async () => {
    const m = await inDay(1, 'blackpine', 20);
    await rentDue(m);
    expect(duesOf(m.room).debt.size).toBe(0);
  });
});

describe('the curfew door (GDD 3.23)', () => {
  const DOOR = 'ov.tavern_front';
  const doorOf = (state: unknown) =>
    (state as Match['room']['state']).scenes?.get('overworld')?.doors.get(DOOR)?.state;

  it('refuses an Indebted seat a curfew scene after dark, while a paid seat goes through on the same tick', async () => {
    const m = await inDay(3, 'hollowmere', 0);
    const [a, b, c] = m.bots as [Match['bots'][0], Match['bots'][0], Match['bots'][0]];
    await rentDue(m);
    movePurse(m.room, TOWN, b.id, economy.rent.amount, 'stake');
    teleport(m, b, 'manor_hall', bank.x + 1, bank.y);
    await act(b, 'act.payRent', {});
    expect(curfewBars(m.room, a.id, 'tavern_bar')).toBe(false); // not yet dusk
    setPhase(m, Phase.dusk);
    await sleep(100);
    const curfew = economy.curfew.hollowmere!;
    expect(curfewBars(m.room, a.id, curfew[0]!)).toBe(true);
    expect(curfewBars(m.room, a.id, 'overworld')).toBe(false);
    expect(curfewBars(m.room, b.id, curfew[0]!)).toBe(false);

    teleport(m, a, 'overworld', 28, 35);
    teleport(m, b, 'overworld', 28, 35);
    teleport(m, c, 'overworld', 28, 36);
    await sleep(300);
    const door = doorOf(m.room.state);
    for (const bot of m.bots) bot.events.length = 0;
    a.room.send('act.enterPortal', { portalId: DOOR });
    b.room.send('act.enterPortal', { portalId: DOOR });
    await sleep(1500);

    // The Indebted seat is refused with the locked door's code; the paid one crosses.
    expect(errorCodes(a)).toEqual([ErrorCode.locked]);
    expect(playerOf(m, a).priv.sceneId).toBe(0);
    expect(errorCodes(b)).toEqual([]);
    expect(lastEvent(b, 'sceneEnter')).toMatchObject({ sceneId: 'tavern_bar' });

    // The door's drawn state did not change, and every client that sees it reads the same one.
    expect(doorOf(m.room.state)).toBe(door);
    expect(doorOf(a.room.state)).toBe(door);
    expect(doorOf(c.room.state)).toBe(door);
  });

  it('tells no other seat: the refusal reaches only the requester, and Indebted only its own view', async () => {
    const m = await inDay(2, 'hollowmere', 0);
    const [a, b] = m.bots as [Match['bots'][0], Match['bots'][0]];
    await rentDue(m);
    setPhase(m, Phase.dusk);
    await sleep(100);
    teleport(m, a, 'overworld', 28, 35);
    teleport(m, b, 'overworld', 28, 36);
    await sleep(300);
    b.events.length = 0;
    a.room.send('act.enterPortal', { portalId: DOOR });
    await sleep(800);
    expect(errorCodes(a)).toContain(ErrorCode.locked);
    expect(errorCodes(b)).toEqual([]);
    expect(JSON.stringify(b.events)).not.toMatch(/indebted|curfew|hunted|rent/i);
    // b's copy of a's seat carries no private view; a's own does.
    type Seen = { players: Map<string, unknown> };
    const seen = (b.room.state as Seen).players.get(a.id) as { priv?: { body?: { effects?: unknown[] } } };
    expect(seen?.priv?.body?.effects?.length ?? 0).toBe(0);
    const own = (a.room.state as Seen).players.get(a.id) as {
      priv: { body: { effects: { id: number }[] } };
    };
    expect([...own.priv.body.effects].map((e) => e.id)).toEqual([EffectId.indebted]);
  });
});

describe('the quota (GDD 3.23)', () => {
  it('a hold at the tally rack hauls the quota; a short seat is fined at dusk, and Indebted if it cannot pay', async () => {
    const m = await inDay(3, 'blackpine', 0);
    const [a, b, c] = m.bots as [Match['bots'][0], Match['bots'][0], Match['bots'][0]];
    expect(kinds(m, a.id)).toContain('quota.due');
    const [item] = economy.quota.items;
    addStack(playerOf(m, a), item!, economy.quota.qty + 1);
    teleport(m, a, 'bp_mill', rack.x + 1, rack.y);
    await act(a, 'act.hold', { action: 'rack', targetId: rack.id, on: true }, 2600);
    expect(count(playerOf(m, a), item!)).toBe(1);
    expect(duesOf(m.room).hauled.get(a.id)).toBe(economy.quota.qty);
    expect(kinds(m, a.id)).toContain('quota.met');

    // Nothing left to haul once it is met.
    await act(a, 'act.hold', { action: 'rack', targetId: rack.id, on: true });
    expect(errorCodes(a)).toContain(ErrorCode.cannot);

    movePurse(m.room, TOWN, b.id, economy.quota.fine, 'stake');
    setPhase(m, Phase.dusk);
    await sleep(100);
    expect(isIndebted(m.room, a.id)).toBe(false);
    expect(balanceOf(m.room, b.id)).toBe(0);
    expect(isIndebted(m.room, b.id)).toBe(false);
    expect(isIndebted(m.room, c.id)).toBe(true);
    expect(duesOf(m.room).debt.get(c.id)).toBe(economy.quota.fine);
  });
});
