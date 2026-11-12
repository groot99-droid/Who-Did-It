import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance } from '@wdi/content';
import { C2S, Phase, TICK_RATE } from '@wdi/shared';
import { addFare } from '../src/sim/economy/fare';
import { forceHardship, onDeliveryHardship } from '../src/sim/economy/hardship';
import { drawLedgerRead, goesToReadLedger, handleLedgerRead } from '../src/sim/economy/ledger';
import { jailSeat } from '../src/sim/law/Jail';
import { mapScenesOf } from '../src/sim/MapSites';
import { workable } from '../src/sim/npc/chores';
import { npcMemory } from '../src/sim/npc/memory';
import { type Station, stationsOf } from '../src/sim/npc/routine';
import { simOf } from '../src/sim/RoomSim';
import { forceArrival, onDeliveryArrival } from '../src/sim/vendettas/arrival';
import {
  type Human,
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

/** Round 10, C4d (GDD 3.33; followup-4 2.6 b5 and 2.7; seams.md 3 row 37): the Clerk's rent ledger. */

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());
vi.setConfig({ testTimeout: 60_000 });

const LEDGER = 'bk.ledger';
const read = balance.hardship.readLedger as { before: number; after: number };
const savedRead = { ...read };
const weights = balance.npc.routine.weights as { day: { work: number; stroll: number; idle: number } };
const savedDay = { ...weights.day };
afterEach(() => {
  Object.assign(read, savedRead);
  Object.assign(weights.day, savedDay);
});

const stationOf = (party: Party, propId: string): Station =>
  stationsOf(mapScenesOf(party.room), simOf(party.room).profile).find((s) => s.propId === propId)!;

/** A day party of two humans, the first standing at the Clerk's books, the clock held. */
async function day(): Promise<Party> {
  const party = await standardParty(colyseus, 'S1', false, 2);
  allTownsfolk(party.room);
  const st = stationOf(party, LEDGER);
  placeSeat(party, party.humans[0]!.id, st.scene, st.stands[0]!.x, st.stands[0]!.y);
  holdPhase(party, Phase.day, 3600);
  await sleep(200); // the start's messages settle first
  return party;
}

const ledgers = (h: Human) =>
  h.log
    .filter((e) => e.type === 'ledger')
    .map((e) => e.payload as { propId: string; rows: { day: number; lookId: string }[] });
const reasons = (h: Human) =>
  h.log.filter((e) => e.type === 'error').map((e) => (e.payload as { reason?: string }).reason);

/** The reader sends `ledger.read` through its own client and the step consumes it. */
async function readThrough(party: Party, h: Human, propId = LEDGER): Promise<void> {
  h.room.send(C2S.ledgerRead, { propId });
  await sleep(150);
  advance(party, 1);
  await sleep(150);
}

