import { balance, minigames, onubBalance, scenes, tasks } from '@wdi/content';
import {
  ErrorCode,
  LedgerLine,
  Phase,
  S2C,
  TICK_RATE,
  TILE_PX,
  checkMinigame,
  generateMinigame,
  type MinigameBases,
  type MinigamePuzzle,
  type PlayerState,
} from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { type PlayerSim, simOf } from './RoomSim';
import { count, take } from './standInInventory';
import { isLoft, isVerbPhase, reject, sceneKey, tileCentre } from './World';

/**
 * Main-mode mini-games (round 6, M5b, GDD 3.16; docs/round6/m5b-data.md 2.3): a station task's `task` hold sends
 * `minigameStart` with a puzzle from `rules/minigames.ts generateMinigame`, the server keeps it in room memory,
 * `minigame.result` is checked with `checkMinigame` and completes the task; a Cabal seat's fake task runs the same
 * puzzle and never moves the task bar. Session 6H.
 */

interface Open {
  taskId: string;
  puzzle: MinigamePuzzle;
  startTick: number;
}

/** The open puzzles of the match, keyed by the match's `MatchSeeds` (a new object at every Start), then by seat. */
const opens = new WeakMap<object, Map<string, Open>>();

function openOf(room: PartyRoom): Map<string, Open> {
  let m = opens.get(room.seeds);
  if (!m) opens.set(room.seeds, (m = new Map()));
  return m;
}

/** The numbers the four kinds take from the ONUB stations (GDD 3.11); the rules file cannot import content. */
function basesFromOnub(): MinigameBases {
  const spec = (kind: string) =>
    onubBalance.stations.find((s) => s.minigame.kind === kind)?.minigame as never;
  return {
    crates: spec('crates'),
    pour: spec('pour'),
    slide: spec('slide'),
    stoke: spec('stoke'),
  };
}

type Problem = { code: ErrorCode; msg: string };

/** Why this seat cannot work `taskId` now, or null: the checks that start a mini-game and that finish it. */
function taskProblem(
  room: PartyRoom,
  p: PlayerSim | undefined,
  player: PlayerState,
  taskId: string,
): Problem | null {
  if (!isVerbPhase(room.state.phase)) return { code: ErrorCode.wrongPhase, msg: 'not now' };
  if (!p || p.dead || !p.placed || isLoft(p.sceneIdx)) return { code: ErrorCode.cannot, msg: 'not now' };
  if (room.state.tick < p.busyUntilTick) return { code: ErrorCode.busy, msg: 'busy' };
  const entry = player.priv.tasks.find((t) => t.id === taskId);
  const task = tasks.tasks[taskId];
  if (!entry || entry.done || !task || task.kind !== 'fetch')
    return { code: ErrorCode.cannot, msg: 'not your task' };
  if (task.nightOnly && room.state.phase !== Phase.night && room.state.phase !== Phase.finalNight) {
    return { code: ErrorCode.wrongPhase, msg: 'only at night' };
  }
  const here = sceneKey(p.sceneIdx);
  const reach = balance.doors.reachTiles * TILE_PX;
  const atTarget = task.targets.some((t) => {
    const prop = t.scene === here ? scenes[here]?.props.find((q) => q.id === t.prop) : undefined;
    return (
      prop !== undefined &&
      Math.hypot(p.x - tileCentre(prop.x, TILE_PX), p.y - tileCentre(prop.y, TILE_PX)) <= reach
    );
  });
  if (!atTarget) return { code: ErrorCode.outOfRange, msg: 'too far' };
  // A fake task (a Cabal seat's alibi list) needs no deliverable; a real one carries it to the node.
  if (!entry.fake && task.tool !== undefined && count(player, task.tool) < (task.toolQty ?? 1))
    return { code: ErrorCode.cannot, msg: 'you lack the tool' };
  return null;
}

/**
 * `act.hold {action: 'task', targetId: taskId, on: true}` (call site in `sim/Hold.ts`): opens the task's mini-game.
 * The hold itself is the opener (GDD 3.16), so there is no timer; pressing again opens a fresh puzzle.
 */
