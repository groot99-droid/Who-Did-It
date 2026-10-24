import { ColyseusTestServer, boot } from '@colyseus/testing';
import { economy, scenes } from '@wdi/content';
import { ErrorCode, Phase } from '@wdi/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';
import { matchEvents } from '../src/sim/auto/log';
import { hqGate, syncHq } from '../src/sim/economy/hq';
import { perkMul, tiersOf } from '../src/sim/economy/perks';
import { TOWN, balanceOf, movePurse } from '../src/sim/economy/purse';
import { addStack, count } from '../src/sim/Inventory';
import { act, errorCodes, eventsOf, playerOf, setPhase, sleep, teleport } from './killHelpers';
import { type Match, startMatch } from './simHelpers';

/** Round 8 (GDD 3.23), Session 8D: buying an HQ tier, by the public look, into the public `GameState.hq`. */

const chapel = economy.hq.stations.chapel!;
const [first, second] = chapel.tiers as [(typeof chapel.tiers)[0], (typeof chapel.tiers)[0]];

/** HollowMere's real tier props (8G): the chapel's on the overworld, the ovens' in the bakery. */
const station = scenes.overworld.props.find((p) => p.id === chapel.props.hollowmere)!;
const spot = { x: station.x + 1, y: station.y };

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
afterEach(() => {
  hqGate.open = true;
});

/** A day on HollowMere: seat 0 walks in the chapel's look at the station with Scrip and the first two tiers' goods. */
async function atStation(n: number): Promise<Match> {
  const m = await startMatch(colyseus, n);
  m.room.state.settings.map = 'hollowmere';
  const looks = [chapel.look, 'baker', 'doctor'];
  m.bots.forEach((b, i) => {
    playerOf(m, b).look = looks[i]!;
    movePurse(m.room, b.id, TOWN, playerOf(m, b).priv.purse, 'buy');
    movePurse(m.room, TOWN, b.id, first.scrip + second.scrip, 'stake');
    for (const s of [...first.materials, ...second.materials]) addStack(playerOf(m, b), s.item, s.qty);
  });
  setPhase(m, Phase.day);
  teleport(m, m.bots[0]!, 'overworld', spot.x, spot.y);
  await sleep(100);
  return m;
}

describe('HQ tiers (GDD 3.23)', () => {
  it('are open since the owner signed off; a shut gate (kept as a fixture) refuses', async () => {
    expect(hqGate.open).toBe(true);
    const m = await atStation(1);
    hqGate.open = false;
    await act(m.bots[0]!, 'act.hq', { stationId: 'chapel' });
    expect(errorCodes(m.bots[0]!)).toContain(ErrorCode.cannot);
    expect(m.room.state.hq.size).toBe(0);
    expect(balanceOf(m.room, m.bots[0]!.id)).toBe(first.scrip + second.scrip);
  });

  it('the station look buys the next tier for its Scrip and materials, publicly, and its perk applies', async () => {
    const m = await atStation(2);
    const [a, b] = m.bots as [Match['bots'][0], Match['bots'][0]];
    await act(a, 'act.hq', { stationId: 'chapel' });
    expect(m.room.state.hq.get('chapel')).toBe(1);
    expect(balanceOf(m.room, a.id)).toBe(second.scrip);
    const qty = (tiers: (typeof first)[], item: string) =>
      tiers.flatMap((t) => t.materials).reduce((n, t) => n + (t.item === item ? t.qty : 0), 0);
    for (const s of first.materials)
      expect(count(playerOf(m, a), s.item)).toBe(qty([first, second], s.item) - qty([first], s.item));
    expect(perkMul(m.room, a.id, 'faithGain')).toBe(first.perks.faithGain);
    expect(perkMul(m.room, b.id, 'faithGain')).toBe(1);
    const event = matchEvents(m.room).find((e) => e.kind === 'hq.tier');
    expect(event?.data).toEqual({ stationId: 'chapel', tier: 1, by: a.id });

    // Public: another seat's client reads the same tier, and nothing in the row names the buyer.
    await sleep(200);
    const seen = (b.room.state as { hq?: Map<string, number> }).hq;
    expect(seen?.get('chapel')).toBe(1);

    await act(a, 'act.hq', { stationId: 'chapel' });
    expect(m.room.state.hq.get('chapel')).toBe(2);
    expect(balanceOf(m.room, a.id)).toBe(0);
  });

  it('treats a cover-wearer of the station look exactly like its true wearer, and refuses both alike elsewhere', async () => {
    const m = await atStation(2);
    const [a, b] = m.bots as [Match['bots'][0], Match['bots'][0]];
    // Seat 1 is dealt the Killer and wears the Vicar's look as its cover; seat 0 holds the Vicar's look too.
    playerOf(m, b).priv.role.roleId = 'killer';
    playerOf(m, b).look = chapel.look;
    teleport(m, b, 'overworld', spot.x, spot.y);
    await act(b, 'act.hq', { stationId: 'chapel' });
    expect(errorCodes(b)).toEqual([]);
    expect(m.room.state.hq.get('chapel')).toBe(1);
    expect(perkMul(m.room, b.id, 'faithGain')).toBe(perkMul(m.room, a.id, 'faithGain'));

    // At another look's station, the cover-wearer and a true wearer get the same refusal, word for word.
    const ovens = scenes.bakery.props.find((p) => p.id === economy.hq.stations.crumbOvens!.props.hollowmere)!;
    for (const bot of [a, b]) {
      teleport(m, bot, 'bakery', ovens.x, ovens.y - 1);
      bot.events.length = 0;
      await act(bot, 'act.hq', { stationId: 'crumbOvens' });
    }
    const refusal = (bot: Match['bots'][0]) => eventsOf(bot, 'error').map((e) => JSON.stringify(e));
    expect(refusal(a)).toHaveLength(1);
    expect(refusal(b)).toEqual(refusal(a));
  });

  it('refuses another look, a seat out of reach, an unknown station and a tier it cannot pay for', async () => {
    const m = await atStation(3);
    const [a, b, c] = m.bots as [Match['bots'][0], Match['bots'][0], Match['bots'][0]];
    teleport(m, b, 'overworld', spot.x, spot.y);
    await act(b, 'act.hq', { stationId: 'chapel' });
    expect(errorCodes(b)).toContain(ErrorCode.cannot);
    await act(c, 'act.hq', { stationId: 'chapel' });
    expect(errorCodes(c)).toContain(ErrorCode.outOfRange);
    await act(a, 'act.hq', { stationId: 'toString' });
    expect(errorCodes(a)).toContain(ErrorCode.outOfRange);
    playerOf(m, a).priv.inventory.slots.clear();
    await act(a, 'act.hq', { stationId: 'chapel' });
    expect(errorCodes(a).filter((e) => e === ErrorCode.cannot)).toHaveLength(1);
    expect(balanceOf(m.room, a.id)).toBe(first.scrip + second.scrip);
    expect(m.room.state.hq.size).toBe(0);
  });

  it('the public map follows the match tier memory, so a new match starts unbuilt', async () => {
    const m = await atStation(1);
    await act(m.bots[0]!, 'act.hq', { stationId: 'chapel' });
    expect(m.room.state.hq.get('chapel')).toBe(1);
    tiersOf(m.room).clear();
    syncHq(m.room);
    expect(m.room.state.hq.size).toBe(0);
  });
});
