import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { routines } from '@wdi/content';
import { Phase, TICK_RATE } from '@wdi/shared';
import { mapScenesOf } from '../src/sim/MapSites';
import { npcMemory } from '../src/sim/npc/memory';
import { stationsOf } from '../src/sim/npc/routine';
import { simOf } from '../src/sim/RoomSim';
import { vendettaGoalFor } from '../src/sim/vendettas/goal';
import { progressOf } from '../src/sim/vendettas/progress';
import { holdVendetta } from '../src/sim/vendettas/state';
import { sceneKey } from '../src/sim/World';
import {
  advance,
  allTownsfolk,
  bootNpcServer,
  holdPhase,
  npcIdsOf,
  placeSeat,
  setRole,
  standardParty,
} from './npcHelpers';

// GDD 3.20 "NPC Killers" (round 7; docs/round7/vendettas.md 2): an NPC Killer's brain reads `vendettaGoalFor` as one
// more place to work under its routine weights. The Vicar is the AFK human, so its scene stays put.

let colyseus: ColyseusTestServer;
let release: () => Promise<void>;
beforeAll(async () => {
  ({ colyseus, release } = await bootNpcServer());
});
afterAll(async () => release());
beforeEach(async () => colyseus.cleanup());

describe('NPC Killer vendetta goal', () => {
  it('sends every work trip of a Zealot NPC to the Vicar scene, and none once the vendetta is over', async () => {
    const party = await standardParty(colyseus, 'S1');
    const room = party.room;
    allTownsfolk(room);
    const sim = simOf(room);
    const vicar = party.humans[0]!.id;
    const killer = npcIdsOf('S1')[0]!;
    setRole(room, vicar, 'vicar');
    setRole(room, killer, 'killer');
    holdVendetta(room, killer, 'zealot');

    const here = sceneKey(sim.players.get(killer)!.sceneIdx);
    const day = stationsOf(mapScenesOf(room), sim.profile).filter(
      (st) => routines.activities[st.activity]?.phases.includes('day') && st.scene !== here,
    );
    const target = day.find((st) => day.filter((o) => o.scene === st.scene).length >= 2) ?? day[0]!;
    const stand = target.stands[0]!;
    placeSeat(party, vicar, target.scene, stand.x, stand.y);
    holdPhase(party, Phase.day, 600);
    expect(vendettaGoalFor(room, killer)).toEqual({ sceneId: target.scene, targetSeat: vicar });

    const sceneOf = new Map(stationsOf(mapScenesOf(room), sim.profile).map((st) => [st.propId, st.scene]));
    const brain = npcMemory(room).brain(killer);
    // `hold` keeps the doubt unsown (45 s together would end the goal, GDD 3.20), so the goal stands all along.
    const trips = (hold: boolean): Set<string> => {
      const seen = new Set<string>();
      advance(party, 120 * TICK_RATE, () => {
        if (hold) progressOf(room, killer).sharedTicks = 0;
        if (brain.act?.kind === 'travel') seen.add(brain.act.stationId);
      });
      return seen;
    };

    const toward = trips(true);
    expect(toward.size).toBeGreaterThan(0);
    for (const id of toward) expect(sceneOf.get(id)).toBe(target.scene);

    progressOf(room, killer).over = true;
    expect(vendettaGoalFor(room, killer)).toBeNull();
    holdPhase(party, Phase.day, 600);
    const after = trips(false);
    expect([...after].some((id) => sceneOf.get(id) !== target.scene)).toBe(true);
  }, 60_000);
});