export function handleTaskHold(room: PartyRoom, sessionId: string, taskId: string): void {
  const player = room.state.players.get(sessionId);
  const p = simOf(room).players.get(sessionId);
  const def = Object.values(minigames.minigames).find((m) => m.task === taskId);
  if (!player || !p) return;
  const problem = def
    ? taskProblem(room, p, player, taskId)
    : { code: ErrorCode.cannot, msg: 'cannot do that' };
  if (problem || !def) {
    reject(room, sessionId, problem?.code ?? ErrorCode.cannot, problem?.msg ?? 'cannot do that');
    return;
  }
  // The puzzle is the seat's own business: a stream keyed by seat, shared with nothing public (`sim/seeds.ts`).
  const rng = room.seeds.get('contract', `minigame:${sessionId}`);
  const puzzle = generateMinigame(def.kind, def.difficulty, rng, basesFromOnub());
  openOf(room).set(sessionId, { taskId, puzzle, startTick: room.state.tick });
  room.clients
    .getById(sessionId)
    ?.send(S2C.minigameStart, { taskId, kind: puzzle.kind, public: puzzle.public });
}

/** The global bar: finished real tasks over all real tasks; a ghost's finished ones count up to `ghostShareCap`. */
export function recomputeTaskBar(room: PartyRoom): void {
  let total = 0;
  let done = 0;
  let ghostDone = 0;
  for (const [id, player] of room.state.players) {
    const ghost = simOf(room).players.get(id)?.dead === true;
    for (const t of player.priv?.tasks ?? []) {
      if (t.fake) continue;
      total++;
      if (t.done) ghost ? ghostDone++ : done++;
    }
  }
  if (total === 0) return;
  const counted = done + Math.min(ghostDone, balance.tasks.ghostShareCap * total);
  room.state.taskBar = Math.min(100, Math.floor((100 * counted) / total));
}

function complete(
  room: PartyRoom,
  sessionId: string,
  player: PlayerState,
  p: PlayerSim,
  taskId: string,
): void {
  const entry = player.priv.tasks.find((t) => t.id === taskId);
  const task = tasks.tasks[taskId];
  if (!entry || !task) return;
  if (!entry.fake && task.tool !== undefined) take(player, task.tool, task.toolQty ?? 1);
  entry.done = true;
  // The Claimed alibi entry of GDD 3.5: the time and the scene, written for a fake task exactly as for a real one.
  const line = new LedgerLine();
  line.sceneId = p.sceneIdx;
  line.tick = room.state.tick;
  player.priv.ledger.push(line);
  if (!entry.fake) recomputeTaskBar(room);
  openOf(room).delete(sessionId);
}

/**
 * `minigame.result {taskId, answer}` (locked call site in `sim/Commands.ts`): a right answer completes the task, a wrong
 * one completes nothing and the puzzle stays open. `{assist: true}` is the Done control, accepted once the puzzle has
 * been open for its `assistS` (GDD 3.16).
 */
export function handleMinigameResult(
  room: PartyRoom,
  sessionId: string,
  payload: Record<string, unknown>,
): void {
  const player = room.state.players.get(sessionId);
  const p = simOf(room).players.get(sessionId);
  const open = openOf(room).get(sessionId);
  const { taskId, answer } = payload;
  if (!player || !p) return;
  if (!open || typeof taskId !== 'string' || open.taskId !== taskId) {
    reject(room, sessionId, ErrorCode.cannot, 'nothing open');
    return;
  }
  const problem = taskProblem(room, p, player, taskId);
  if (problem) {
    openOf(room).delete(sessionId);
    reject(room, sessionId, problem.code, problem.msg);
    return;
  }
  const def = Object.values(minigames.minigames).find((m) => m.task === taskId);
  const assisted =
    typeof answer === 'object' &&
    answer !== null &&
    (answer as { assist?: unknown }).assist === true &&
    def !== undefined &&
    room.state.tick - open.startTick >= Math.round(def.assistS * TICK_RATE);
  if (!assisted && !checkMinigame(open.puzzle, answer)) {
    reject(room, sessionId, ErrorCode.cannot, 'try again');
    return;
  }
  complete(room, sessionId, player, p, taskId);
}
