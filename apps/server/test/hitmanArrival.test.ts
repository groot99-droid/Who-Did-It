import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, economy } from '@wdi/content';
import { NoteKind, S2C } from '@wdi/shared';
import type { PartyRoom } from '../src/rooms/PartyRoom';
import { addFare, askOf, shopIsDear } from '../src/sim/economy/fare';
import { stockLeft, workOf } from '../src/sim/economy/townWork';
import { isNpcSeat } from '../src/sim/Npc';
import { MatchSeeds, type SeedWords } from '../src/sim/seeds';
import {
  HITMAN_ARRIVE_LINE,
  arrivalDraw,
  drawArrival,
  forceArrival,
  isTurned,
  onDeliveryArrival,
} from '../src/sim/vendettas/arrival';
import { eligibleVendettas, vendettaOf } from '../src/sim/vendettas/state';
import { openContract } from '../src/sim/vendettas/contract';
import { type Party, bootNpcServer, lobbyOf, npcIdsOf, standardParty } from './npcHelpers';
import { sleep } from './simHelpers';

/** Round 10, C4a (GDD 3.33; world-mode.md 1.5, followup-4 2.6; seams.md 3 row 20): the Hitman's arrival. */

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());
vi.setConfig({ testTimeout: 60_000 });

/** The parts of a room the draw reads: the streams and the seats (none of them NPC seats). */
const fakeRoom = (seed: number): PartyRoom =>
  ({
    seeds: new MatchSeeds({ hitman: [seed, 0x9e3779b9, seed ^ 0x5bd1e995, 0x2545f491] as SeedWords }),
  }) as never;
const humans = (n: number) => Array.from({ length: n }, (_, i) => `h${i}`);

describe('the draw (world-mode.md 1.5, F4 a12, a13)', () => {
  it('follows hitman.byHumans: never below 3 humans, days 3 to 5, the human column', () => {
    for (const n of [1, 2]) {
      const room = fakeRoom(n);
      drawArrival(room, humans(n));
      expect(arrivalDraw(room)?.day).toBeNull();
    }
    const N = 3000;
    for (const [count, row] of Object.entries(balance.hitman.byHumans)) {
      let comes = 0;
      let human = 0;
      const days = new Set<number>();
      for (let s = 1; s <= N; s++) {
        const room = fakeRoom(s * 7919 + Number(count));
        drawArrival(room, humans(Number(count)));
        const d = arrivalDraw(room)!;
        if (d.day === null) continue;
        comes++;
        days.add(d.day);
        if (d.human) human++;
      }
      expect(Math.abs(comes / N - row.comes), `comes at ${count}`).toBeLessThan(0.04);
      if (comes > 0) expect(Math.abs(human / comes - row.human), `human at ${count}`).toBeLessThan(0.05);
      expect([...days].sort()).toEqual([3, 4, 5]);
    }
  });

  it('is never drawn by the Killer at the deal: the Hitman row is an arrival row', () => {
    const room = {
      seeds: new MatchSeeds(),
      state: { settings: { map: 'hollowmere' }, players: new Map() },
    } as never;
    const cards = ['killer', 'vicar', ...Array.from({ length: 6 }, () => 'townsfolk')];
    expect(eligibleVendettas(room, 'killer', cards).map((v) => v.id)).not.toContain('hitman');
  });
});

/** Three humans and the S1 NPC seats by day: the main mode. */
const mainParty = () => standardParty(colyseus, 'S1', false, 3);

/** A client's decoded roster (the client room's state is untyped). */
interface Roster {
  players: {
    forEach(cb: (p: { toJSON(): Record<string, unknown> }, id: string) => void): void;
    get(id: string): { priv?: { hitman?: boolean; notebook: { note: number }[] } } | undefined;
  };
}
const rosterOf = (h: Party['humans'][number]) => h.room.state as Roster;

/** Every seat's public row as each other client decodes it, `priv` and `presence` aside. */
function publicRows(party: Party): string[] {
  return party.humans.map((h) => {
    const rows: Record<string, unknown> = {};
    rosterOf(h).players.forEach((p, id) => {
      const {
        priv: _p,
        presence: _q,
        ...rest
      } = JSON.parse(JSON.stringify(p.toJSON())) as Record<string, unknown>;
      if (id !== h.id) rows[id] = rest;
    });
    return JSON.stringify(rows);
  });
}

const linesOf = (party: Party) =>
  party.humans.map((h) =>
    h.log
      .filter((e) => e.type === S2C.chatMsg)
      .map((e) => (e.payload as { text: string }).text)
      .filter((t) => t === HITMAN_ARRIVE_LINE),
  );

/** Forces the arrival on today's round and runs the delivery; returns the turned seat. */
async function turn(party: Party, human: boolean): Promise<string | null> {
  const room = party.room;
  forceArrival(room, room.state.round, human);
  onDeliveryArrival(room, room.state.round);
  await sleep(200);
  return [...room.state.players.keys()].find((id) => isTurned(room, id)) ?? null;
}

