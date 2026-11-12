import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, interactions } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import { addStack, count } from '../src/sim/Inventory';
import { otherAt, workable } from '../src/sim/npc/chores';
import { npcMemory } from '../src/sim/npc/memory';
import { type Station, stationsOf } from '../src/sim/npc/routine';
import { mapScenesOf } from '../src/sim/MapSites';
import { simOf } from '../src/sim/RoomSim';
import { isVerbPhase } from '../src/sim/World';
import {
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  npcIdsOf,
  placeSeat,
  standardParty,
} from './npcHelpers';

// Round 10 (D2; GDD 3.12 "Chores", 3.14; owner answer LT7): an NPC's gather takes real stock, and every pile comes back.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());
vi.setConfig({ testTimeout: 30_000 });

const PILE = 'fo.woodpile';
type Weights = { work: number; stroll: number; idle: number };
const weights = balance.npc.routine.weights as { day: Weights };
const savedDay = { ...weights.day };
afterEach(() => void Object.assign(weights.day, savedDay));

describe('depletion', () => {
  it('every pile of the logic table comes back, and only a nailed crate and a picked lock stay open', () => {
    for (const [id, it] of Object.entries(interactions.interactions)) {
      if (it.after === undefined) continue;
      const stays = it.after.respawnS === null;
      expect(stays, id).toBe(
        ['crateNailed', 'lockedDoor', 'containerOpen', 'containerLocked'].includes(it.target),
      );
    }
  });

  it('an NPC chops a pile for real: the pile stays cut, then returns and is a station again', async () => {
    const party = await standardParty(colyseus, 'S1');
    allTownsfolk(party.room);
    const [id] = npcIdsOf('S1') as [string];
    const human = party.humans[0]!.id;
    for (const [seat, p] of simOf(party.room).players) p.dead = seat !== id && seat !== human;
    const st: Station = stationsOf(mapScenesOf(party.room), simOf(party.room).profile).find(
      (s) => s.propId === PILE,
    )!;
    placeSeat(party, id, st.scene, st.stands[0]!.x, st.stands[0]!.y);
    placeSeat(party, human, 'chapel', 4, 4);
    const seat = party.room.state.players.get(id)!;
    seat.priv.inventory.slots.clear();
    Object.assign(weights.day, { work: 1, stroll: 0, idle: 0 });
    npcMemory(party.room).brain(id).persona = { home: 'tavern_bar', favourites: [PILE] };
    holdPhase(party, Phase.day, 3600);
    expect(workable(party.room, seat, st)).toBe(false); // bare hands do not chop
    addStack(seat, 'axe', 1);
    expect(workable(party.room, seat, st)).toBe(true);
    for (let i = 0; i < 90 * TICK_RATE && count(seat, 'logs') === 0; i++) advance(party, 1);
    expect(count(seat, 'logs')).toBeGreaterThanOrEqual(2);
    const states = party.room.state.scenes.get(st.scene)!.propStates;
    expect(states.get(PILE)?.state).toBe('cut');
    expect(workable(party.room, seat, st)).toBe(false);
    const respawnS = interactions.interactions.chopLumber!.after!.respawnS!;
    // The seat's routine would chop the returned pile again before the check; stop it at the first chop.
    npcMemory(party.room).routine = false;
    simOf(party.room).players.get(id)!.hold = null;
    holdPhase(party, Phase.day, 3600);
    advance(party, respawnS * TICK_RATE + 1);
    // One assertion per condition of `workable`, so a failure names the one that flipped.
    const body = party.room.state.players.get(id)!.priv.body;
    const why = `phase ${party.room.state.phase}, hp ${body?.hp}, dead ${simOf(party.room).players.get(id)!.dead}`;
    expect(isVerbPhase(party.room.state.phase), `verb phase (${why})`).toBe(true);
    expect(states.has(PILE), `pile back (${why})`).toBe(false);
    expect(count(seat, 'axe'), `axe held (${why})`).toBe(1);
    expect(otherAt(party.room, id, PILE), `another seat holds the pile (${why})`).toBe(false);
    expect(workable(party.room, seat, st), `workable (${why})`).toBe(true);
  });
});
