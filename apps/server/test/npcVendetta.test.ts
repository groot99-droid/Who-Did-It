import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ColyseusTestServer } from '@colyseus/testing';
import { routines, scenes } from '@wdi/content';
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
  it('walks a Zealot NPC to the Vicar scene one dwell at a time, and lets it roam once the vendetta is over', async () => {
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
    // A goal two or more scenes away, so the walk has to pass through a scene on the way.
    const next = new Set(scenes[here].portals.map((q) => q.to).filter((to): to is string => to !== null));
    const far = day.filter((st) => !next.has(st.scene));
    const target = far.find((st) => far.filter((o) => o.scene === st.scene).length >= 2) ?? far[0]!;
    const stand = target.stands[0]!;
    placeSeat(party, vicar, target.scene, stand.x, stand.y);
    holdPhase(party, Phase.day, 900);
    expect(vendettaGoalFor(room, killer)).toEqual({ sceneId: target.scene, targetSeat: vicar });

    const sceneOf = new Map(stationsOf(mapScenesOf(room), sim.profile).map((st) => [st.propId, st.scene]));
    const brain = npcMemory(room).brain(killer);
    const p = sim.players.get(killer)!;
    // `hold` keeps the doubt unsown (45 s together would end the goal, GDD 3.20), so the goal stands all along.
    const run = (seconds: number, hold: boolean) => {
      const trips = new Set<string>();
      const stays: number[] = [];
      let scene = p.sceneIdx;
      let entered = room.state.tick;
      let reached = -1;
      advance(party, seconds * TICK_RATE, (tick) => {
        if (hold) progressOf(room, killer).sharedTicks = 0;
        if (brain.act?.kind === 'travel') trips.add(brain.act.stationId);
        if (p.sceneIdx !== scene) {
          if (brain.mode === 'routine') stays.push(tick - entered);
          scene = p.sceneIdx;
          entered = tick;
        }
        if (reached < 0 && sceneKey(p.sceneIdx) === target.scene) reached = tick;
      });
      return { trips, stays, reached };
    };

    // Toward the goal one scene at a time, never leaving a scene before its dwell (no T6 tell), then at work there.
    // The seat has just arrived where it stands: a fresh 40 s dwell, which a trip must wait out like any routine.
    brain.sceneDwellUntilTick = room.state.tick + 40 * TICK_RATE;
    const toward = run(300, true);
    expect(toward.reached).toBeGreaterThan(0);
    for (const stay of toward.stays) expect(stay).toBeGreaterThanOrEqual(600);
    expect([...toward.trips].some((id) => sceneOf.get(id) === target.scene)).toBe(true);

    progressOf(room, killer).over = true;
    expect(vendettaGoalFor(room, killer)).toBeNull();
    holdPhase(party, Phase.day, 600);
    const after = run(240, false);
    expect([...after.trips].some((id) => sceneOf.get(id) !== target.scene)).toBe(true);
  }, 120_000);
});
