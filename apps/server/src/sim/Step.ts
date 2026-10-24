import type { StepContext } from '@colyseus/core';
import type { PartyRoom } from '../rooms/PartyRoom';
import { VIEW_RECONCILE_EVERY_TICKS } from '@wdi/shared';
import { runDebugStart } from '../rooms/handlers/movement';
import { publishAvatars } from './Avatars';
import { runDecay } from './Clues';
import { runAuto } from './auto/Auto';
// Round 8, 8E: before the vendettas, so `figureNotSeat` registers ahead of 7H's checks (their test pins them last).
import { runTownsfolk } from './townsfolk/run';
import { runEvents } from './events/bus';
import { runEconomy } from './economy/run';
import './tasks/invariants'; // round 7, 7M: the taskBar invariant's host (locked line, granted by 6Z; above 7H's so its four stay last)
import { runVendettas } from './vendettas/run';
import { runMemorial } from './Memorial';
import { runMobs } from './Mobs';
import { runQuests } from './Quests';
import { runResources } from './Resources';
import { runTrain } from './Train';
import { runCommands } from './Commands';
import { runHunger } from './Hunger';
import { runImpersonation } from './Impersonate';
import { runNpcs } from './Npc';
import { applyInputs, moveAndCollide } from './Movement';
import { runNightPowers } from './NightPowers';
import { runPhases } from './Phases';
import { placeNewPlayers, runPortals } from './Portals';
import { simOf } from './RoomSim';
import { reconcileViews } from './Visibility';

// Fixed order inside setFixedTimestep (ARCHITECTURE 5.6). Stages without a milestone yet are empty.
// Round 6 (docs/round6/seams.md 1.3, locked call sites): `runAuto` before the brains; `runResources`, `runMobs` and
// `runQuests` in the old `runAiAndHazards` slot after the clue decay; `runEvents` after the phases. Round 7: `runTrain`
// after `runEvents`, so the Train's events reach the bus on the next tick; then `runVendettas` (7H) and `runMemorial`.

/** Keeps one PlayerSim per seated player and places newcomers when the match is on. */
function syncRoster(room: PartyRoom): void {
  const sim = simOf(room);
  for (const id of room.state.players.keys()) sim.ensure(id);
  for (const id of sim.players.keys()) {
    if (!room.state.players.has(id)) {
      sim.players.delete(id);
      sim.views.delete(id);
    }
  }
  placeNewPlayers(room);
}

export function step(room: PartyRoom, _ctx: StepContext): void {
  room.state.tick++;
  runDebugStart(room);
  syncRoster(room);
  runAuto(room); // round 6, 6A: the auto commands, Start inside the step (locked call site)
  runNpcs(room); // M3c: NPC brains write their inputs and verbs (round 4, S)
  runTownsfolk(room); // round 8, 8E: ambient figures' brains write their inputs (locked call site)
  applyInputs(room);
  moveAndCollide(room);
  publishAvatars(room); // round 5, 5F: presence onto avatars (locked call site)
  runCommands(room);
  runImpersonation(room); // round 5, 5F (locked call site)
  runNightPowers(room); // round 5, 5G: night powers, aims, Inherit (locked call site)
  runPortals(room);
  runDecay(room); // M3: clue decay and cap
  runResources(room); // round 6, 6F (locked call site)
  runMobs(room); // round 6, 6G (locked call site)
  runQuests(room); // round 6, 6H (locked call site)
  runHunger(room); // round 5, 5G (locked call site)
  const sim = simOf(room);
  if (room.state.tick % VIEW_RECONCILE_EVERY_TICKS === 0 || sim.viewsDirty) {
    sim.viewsDirty = false;
    reconcileViews(room);
  }
  runPhases(room);
  runEvents(room); // round 6, 6B: deliver the tick's sim events (locked call site)
  runTrain(room); // round 7, 7I: the Daily Train (locked call site)
  runVendettas(room); // round 7, 7H: the vendettas' watched goals (GDD 3.20)
  runMemorial(room); // round 7, 7I: the Vicar's memorial, bus listeners registered once (locked call site)
  runEconomy(room); // round 8, 8C: purses, shops, bank; 8D's loops inside sim/economy (locked call site)
}