describe('the turning (seams.md 3 row 20)', () => {
  it('turns an eligible human: own view only, the mark in its own Notebook, no public field moves', async () => {
    const party = await mainParty();
    const room = party.room;
    await sleep(200);
    const before = publicRows(party);
    const seat = await turn(party, true);
    expect(seat).not.toBeNull();
    expect(isNpcSeat(room, seat!)).toBe(false);
    const card = room.state.players.get(seat!)!.priv.role.roleId;
    expect(['killer', 'accomplice']).not.toContain(card);
    expect(card).toBe(room.state.players.get(seat!)!.priv.role.roleId); // the card is kept
    expect(vendettaOf(room, seat!)?.id).toBe('hitman');
    expect(publicRows(party)).toEqual(before);
    for (const h of party.humans) {
      const own = rosterOf(h).players.get(h.id)?.priv;
      expect(own?.hitman === true, h.id).toBe(h.id === seat);
      expect(own?.notebook.some((n) => n.note === NoteKind.contract)).toBe(h.id === seat);
    }
    const mark = openContract(room, seat!)!.target;
    expect(isNpcSeat(room, mark)).toBe(false); // a human mark while one is free
    expect(linesOf(party)).toEqual(party.humans.map(() => [HITMAN_ARRIVE_LINE]));
  });

  it('turns an NPC seat with the same sign, and sends nothing when nobody comes', async () => {
    const party = await mainParty();
    const seat = await turn(party, false);
    expect(seat !== null && isNpcSeat(party.room, seat)).toBe(true);
    expect(linesOf(party)).toEqual(party.humans.map(() => [HITMAN_ARRIVE_LINE]));
    onDeliveryArrival(party.room, party.room.state.round); // once only
    const quiet = await mainParty();
    drawArrival(quiet.room, []); // no humans: he never comes
    onDeliveryArrival(quiet.room, quiet.room.state.round);
    await sleep(200);
    expect(linesOf(quiet).flat()).toEqual([]);
    expect(linesOf(party).flat()).toHaveLength(party.humans.length);
  });

  it('turns no cover, Cabal or Thief card, and none holding a vendetta; with none eligible he never comes', async () => {
    const party = await mainParty();
    const room = party.room;
    const ids = [...room.state.players.keys()];
    const others = ['drifter', 'thief', 'killer', 'accomplice'];
    ids.forEach((id, i) => {
      const card = room.state.players.get(id)!.priv.role.roleId;
      if (card !== 'killer' && card !== 'accomplice')
        room.state.players.get(id)!.priv.role.roleId = others[i % 4]!;
    });
    expect(await turn(party, true)).toBeNull();
    expect(linesOf(party).flat()).toEqual([]);
  });
});

describe('the dormant role (GDD 3.33, F4 b1)', () => {
  it('runs the turned seat’s stall exactly as an owing seat’s: the same left and the same ask', async () => {
    expect(balance.hitman.dormantOutput).toBe(balance.respawn.stockMult); // a lab change must move both
    const party = await mainParty();
    const room = party.room;
    const seat = (await turn(party, false))!;
    for (const [id, p] of room.state.players) if (p.look === 'baker') p.look = id === seat ? 'baker' : 'x';
    room.state.players.get(seat)!.look = 'baker';
    expect(workOf(room, 'baker')).toBe('thin');
    expect(shopIsDear(room, 'bakery')).toBe(true);
    const dormant = { left: stockLeft(room, 'bakery', 'flour'), ask: askOf(room, 'bakery', 'flour') };
    expect(dormant.ask).toBe(Math.ceil(economy.prices.flour!.ask! * balance.respawn.priceMult));
    // The same stall, its wearer now an ordinary seat owing the line.
    const owing = [...room.state.players.keys()].find((id) => id !== seat && !isTurned(room, id))!;
    room.state.players.get(seat)!.look = 'x';
    room.state.players.get(owing)!.look = 'baker';
    addFare(room, owing);
    expect({ left: stockLeft(room, 'bakery', 'flour'), ask: askOf(room, 'bakery', 'flour') }).toEqual(
      dormant,
    );
  });
});

describe('stream isolation (sim/seeds.ts)', () => {
  it('leaves the deal, the names and every public stream the same with the arrival forced on and off', async () => {
    const snap = async (on: boolean) => {
      const party = await mainParty();
      const room = party.room;
      if (on) await turn(party, true);
      // The NPC names are drawn in the lobby, before the deal, on `npcNames` (not fixed by `standardParty`).
      const seats = [...room.state.players.values()].map((p) => [
        p.priv.role.roleId,
        p.look,
        p.traits.height,
      ]);
      const npcs = npcIdsOf('S1');
      const draws = (['deal', 'traits', 'nodes', 'mobs', 'events', 'minigame', 'vendetta'] as const).map(
        (n) => room.seeds.get(n)(),
      );
      for (const id of npcs) draws.push(room.seeds.get('npcPlay', id)(), room.seeds.get('npcTiming', id)());
      return JSON.stringify({ seats, draws });
    };
    expect(await snap(true)).toBe(await snap(false));
  });
});

describe('the debug hook (WDI_DEBUG only)', () => {
  it('registers debug.hitman only with WDI_DEBUG=1', async () => {
    const handlers = (room: PartyRoom) =>
      Object.keys((room as unknown as { onMessageEvents: { events: object } }).onMessageEvents.events);
    const on = await lobbyOf(colyseus, 1);
    expect(handlers(on.room)).toContain('debug.hitman');
    delete process.env.WDI_DEBUG;
    try {
      const off = await lobbyOf(colyseus, 1);
      expect(handlers(off.room)).not.toContain('debug.hitman');
    } finally {
      process.env.WDI_DEBUG = '1';
    }
  });
});
