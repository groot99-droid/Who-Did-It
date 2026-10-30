import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, economy } from '@wdi/content';
import { TICK_RATE } from '@wdi/shared';
import { addFare, askOf, shopIsDear } from '../src/sim/economy/fare';
import {
  forceHardship,
  hardshipPool,
  inHardship,
  onDeliveryHardship,
  rentHardships,
} from '../src/sim/economy/hardship';
import { stockLeft, workOf } from '../src/sim/economy/townWork';
import { isNpcSeat } from '../src/sim/Npc';
import { simOf } from '../src/sim/RoomSim';
import { MatchSeeds } from '../src/sim/seeds';
import { forceArrival, isTurned, onDeliveryArrival } from '../src/sim/vendettas/arrival';
import { type Party, bootNpcServer, pauseClock, setRole, standardParty } from './npcHelpers';
import { sleep } from './simHelpers';

/** Round 10, C4c (GDD 3.33; followup-4 2.6 b1 to b5; seams.md 3 row 20): the dormant role and the hardships. */

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());
vi.setConfig({ testTimeout: 60_000 });

/** Three humans and the S1 NPC seats by day, the clock held. */
async function day(): Promise<Party> {
  const party = await standardParty(colyseus, 'S1', false, 3);
  pauseClock(party.room);
  return party;
}

/** Only `wearers` wear stall looks, in the order given (`baker`, `herbalist`); every other seat wears none. */
function looks(party: Party, wearers: string[]): void {
  const stall = ['baker', 'herbalist'];
  for (const [id, p] of party.room.state.players)
    p.look = wearers.includes(id) ? stall[wearers.indexOf(id)]! : 'x';
}

/** A stall's sign: how many of an item are left, and whether it is dear. */
const sign = (party: Party, shop: string, item: string) => ({
  left: stockLeft(party.room, shop, item),
  dear: askOf(party.room, shop, item) === Math.ceil(economy.prices[item]!.ask! * balance.respawn.priceMult),
});

describe('the dormant role (GDD 3.33, F4 b1)', () => {
  it('runs the turned seat’s stall exactly as an owing seat’s: the same left and the same ask', async () => {
    expect(balance.hitman.dormantOutput).toBe(balance.respawn.stockMult); // a lab change must move both
    const party = await day();
    const room = party.room;
    forceArrival(room, room.state.round, false);
    onDeliveryArrival(room, room.state.round);
    const seat = [...room.state.players.keys()].find((id) => isTurned(room, id))!;
    looks(party, [seat]);
    expect(workOf(room, 'baker')).toBe('thin');
    expect(shopIsDear(room, 'bakery')).toBe(true);
    const dormant = { left: stockLeft(room, 'bakery', 'flour'), ask: askOf(room, 'bakery', 'flour') };
    const owing = [...room.state.players.keys()].find((id) => id !== seat)!;
    looks(party, [owing]);
    addFare(room, owing);
    expect({ left: stockLeft(room, 'bakery', 'flour'), ask: askOf(room, 'bakery', 'flour') }).toEqual(
      dormant,
    );
  });
});

