import type { PartyRoom } from '../rooms/PartyRoom';

/**
 * Phase timers, meeting requests, deaths, checkWin and game over (GDD 3.3, 3.8), run last in the
 * step. Session K fills this in; the stage is wired in `Step.ts` so no session edits the step order.
 * The role-card timer stays in `rooms/handlers/lobby.ts` (`runLobbyPhase`).
 */
export function runPhases(_room: PartyRoom): void {}
