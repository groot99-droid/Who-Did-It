import type { StepContext } from '@colyseus/core';
import type { PartyRoom } from '../rooms/PartyRoom';
import { VIEW_RECONCILE_EVERY_TICKS } from '@wdi/shared';
import { runDebugStart } from '../rooms/handlers/movement';
import { runDecay } from './Clues';
import { runCommands } from './Commands';
import { runConductor } from './Conductor';
import { runNpcs } from './Npc';
import { applyInputs, moveAndCollide } from './Movement';
import { runPhases } from './Phases';
import { placeNewPlayers, runPortals } from './Portals';
import { simOf } from './RoomSim';
import { reconcileViews } from './Visibility';

// Fixed order inside setFixedTimestep (ARCHITECTURE 5.6). Stages without a milestone yet are empty.
const runAiAndHazards = (room: PartyRoom): void => runDecay(room); // M3: clue decay and cap; M5: wolves

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
  runNpcs(room); // M3c: NPC brains write their inputs and verbs (round 4, S)
  applyInputs(room);
  moveAndCollide(room);
  runCommands(room);
  runPortals(room);
  runConductor(room); // M3b: the quick-mode night (round 4, R)
  runAiAndHazards(room);
  const sim = simOf(room);
  if (room.state.tick % VIEW_RECONCILE_EVERY_TICKS === 0 || sim.viewsDirty) {
    sim.viewsDirty = false;
    reconcileViews(room);
  }
  runPhases(room);
}
