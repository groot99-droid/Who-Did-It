import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, economy } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import { matchEvents } from '../src/sim/auto/log';
import { addFare, askOf, fareOf, shopIsDear } from '../src/sim/economy/fare';
import { TOWN, balanceOf, movePurse } from '../src/sim/economy/purse';
import { handleBuy } from '../src/sim/economy/shops';
import { handleHold } from '../src/sim/Hold';
import { workable } from '../src/sim/npc/chores';
import { npcMemory } from '../src/sim/npc/memory';
import { type Station, stationsOf } from '../src/sim/npc/routine';
import { mapScenesOf } from '../src/sim/MapSites';
import { simOf } from '../src/sim/RoomSim';
import {
  type Party,
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  npcIdsOf,
  placeSeat,
  standardParty,
} from './npcHelpers';
import { sleep } from './simHelpers';

/** Round 10, C2b (GDD 3.23; followup-4 2.5): the Clerk's labour errand, the dear stall, and an NPC seat's errand. */

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());
vi.setConfig({ testTimeout: 60_000 });

const LEDGER = 'bk.ledger';
const COUNTER = 'bk.shop_counter';
const fare = balance.respawn.fareDebt;
const errandTicks = Math.round(balance.respawn.errandS * TICK_RATE);
const weights = balance.npc.routine.weights as { day: { work: number; stroll: number; idle: number } };
const savedDay = { ...weights.day };
afterEach(() => void Object.assign(weights.day, savedDay));

function stationOf(party: Party, propId: string): Station {
  return stationsOf(mapScenesOf(party.room), simOf(party.room).profile).find((s) => s.propId === propId)!;
}

/** A day party with the human standing by `propId`, every NPC seat but `keep` out of play. */
async function dayAt(propId: string, keep?: string): Promise<{ party: Party; human: string }> {
  const party = await standardParty(colyseus, 'S1');
  allTownsfolk(party.room);
  const human = party.humans[0]!.id;
  for (const [seat, p] of simOf(party.room).players) p.dead = seat !== human && seat !== keep;
  const st = stationOf(party, propId);
  placeSeat(party, human, st.scene, st.stands[0]!.x, st.stands[0]!.y);
  holdPhase(party, Phase.day, 3600);
  return { party, human };
}

const reasons = (party: Party) =>
  party.humans[0]!.log.filter((e) => e.type === 'error').map(
    (e) => (e as { payload: { reason?: string } }).payload.reason,
  );

describe('the Clerk’s labour errand (GDD 3.23)', () => {
  it('clears one fare after respawn.errandS at a ledger, and is refused with nothing owed or on the move', async () => {
    const { party, human } = await dayAt(LEDGER);
    const room = party.room;
    handleHold(room, human, { action: 'errand', targetId: LEDGER, on: true });
    await sleep(150);
    expect(reasons(party)).toContain('NOTHING_OWED');
    addFare(room, human);
    addFare(room, human);
    handleHold(room, human, { action: 'errand', targetId: LEDGER, on: true });
    advance(party, errandTicks - 2);
    expect(fareOf(room, human)).toBe(2 * fare);
    advance(party, 4);
    expect(fareOf(room, human)).toBe(fare);
    expect(matchEvents(room).some((e) => e.kind === 'fare.errand' && e.seat === human)).toBe(true);
    // Walking away from the books cancels it, as any hold.
    handleHold(room, human, { action: 'errand', targetId: LEDGER, on: true });
    advance(party, 5);
    placeSeat(party, human, 'chapel', 4, 4);
    advance(party, 2);
    expect(simOf(room).players.get(human)!.hold).toBeNull();
    expect(fareOf(room, human)).toBe(fare);
  });
});

describe('the dear stall (GDD 3.23)', () => {
  it('asks priceMult more, rounded up, while its owner look owes the line, and charges what it shows', async () => {
    const [npc] = npcIdsOf('S1') as [string];
    const { party, human } = await dayAt(COUNTER, npc); // the owner look's wearer stays alive: its stall is at work (C3)
    const room = party.room;
    const shopId = 'bakery';
    const owner = economy.shops[shopId]!.owner!;
    const base = economy.prices.flour!.ask!;
    room.state.players.get(npc)!.look = owner;
    expect(shopIsDear(room, shopId)).toBe(false);
    addFare(room, npc);
    expect(shopIsDear(room, shopId)).toBe(true);
    const dear = Math.ceil(base * balance.respawn.priceMult);
    expect(askOf(room, shopId, 'flour')).toBe(dear);
    // A shop with no owner is never dear.
    expect(askOf(room, 'store', 'rope')).toBe(economy.prices.rope!.ask);

    movePurse(room, human, TOWN, balanceOf(room, human), 'buy');
    movePurse(room, TOWN, human, dear, 'stake');
    handleHold(room, human, { action: 'shop', targetId: COUNTER, on: true });
    await sleep(150);
    const open = party.humans[0]!.log.filter((e) => e.type === 'shop.open').at(-1)?.payload as {
      stock: { itemId: string; price: number }[];
    };
    expect(open.stock.find((s) => s.itemId === 'flour')?.price).toBe(dear);
    handleBuy(room, human, { shopId, itemId: 'flour', qty: 1 });
    expect(balanceOf(room, human)).toBe(0);
  });
});

describe('an NPC seat owes the line like a human (world-mode 6)', () => {
  it('works the ledger only while it owes, and clears its fare there in the course of its day', async () => {
    const [npc] = npcIdsOf('S1') as [string];
    const { party } = await dayAt(LEDGER, npc);
    const room = party.room;
    const st = stationOf(party, LEDGER);
    const player = room.state.players.get(npc)!;
    player.priv.inventory.slots.clear();
    expect(workable(room, player, st)).toBe(false);
    addFare(room, npc);
    expect(workable(room, player, st)).toBe(true);
    placeSeat(party, npc, st.scene, st.stands[0]!.x, st.stands[0]!.y);
    Object.assign(weights.day, { work: 1, stroll: 0, idle: 0 });
    npcMemory(room).brain(npc).persona = { home: 'tavern_bar', favourites: [] };
    let cleared = -1;
    advance(party, 180 * TICK_RATE, (tick) => {
      if (cleared < 0 && fareOf(room, npc) === 0) cleared = tick;
    });
    expect(cleared).toBeGreaterThan(0);
    expect(workable(room, player, st)).toBe(false);
  });
});
