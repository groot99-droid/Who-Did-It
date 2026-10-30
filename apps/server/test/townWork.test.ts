import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, economy } from '@wdi/content';
import { Phase } from '@wdi/shared';
import { avatarMemory } from '../src/sim/Avatars';
import { addFare, askOf } from '../src/sim/economy/fare';
import { handleDonate } from '../src/sim/economy/faith';
import { TOWN, balanceOf, movePurse } from '../src/sim/economy/purse';
import { handleBuy, handleShopHold } from '../src/sim/economy/shops';
import { stallStock, stockLeft, workOf } from '../src/sim/economy/townWork';
import { type Station, stationsOf } from '../src/sim/npc/routine';
import { mapScenesOf } from '../src/sim/MapSites';
import { openMeeting } from '../src/sim/Meeting';
import { simOf } from '../src/sim/RoomSim';
import {
  type Party,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  npcIdsOf,
  placeSeat,
  setRole,
  standardParty,
} from './npcHelpers';
import { sleep } from './simHelpers';

/** Round 10, C3 (GDD 3.23; round10-plan.md 5; seams.md row 15): what breaks when a look is gone. */

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());
vi.setConfig({ testTimeout: 60_000 });

const COUNTER = 'bk.shop_counter';
const SHOP = 'bakery';
const ITEM = 'flour';
const OWNER = economy.shops[SHOP]!.owner!;
const [BAKER, OTHER] = npcIdsOf('S1') as [string, string];

function stationOf(party: Party, propId: string): Station {
  return stationsOf(mapScenesOf(party.room), simOf(party.room).profile).find((s) => s.propId === propId)!;
}

/**
 * A day party with the human at the bakery counter. No seat wears the baker's look or the vicar's but `BAKER`, which
 * wears `look` and stands, living, in the bakery; every other NPC seat is out of play.
 */
async function bakeryDay(look = OWNER): Promise<{ party: Party; human: string }> {
  const party = await standardParty(colyseus, 'S1');
  const room = party.room;
  allTownsfolk(room);
  const human = party.humans[0]!.id;
  for (const player of room.state.players.values())
    if (player.look === OWNER || player.look === 'vicar') player.look = 'x';
  for (const [seat, p] of simOf(room).players) p.dead = seat !== human && seat !== BAKER && seat !== OTHER;
  room.state.players.get(BAKER)!.look = look;
  const st = stationOf(party, COUNTER);
  placeSeat(party, human, st.scene, st.stands[0]!.x, st.stands[0]!.y);
  placeSeat(party, BAKER, st.scene, st.stands[0]!.x, st.stands[0]!.y);
  holdPhase(party, Phase.day, 3600);
  return { party, human };
}

type Row = { itemId: string; price: number; left?: number };
const last = (party: Party, type: string) =>
  party.humans[0]!.log.filter((e) => e.type === type).at(-1)?.payload;

/** The bakery's flour row of the human's last `shop.open`, after a fresh hold on the counter. */
async function flourRow(party: Party, human: string): Promise<Row | undefined> {
  handleShopHold(party.room, human, COUNTER);
  await sleep(150);
  return (last(party, 'shop.open') as { stock: Row[] }).stock.find((s) => s.itemId === ITEM);
}

const lastReason = (party: Party) => (last(party, 'error') as { reason?: string } | undefined)?.reason;

