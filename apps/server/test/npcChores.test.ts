import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, economy } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import { balanceOf } from '../src/sim/economy/purse';
import { handleHold } from '../src/sim/Hold';
import { addStack, count } from '../src/sim/Inventory';
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

// Round 10 (D1; GDD 3.12 "Chores", living-world.md 1.8): an NPC seat is never idle. It idles only between actions, it
// gathers with the verb a human uses, it sells only what it holds, and nothing waits on it.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());
vi.setConfig({ testTimeout: 30_000 });

const RUBBLE = 'cg.rubble_0';
const MARKET = 'ov.shop_market';
const { routine } = balance.npc;
type Weights = { work: number; stroll: number; idle: number };
const weights = routine.weights as { day: Weights };
const savedDay = { ...weights.day };
afterEach(() => void Object.assign(weights.day, savedDay));

function stationOf(party: Party, propId: string): Station {
  return stationsOf(mapScenesOf(party.room), simOf(party.room).profile).find((s) => s.propId === propId)!;
}

/** One NPC alive (and the human), working only, its favourite `propId`, standing on the station's first stand. */
async function oneAt(propId: string): Promise<{ party: Party; id: string; st: Station }> {
  const party = await standardParty(colyseus, 'S1');
  allTownsfolk(party.room);
  const [id] = npcIdsOf('S1') as [string];
  const human = party.humans[0]!.id;
  for (const [seat, p] of simOf(party.room).players) p.dead = seat !== id && seat !== human;
  const st = stationOf(party, propId);
  placeSeat(party, id, st.scene, st.stands[0]!.x, st.stands[0]!.y);
  placeSeat(party, human, 'chapel', 4, 4);
  party.room.state.players.get(id)!.priv.inventory.slots.clear();
  Object.assign(weights.day, { work: 1, stroll: 0, idle: 0 });
  npcMemory(party.room).brain(id).persona = { home: 'tavern_bar', favourites: [propId] };
  holdPhase(party, Phase.day, 3600);
  return { party, id, st };
}

describe('never idle', () => {
  it('stands still only between actions, for at most idleS', async () => {
    const party = await standardParty(colyseus, 'S1');
    allTownsfolk(party.room);
    holdPhase(party, Phase.day, 700);
    // The placement idle (GDD 3.12, `npc.react.afterPlacementIdleS`) runs first.
    advance(party, (balance.npc.react.afterPlacementIdleS.max + 1) * TICK_RATE);
    const sim = simOf(party.room);
    const mem = npcMemory(party.room);
    const still = new Map<string, number>();
    const at = new Map<string, string>();
    const cap = routine.idleS.max * TICK_RATE + 2;
    advance(party, 600 * TICK_RATE, (tick) => {
      for (const id of npcIdsOf('S1')) {
        const p = sim.players.get(id)!;
        const where = `${p.sceneIdx}:${p.x}:${p.y}`;
        const stands =
          at.get(id) === where &&
          p.hold === null &&
          mem.brain(id).mode === 'routine' &&
          tick >= p.busyUntilTick;
        still.set(id, stands ? (still.get(id) ?? 0) + 1 : 0);
        expect(still.get(id), `${id}@${tick}`).toBeLessThanOrEqual(cap);
        at.set(id, where);
      }
    });
  });
});

describe('chores through the human verbs', () => {
  it('breaks rubble by hand through the logic table, and the cleared pile is no station until it returns', async () => {
    const { party, id, st } = await oneAt(RUBBLE);
    const seat = party.room.state.players.get(id)!;
    const p = simOf(party.room).players.get(id)!;
    expect(workable(party.room, seat, st)).toBe(true);
    let held = '';
    for (let i = 0; i < 40 * TICK_RATE && count(seat, 'stone') === 0; i++)
      advance(party, 1, () => void (p.hold && (held = p.hold.action)));
    expect(held).toBe('interact');
    expect(count(seat, 'stone')).toBe(1);
    expect(party.room.state.scenes.get(st.scene)!.propStates.get(RUBBLE)?.state).toBe('cleared');
    expect(workable(party.room, seat, st)).toBe(false);
  });

  it('sells at a counter only what it holds, and an empty pack never walks to one', async () => {
    const { party, id, st } = await oneAt(MARKET);
    const seat = party.room.state.players.get(id)!;
    expect(workable(party.room, seat, st)).toBe(false);
    addStack(seat, 'stone', 2);
    addStack(seat, 'logs', 1); // the market does not buy logs
    expect(workable(party.room, seat, st)).toBe(true);
    const purse = balanceOf(party.room, id);
    for (let i = 0; i < 40 * TICK_RATE && count(seat, 'stone') > 0; i++) advance(party, 1);
    expect(count(seat, 'stone')).toBe(0);
    expect(count(seat, 'logs')).toBe(1);
    expect(balanceOf(party.room, id) - purse).toBe(2 * economy.prices.stone!.pay!);
    expect(workable(party.room, seat, st)).toBe(false);
  });
});

describe('nothing waits on an NPC seat', () => {
  it('leaves a prop another seat works after a pause, never on the same tick, and none picks it meanwhile', async () => {
    const { party, id, st } = await oneAt(RUBBLE);
    const human = party.humans[0]!.id;
    const brain = npcMemory(party.room).brain(id);
    const p = simOf(party.room).players.get(id)!;
    advance(party, 1);
    while (brain.act?.kind !== 'work') advance(party, 1);
    if (p.hold !== null) handleHold(party.room, id, { action: 'interact', targetId: RUBBLE, on: false });
    placeSeat(party, human, st.scene, st.stands[1]!.x, st.stands[1]!.y);
    handleHold(party.room, human, { action: 'interact', targetId: RUBBLE, on: true });
    expect(simOf(party.room).players.get(human)!.hold?.action).toBe('interact');
    expect(workable(party.room, party.room.state.players.get(id)!, st)).toBe(false);
    const from = party.room.state.tick;
    let left = -1;
    advance(party, 4 * TICK_RATE, (tick) => {
      expect(p.hold?.targetId, `${tick}`).not.toBe(RUBBLE);
      if (left < 0 && brain.act?.stationId !== RUBBLE) left = tick;
    });
    expect(left - from).toBeGreaterThanOrEqual(routine.workPauseS.min * TICK_RATE);
    expect(left - from).toBeLessThanOrEqual(routine.workPauseS.max * TICK_RATE + 2);
  });
});
