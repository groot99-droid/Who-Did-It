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

/** The chapel station's `hq_` row lands with 8G's tier props, so these tests stand it on an overworld floor tile. */
const spot = (() => {
  const grid = scenes.overworld.grid;
  for (let y = 30; y < grid.length; y++) {
    const x = grid[y]!.indexOf('...');
    if (x >= 0) return { x: x + 1, y };
  }
  throw new Error('no floor on the overworld');
})();
const station = { id: chapel.props.hollowmere!, kind: 'hq', x: spot.x, y: spot.y };
type Prop = (typeof scenes.overworld.props)[number];

let colyseus: ColyseusTestServer;
beforeAll(async () => {
  scenes.overworld.props.push(station as Prop);
  process.env.WDI_DEBUG = '1';
  colyseus = await boot(createServer({ ipBurst: 1e5, ipPerMin: 1e8, globalPerMin: 1e8 }));
});
afterAll(async () => {
  scenes.overworld.props.splice(scenes.overworld.props.indexOf(station as Prop), 1);
  delete process.env.WDI_DEBUG;
  await colyseus.shutdown();
});
beforeEach(async () => {
  hqGate.open = true;
  await colyseus.cleanup();
});
afterEach(() => {
  hqGate.open = false;
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
  teleport(m, m.bots[0]!, 'overworld', spot.x + 1, spot.y);
  await sleep(100);
  return m;
}

describe('HQ tiers (GDD 3.23)', () => {
  it('stay closed until the owner signs off the tiers and perks', async () => {
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
    teleport(m, b, 'overworld', spot.x + 1, spot.y);
    await act(b, 'act.hq', { stationId: 'chapel' });
    expect(errorCodes(b)).toEqual([]);
    expect(m.room.state.hq.get('chapel')).toBe(1);
    expect(perkMul(m.room, b.id, 'faithGain')).toBe(perkMul(m.room, a.id, 'faithGain'));

    // At another look's station, the cover-wearer and a true wearer get the same refusal, word for word.
    const ovens = economy.hq.stations.crumbOvens!;
    const oven = { id: ovens.props.hollowmere!, kind: 'hq', x: spot.x, y: spot.y };
    const props = scenes.overworld.props;
    props.splice(props.indexOf(station as Prop), 1, oven as Prop);
    try {
      for (const bot of [a, b]) {
        bot.events.length = 0;
        await act(bot, 'act.hq', { stationId: 'crumbOvens' });
      }
      const refusal = (bot: Match['bots'][0]) => eventsOf(bot, 'error').map((e) => JSON.stringify(e));
      expect(refusal(a)).toHaveLength(1);
      expect(refusal(b)).toEqual(refusal(a));
    } finally {
      props.splice(props.indexOf(oven as Prop), 1, station as Prop);
    }
  });

  it('refuses another look, a seat out of reach, an unknown station and a tier it cannot pay for', async () => {
    const m = await atStation(3);
    const [a, b, c] = m.bots as [Match['bots'][0], Match['bots'][0], Match['bots'][0]];
    teleport(m, b, 'overworld', spot.x + 1, spot.y);
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
