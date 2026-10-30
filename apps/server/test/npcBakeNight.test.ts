import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { balance, routines } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import { mapScenesOf } from '../src/sim/MapSites';
import { npcMemory } from '../src/sim/npc/memory';
import { litAtNight, type Station, stationsOf } from '../src/sim/npc/routine';
import { simOf } from '../src/sim/RoomSim';
import {
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  npcIdsOf,
  placeSeat,
  standardParty,
} from './npcHelpers';

// Round 10 (x13, A433; GDD 3.12 "Stations"): the bakery's stations are the `bake` activity, open by day and by night,
// so an NPC in one of Crumb's lit rooms works through the night as a person baking would (the R6 audit's first cut).

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => ({ colyseus, release } = await bootNpcServer()));
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());
vi.setConfig({ testTimeout: 30_000 });

const ROOMS = ['crumb_oven', 'crumb_mixing', 'crumb_proofing', 'crumb_cold'] as const;
const BAKE_KINDS = new Set(routines.activities.bake?.kinds ?? []);

/** One NPC's work visits over `ticks` steps: the station of every tick whose act is `work`. */
function workVisits(
  party: Awaited<ReturnType<typeof standardParty>>,
  ids: readonly string[],
  ticks: number,
): Map<string, string[]> {
  const mem = npcMemory(party.room);
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  advance(party, ticks, () => {
    for (const id of ids) {
      const act = mem.brain(id).act;
      if (act?.kind === 'work') out.get(id)!.push(act.stationId);
    }
  });
  return out;
}

describe('NPC night baking (x13)', () => {
  it('an NPC in a lit bakery room works its station through the night, and only stations open at night in lit scenes', async () => {
    const party = await standardParty(colyseus, 'S1');
    allTownsfolk(party.room);
    const sim = simOf(party.room);
    const stations = stationsOf(mapScenesOf(party.room), sim.profile);
    const byId = new Map(stations.map((s) => [s.propId, s]));
    const bakers = npcIdsOf('S1').slice(0, ROOMS.length);
    holdPhase(party, Phase.night, 900);
    // One baker per room, standing on its station's floor tile, as an arrival with a fresh scene dwell (world.ts).
    const posts: Station[] = ROOMS.map((room) =>
      stations.find((s) => s.scene === room && BAKE_KINDS.has(s.kind))!,
    );
    for (const st of posts) expect(st, 'a bake station in each room').toBeDefined();
    bakers.forEach((id, i) =>
      placeSeat(party, id, ROOMS[i]!, posts[i]!.stands[0]!.x, posts[i]!.stands[0]!.y),
    );
    advance(party, 2);
    for (const id of bakers) {
      const brain = npcMemory(party.room).brain(id);
      brain.act = null;
      brain.pauseUntilTick = -1;
      brain.placementIdleUntilTick = -1;
      brain.sceneDwellUntilTick = party.room.state.tick + balance.npc.routine.sceneDwellS.max * TICK_RATE;
    }
    const visits = workVisits(party, bakers, 120 * TICK_RATE);
    // Fails on the base: `work` is day-only there, so no bakery station opens at night and no visit is recorded.
    const baked = bakers.filter((id) =>
      visits.get(id)!.some((propId) => BAKE_KINDS.has(byId.get(propId)?.kind ?? '')),
    );
    expect(baked.length, 'bakers that worked a bakery station by night').toBeGreaterThanOrEqual(1);
    // Every night work visit, whatever the station, is at an activity open at night and in a lit scene (GDD 3.12 "Night").
    for (const id of bakers) {
      for (const propId of new Set(visits.get(id)!)) {
        const st = byId.get(propId)!;
        expect(routines.activities[st.activity]?.phases, `${id} at ${propId}`).toContain('night');
        expect(litAtNight(st.scene), `${id} at ${propId} in ${st.scene}`).toBe(true);
      }
    }
  });

  it('by day the same stations are open, so the bakery is worked around the clock', () => {
    expect(routines.activities.bake?.phases).toEqual(['day', 'night']);
    expect(routines.activities.work?.phases).toEqual(['day']);
    for (const kind of ['coldShelves', 'doughMixer', 'brickOven', 'proofingCabinet']) {
      expect(BAKE_KINDS.has(kind), kind).toBe(true);
      expect(routines.activities.work?.kinds, kind).not.toContain(kind);
    }
  });
});
