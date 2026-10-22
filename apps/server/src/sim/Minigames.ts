import { ErrorCode } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { reject } from './World';

/**
 * Main-mode mini-games (round 6, M5b, GDD 3.16; docs/round6/m5b-data.md 2.3): a station task's hold sends
 * `minigameStart` with a puzzle from `rules/minigames.ts generate`, the server keeps the solution in room memory,
 * `minigame.result` is checked with `check` and completes the task; a Cabal seat's fake task runs the same puzzle and
 * never moves the task bar. Pre-seeded by 6Z; Session 6H fills it.
 */

/** `minigame.result {taskId, answer}` (locked call site in `sim/Commands.ts`). Refuses until 6H. */
export function handleMinigameResult(
  room: PartyRoom,
  sessionId: string,
  _payload: Record<string, unknown>,
): void {
  reject(room, sessionId, ErrorCode.cannot, 'cannot do that'); // 6H
}