describe('hardships (GDD 3.33, F4 b2 to b5)', () => {
  it('strike from public facts only: a cover-wearer, a Cabal seat, a human and a seat killed unseen may all be struck', async () => {
    const party = await day();
    const room = party.room;
    const ids = [...room.state.players.keys()];
    const human = ids.find((id) => !isNpcSeat(room, id))!;
    const [cover, cabal, killed] = ids.filter((id) => isNpcSeat(room, id)) as [string, string, string];
    setRole(room, cover, 'killer'); // wears the baker's look below: a cover
    setRole(room, cabal, 'accomplice');
    simOf(room).players.get(killed)!.dead = true; // killed by day: only its body shows it
    for (const [id, p] of room.state.players)
      p.look = [human, cover, cabal, killed].includes(id) ? 'baker' : 'x';
    expect(hardshipPool(room).sort()).toEqual([human, cover, cabal, killed].sort());
    room.state.players.get(killed)!.alive = false; // the meeting shows the death: out of the pool
    expect(hardshipPool(room)).not.toContain(killed);
  });

  it('strikes hardship.atOnce seats at a delivery, thin and dear as owing, and recovers after hardship.recoverS', async () => {
    const party = await day();
    const room = party.room;
    const [a, b] = [...room.state.players.keys()] as [string, string];
    looks(party, [a, b]);
    await sleep(200); // the start's messages settle first
    const log = party.humans.map((h) => h.log.length);
    onDeliveryHardship(room, room.state.round);
    const struck = [a, b].filter((id) => inHardship(room, id));
    const [least, most] = balance.hardship.atOnce;
    expect(struck.length).toBeGreaterThanOrEqual(Math.min(least, 2));
    expect(struck.length).toBeLessThanOrEqual(most);
    if (inHardship(room, a)) expect(sign(party, 'bakery', 'flour').dear).toBe(true);
    expect(workOf(room, inHardship(room, a) ? 'baker' : 'herbalist')).toBe('thin');
    await sleep(150);
    expect(party.humans.map((h) => h.log.length)).toEqual(log); // nothing is sent
    room.state.tick += Math.round(balance.hardship.recoverS * TICK_RATE) + 1; // white-box: the day ends
    expect([a, b].some((id) => inHardship(room, id))).toBe(false);
  });

  it('keeps a rent hardship for the ledger, by look, in server memory', async () => {
    const party = await day();
    const room = party.room;
    const [a] = [...room.state.players.keys()] as [string];
    looks(party, [a]);
    forceHardship(room, a, 'robbed');
    expect(rentHardships(room)).toEqual([]); // a hardship of another kind leaves no row
    forceHardship(room, a, 'rent');
    expect(inHardship(room, a)).toBe(true);
    expect(rentHardships(room)).toEqual([{ look: 'baker', round: room.state.round }]);
  });
});

describe('the hardship stream (sim/seeds.ts)', () => {
  it('draws the same number of times at every delivery, whoever is struck', async () => {
    const party = await day();
    const room = party.room;
    const words = [7, 11, 13, 17] as const;
    const next = (pool: string[]) => {
      const seeds = new MatchSeeds({ hardship: words });
      const fake = { seeds, state: room.state } as unknown as typeof room;
      looks(party, pool);
      onDeliveryHardship(fake, 1);
      return seeds.get('hardship')();
    };
    const ids = [...room.state.players.keys()];
    expect(next([])).toBe(next(ids.slice(0, 1)));
    expect(next(ids.slice(0, 2))).toBe(next([]));
  });
});

describe('the turning delivery stays ambiguous (6Z, C4c acceptance)', () => {
  it('shows a never-dead, non-turned seat’s stall with the turned seat’s sign, and nothing tells them apart', async () => {
    const party = await day();
    const room = party.room;
    forceArrival(room, room.state.round, false);
    onDeliveryArrival(room, room.state.round);
    const turned = [...room.state.players.keys()].find((id) => isTurned(room, id))!;
    const other = [...room.state.players.keys()].find((id) => id !== turned)!;
    looks(party, [turned, other]); // the turned seat on the bakery, the other on the apothecary
    const atOnce = balance.hardship.atOnce as [number, number];
    const saved = [...atOnce] as [number, number];
    atOnce.splice(0, 2, 2, 2); // this delivery strikes the whole pool of two
    try {
      onDeliveryHardship(room, room.state.round);
    } finally {
      atOnce.splice(0, 2, ...saved);
    }
    expect(inHardship(room, other)).toBe(true);
    expect(simOf(room).players.get(other)!.dead).toBe(false);
    const dormant = sign(party, 'bakery', 'flour');
    const hardship = sign(party, 'apothecary', 'bandage');
    expect(hardship).toEqual(dormant);
    expect(dormant.dear).toBe(true);
    expect(rentHardships(room).every((r) => r.look === 'baker' || r.look === 'herbalist')).toBe(true);
  });
});