describe('the Clerk’s rent ledger (GDD 3.33)', () => {
  it('answers the reader alone with every rent hardship by day and look, and no other kind', async () => {
    const party = await day();
    const room = party.room;
    const [reader, other] = party.humans as [Human, Human];
    const [a, b] = npcIdsOf('S1') as [string, string];
    room.state.players.get(a)!.look = 'baker';
    room.state.players.get(b)!.look = 'herbalist';
    forceHardship(room, a, 'rent');
    forceHardship(room, b, 'robbed'); // another kind leaves no row
    room.state.round += 1;
    forceHardship(room, b, 'rent');
    room.state.players.get(a)!.look = 'x'; // the row keeps the look it struck, never a later one
    await readThrough(party, reader);
    const [ledger] = ledgers(reader);
    expect(ledger).toEqual({
      propId: LEDGER,
      rows: [
        { day: room.state.round - 1, lookId: 'baker' },
        { day: room.state.round, lookId: 'herbalist' },
      ],
    });
    expect(JSON.stringify(ledger)).not.toMatch(new RegExp(`${a}|${b}|${reader.id}`)); // no seat, only looks
    expect(ledgers(other)).toEqual([]); // nothing public, nothing to anyone else
    // Every reader at a tick gets the same rows.
    const st = stationOf(party, LEDGER);
    placeSeat(party, other.id, st.scene, st.stands[0]!.x, st.stands[0]!.y);
    await readThrough(party, other);
    expect(ledgers(other)[0]).toEqual(ledger);
  });

  it('is refused out of reach, out of play, out of the world phases and in jail, with the shared reasons', async () => {
    const party = await day();
    const room = party.room;
    const h = party.humans[0]!;
    const sim = simOf(room).players.get(h.id)!;
    const refusal = () => reasons(h).at(-1);
    handleLedgerRead(room, h.id, { propId: 'nope' });
    handleLedgerRead(room, h.id, {});
    await sleep(150);
    expect(reasons(h).slice(-2)).toEqual(['TOO_FAR', 'BAD_REQUEST']);
    placeSeat(party, h.id, 'chapel', 4, 4);
    handleLedgerRead(room, h.id, { propId: LEDGER });
    await sleep(150);
    expect(refusal()).toBe('TOO_FAR');
    const st = stationOf(party, LEDGER);
    placeSeat(party, h.id, st.scene, st.stands[0]!.x, st.stands[0]!.y);
    holdPhase(party, Phase.immunity, 60);
    handleLedgerRead(room, h.id, { propId: LEDGER });
    await sleep(150);
    expect(refusal()).toBe('PHASE_CLOSED');
    holdPhase(party, Phase.day, 3600);
    sim.dead = true;
    handleLedgerRead(room, h.id, { propId: LEDGER });
    await sleep(150);
    expect(refusal()).toBe('NOT_IN_PLAY');
    sim.dead = false;
    jailSeat(room, h.id, h.id);
    handleLedgerRead(room, h.id, { propId: LEDGER });
    await sleep(150);
    expect(refusal()).toBe('IN_JAIL');
    expect(ledgers(h)).toEqual([]);
  });

  it('fills from the deliveries: a delivery’s rent strike is a row', async () => {
    const party = await day();
    const room = party.room;
    const [a] = npcIdsOf('S1') as [string];
    for (const [id, p] of room.state.players) p.look = id === a ? 'baker' : 'x';
    const kinds = balance.hardship.kinds as string[];
    const saved = [...kinds];
    kinds.splice(0, kinds.length, 'rent');
    try {
      onDeliveryHardship(room, room.state.round);
    } finally {
      kinds.splice(0, kinds.length, ...saved);
    }
    await readThrough(party, party.humans[0]!);
    expect(ledgers(party.humans[0]!)[0]!.rows).toEqual([{ day: room.state.round, lookId: 'baker' }]);
  });
});

describe('NPC seats read the ledger too (seams.md 3 row 37, 6)', () => {
  it('draws nothing before the Hitman’s line while `before` is 0, so no stream moves', async () => {
    const party = await day();
    const [npc] = npcIdsOf('S1') as [string];
    let draws = 0;
    drawLedgerRead(party.room, npc, () => (draws++, 0));
    expect(draws).toBe(0);
    expect(goesToReadLedger(party.room, npc)).toBe(false);
  });

  it('after the line, a seat that owes nothing walks to the books and stands there holding nothing', async () => {
    const [npc] = npcIdsOf('S1') as [string];
    const party = await day();
    const room = party.room;
    for (const [seat, p] of simOf(room).players) p.dead = seat !== npc && seat !== party.humans[0]!.id;
    const st = stationOf(party, LEDGER);
    const player = room.state.players.get(npc)!;
    player.priv.inventory.slots.clear();
    expect(workable(room, player, st)).toBe(false); // owes nothing, reads nothing: the books are no station
    forceArrival(room, room.state.round, true);
    onDeliveryArrival(room, room.state.round); // the line goes out
    read.after = 1;
    drawLedgerRead(room, npc, () => 0);
    expect(workable(room, player, st)).toBe(true);
    Object.assign(weights.day, { work: 1, stroll: 0, idle: 0 });
    npcMemory(room).brain(npc).persona = { home: 'tavern_bar', favourites: [] };
    read.after = 0; // no second trip
    let stood = false;
    let held = false;
    advance(party, 180 * TICK_RATE, () => {
      const p = simOf(room).players.get(npc)!;
      if (
        npcMemory(room).brain(npc).act?.stationId === LEDGER &&
        npcMemory(room).brain(npc).act?.kind === 'work'
      )
        stood = true;
      if (p.hold !== null && p.hold.targetId === LEDGER) held = true;
    });
    expect(stood).toBe(true);
    expect(held).toBe(false); // a reader runs no errand hold: it owes nothing
    expect(goesToReadLedger(room, npc)).toBe(false); // one read per draw
    addFare(room, npc);
    expect(workable(room, player, st)).toBe(true); // an owing seat's errand is unchanged (C2b)
  });
});
