import type { StepContext } from '@colyseus/core';
import type { PartyRoom } from '../rooms/PartyRoom';
import { VIEW_RECONCILE_EVERY_TICKS } from '@wdi/shared';
import { runCommands } from './Commands';
import { reconcileViews } from './Visibility';

// Fixed order inside setFixedTimestep (ARCHITECTURE 5.6). Stages without a milestone yet are empty.
const applyInputs = (_room: PartyRoom): void => {}; // M2: one input per client, newest wins
const moveAndCollide = (_room: PartyRoom): void => {}; // M2: swept AABB, 250 ms position ring
const runPortals = (_room: PartyRoom): void => {}; // M2: synchronous transit
const runAiAndHazards = (_room: PartyRoom): void => {}; // M5: wolves, decay, clue GC
const checkPhaseAndWin = (_room: PartyRoom): void => {}; // M3: phase timers, checkWin

export function step(room: PartyRoom, _ctx: StepContext): void {
  room.state.tick++;
  applyInputs(room);
  moveAndCollide(room);
  runCommands(room);
  runPortals(room);
  runAiAndHazards(room);
  if (room.state.tick % VIEW_RECONCILE_EVERY_TICKS === 0) reconcileViews(room);
  checkPhaseAndWin(room);
}
