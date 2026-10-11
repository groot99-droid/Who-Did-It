import type { StepContext } from '@colyseus/core';
import type { PartyRoom } from '../rooms/PartyRoom';
import { VIEW_RECONCILE_EVERY_TICKS } from '@wdi/shared';
import { runDebugStart } from '../rooms/handlers/movement';
import { runCommands } from './Commands';
import { applyInputs, moveAndCollide } from './Movement';
import { placeNewPlayers, runPortals } from './Portals';
import { simOf } from './RoomSim';
import { reconcileViews } from './Visibility';

// Fixed order inside setFixedTimestep (ARCHITECTURE 5.6). Stages without a milestone yet are empty.
const runAiAndHazards = (_room: PartyRoom): void => {}; // M5: wolves, decay, clue GC
const checkPhaseAndWin = (_room: PartyRoom): void => {}; // M3: phase timers, checkWin

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
  applyInputs(room);
  moveAndCollide(room);
  runCommands(room);
  runPortals(room);
  runAiAndHazards(room);
  const sim = simOf(room);
  if (room.state.tick % VIEW_RECONCILE_EVERY_TICKS === 0 || sim.viewsDirty) {
    sim.viewsDirty = false;
    reconcileViews(room);
  }
  checkPhaseAndWin(room);
}