describe('a stall sells from its day’s stock (GDD 3.23)', () => {
  it('sells townWork.stallStock while its look is at work, then refuses SPENT stock, and refills the next day', async () => {
    const { party, human } = await bakeryDay();
    const room = party.room;
    const full = stallStock(room);
    expect(full).toBeGreaterThanOrEqual(balance.townWork.stallStockMin);
    const ask = economy.prices[ITEM]!.ask!;
    expect(await flourRow(party, human)).toEqual({ itemId: ITEM, price: ask, left: full });
    movePurse(room, human, TOWN, balanceOf(room, human), 'buy');
    movePurse(room, TOWN, human, (full + 1) * ask, 'stake');
    handleBuy(room, human, { shopId: SHOP, itemId: ITEM, qty: full });
    await sleep(150);
    expect((await flourRow(party, human))?.left).toBe(0);
    handleBuy(room, human, { shopId: SHOP, itemId: ITEM, qty: 1 });
    await sleep(150);
    expect(lastReason(party)).toBe('SPENT');
    expect(balanceOf(room, human)).toBe(ask);
    // A shop with no owner keeps no count.
    expect(stockLeft(room, 'store', 'rope')).toBeUndefined();
    room.state.round++;
    expect(stockLeft(room, SHOP, ITEM)).toBe(full);
  });

  it('runs thin while its wearer owes the line, empties while the look is gone, and stays full for an undealt look', async () => {
    const { party } = await bakeryDay();
    const room = party.room;
    const full = stallStock(room);
    addFare(room, BAKER);
    expect(workOf(room, OWNER)).toBe('thin');
    expect(stockLeft(room, SHOP, ITEM)).toBe(Math.floor(full * balance.respawn.stockMult));
    room.state.players.get(BAKER)!.alive = false; // the roster shows it dead: gone, whatever it owes
    expect(workOf(room, OWNER)).toBe('gone');
    expect(stockLeft(room, SHOP, ITEM)).toBe(0);
    room.state.players.get(BAKER)!.look = 'x'; // an undealt look: no seat wears it, so it is never gone
    expect(workOf(room, OWNER)).toBe('work');
    expect(stockLeft(room, SHOP, ITEM)).toBe(full);
  });
});

describe('a kill is private until the meeting (GDD 3.8, A30)', () => {
  it('keeps a dead wearer’s stall and altar at work until the meeting shows the death', async () => {
    const { party, human } = await bakeryDay('vicar');
    const room = party.room;
    room.state.players.get(OTHER)!.look = OWNER;
    simOf(room).players.get(OTHER)!.dead = true; // killed by day: only the body shows it
    simOf(room).players.get(BAKER)!.dead = true;
    expect((await flourRow(party, human))?.left).toBe(stallStock(room));
    const priv = room.state.players.get(human)!.priv;
    movePurse(room, TOWN, human, 2, 'stake');
    placeSeat(party, human, 'chapel', 9, 2);
    handleDonate(room, human, { amount: 2 });
    expect(priv.faith).toBeGreaterThan(0);
    openMeeting(room, { reason: 'bell', callerId: human });
    expect(workOf(room, OWNER)).toBe('gone');
    expect(workOf(room, 'vicar')).toBe('gone');
  });
});

describe('the work follows the public look, never the card or the drawn figure (A170)', () => {
  it('a cover wearing the owner look and an impersonation drawn as the owner leave left and ask as plain', async () => {
    const { party, human } = await bakeryDay();
    const room = party.room;
    addFare(room, BAKER);
    const plain = await flourRow(party, human);
    expect(plain?.left).toBe(Math.floor(stallStock(room) * balance.respawn.stockMult));
    expect(plain?.price).toBe(askOf(room, SHOP, ITEM));

    setRole(room, BAKER, 'killer'); // a cover seat that wears the baker's look
    expect(await flourRow(party, human)).toEqual(plain);

    const disguise = { as: BAKER, applied: true, dropRequested: false, applyByTick: 0, untilTick: 1e9 };
    avatarMemory(room).disguise.set(OTHER, disguise); // another seat drawn as the baker
    expect(await flourRow(party, human)).toEqual(plain);
    room.state.players.get(BAKER)!.alive = false; // the drawn figure never keeps the stall at work
    expect((await flourRow(party, human))?.left).toBe(0);
  });
});

describe('Faith at the chapel (GDD 3.23)', () => {
  it('the chapel altar earns no Faith while the Vicar look is gone; the wayside altar keeps working', async () => {
    const { party, human } = await bakeryDay('vicar');
    const room = party.room;
    const priv = room.state.players.get(human)!.priv;
    movePurse(room, TOWN, human, 20, 'stake');
    room.state.players.get(BAKER)!.alive = false;
    placeSeat(party, human, 'chapel', 9, 2);
    handleDonate(room, human, { amount: 2 });
    await sleep(150);
    expect(lastReason(party)).toBe('COUNTER_CLOSED');
    expect(priv.faith).toBe(0);
    placeSeat(party, human, 'overworld', 12, 36);
    handleDonate(room, human, { amount: 2 });
    expect(priv.faith).toBeGreaterThan(0);
    const before = priv.faith;
    room.state.players.get(BAKER)!.alive = true;
    placeSeat(party, human, 'chapel', 9, 2);
    handleDonate(room, human, { amount: 2 });
    expect(priv.faith).toBeGreaterThan(before);
  });
});
