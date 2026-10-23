import { balance, minigames, scenes, tasks } from '@wdi/content';
import {
  ErrorCode,
  LedgerLine,
  Phase,
  S2C,
  TICK_RATE,
  TILE_PX,
  checkMinigame,
  generateMinigame,
  type MinigamePuzzle,
  type PlayerState,
} from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';
import { martyrOf } from './Memorial';
import { type PlayerSim, simOf } from './RoomSim';
import { endMatch } from './Win';
import { addStack, canAdd, count, take } from './Inventory';
import { isVerbPhase, reject, sceneKey, tileCentre } from './World';

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

type Problem = { code: ErrorCode; msg: string };

/** Whether `p` stands in `node`'s scene within `doors.reachTiles` of its prop (the station reach of GDD 3.5). */
function atNode(p: PlayerSim, node: { scene: string; prop: string }): boolean {
  const here = sceneKey(p.sceneIdx);
  const prop = node.scene === here ? scenes[here]?.props.find((q) => q.id === node.prop) : undefined;
  return (
    prop !== undefined &&
    Math.hypot(p.x - tileCentre(prop.x, TILE_PX), p.y - tileCentre(prop.y, TILE_PX)) <=
      balance.doors.reachTiles * TILE_PX
  );
}

/** Why this seat cannot work `taskId` now, or null: the checks that start a mini-game and that finish it. */
function taskProblem(
  room: PartyRoom,
  p: PlayerSim | undefined,
  player: PlayerState,
  taskId: string,
): Problem | null {
  if (!isVerbPhase(room.state.phase)) return { code: ErrorCode.wrongPhase, msg: 'not now' };
  // A ghost finishes its own tasks (GDD 3.8; the bar caps its share, 3.5), so `dead` is no bar here (7M).
  if (!p || !p.placed) return { code: ErrorCode.cannot, msg: 'not now' };
  if (room.state.tick < p.busyUntilTick) return { code: ErrorCode.busy, msg: 'busy' };
  const entry = player.priv.tasks.find((t) => t.id === taskId);
  const task = tasks.tasks[taskId];
  if (!entry || entry.done || !task || task.kind !== 'fetch')
    return { code: ErrorCode.cannot, msg: 'not your task' };
  if (task.nightOnly && room.state.phase !== Phase.night && room.state.phase !== Phase.finalNight) {
    return { code: ErrorCode.wrongPhase, msg: 'only at night' };
  }
  if (!task.targets.some((t) => atNode(p, t))) return { code: ErrorCode.outOfRange, msg: 'too far' };
  // A fake task (a Cabal seat's alibi list) needs no deliverable; a real one carries it to the node.
  if (!entry.fake && task.tool !== undefined && count(player, task.tool) < (task.toolQty ?? 1))
    return { code: ErrorCode.cannot, msg: 'you lack the tool' };
  return null;
}

/**
 * The pick-up (GDD 3.5): a seat at a task's source prop takes the task's deliverable, `toolQty` of its tool, into its
 * pockets, once at a time: not while it carries that many already, and not without the room. A fake list's holder goes
 * through the same motion and takes nothing, so the Cabal's alibi theatre visits the same shelves as the Village's
 * errands; nothing public tells the two apart, since inventories are private. The hold is instant, like the opener.
 */
function pickUp(
  room: PartyRoom,
  sessionId: string,
  player: PlayerState,
  p: PlayerSim,
  fake: boolean,
  tool: string | undefined,
  qty: number,
): void {
  if (!isVerbPhase(room.state.phase)) return reject(room, sessionId, ErrorCode.wrongPhase, 'not now');
  if (!p.placed) return reject(room, sessionId, ErrorCode.cannot, 'not now');
  if (room.state.tick < p.busyUntilTick) return reject(room, sessionId, ErrorCode.busy, 'busy');
  if (fake || tool === undefined) return;
  if (count(player, tool) >= qty) return reject(room, sessionId, ErrorCode.cannot, 'you carry it already');
  if (!canAdd(player, tool, qty)) return reject(room, sessionId, ErrorCode.cannot, 'no room in your pockets');
  addStack(player, tool, qty);
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
  // Round 7 (7M, GDD 3.5): at the task's source the same hold picks its deliverable up instead.
  const task = tasks.tasks[taskId];
  const entry = player.priv.tasks.find((t) => t.id === taskId);
  if (entry && !entry.done && task?.kind === 'fetch' && task.source && atNode(p, task.source)) {
    pickUp(room, sessionId, player, p, entry.fake, task.tool, task.toolQty ?? 1);
    return;
  }
  const problem = def
    ? taskProblem(room, p, player, taskId)
    : { code: ErrorCode.cannot, msg: 'cannot do that' };
  if (problem || !def) {
    reject(room, sessionId, problem?.code ?? ErrorCode.cannot, problem?.msg ?? 'cannot do that');
    return;
  }
  // The puzzle is the seat's own business: a stream keyed by seat, shared with nothing public (`sim/seeds.ts`).
  const rng = room.seeds.get('minigame', sessionId);
  const puzzle = generateMinigame(def.kind, def.difficulty, rng, balance.minigames);
  openOf(room).set(sessionId, { taskId, puzzle, startTick: room.state.tick });
  room.clients
    .getById(sessionId)
    ?.send(S2C.minigameStart, { taskId, kind: puzzle.kind, public: puzzle.public });
}

/**
 * The global bar: finished real tasks over all real tasks; a ghost's finished ones count up to `ghostShareCap`. The
 * martyred Vicar's ghost (GDD 3.20) counts each real task it finishes in the `martyrS` seconds after its reveal
 * `martyrWeight` times, outside the cap; before and after that window its tasks count as any ghost's. A full bar in play wins the match for the Village (GDD 3.5).
 */
export function recomputeTaskBar(room: PartyRoom): void {
  const martyr = martyrOf(room);
  let total = 0;
  let done = 0;
  let ghostDone = 0;
  let martyrDone = 0;
  for (const [id, player] of room.state.players) {
    const ghost = simOf(room).players.get(id)?.dead === true;
    let finished = 0;
    for (const t of player.priv?.tasks ?? []) {
      if (t.fake) continue;
      total++;
      if (t.done) finished++;
    }
    if (!ghost) done += finished;
    else if (id !== martyr?.seat) ghostDone += finished;
    else {
      const before = Math.min(finished, martyr.doneBefore);
      const boosted = Math.max(0, Math.min(finished, martyr.doneAtEnd ?? finished) - before);
      ghostDone += finished - boosted;
      martyrDone += boosted;
    }
  }
  if (total === 0) return;
  const counted =
    done + Math.min(ghostDone, balance.tasks.ghostShareCap * total) + martyrDone * balance.tasks.martyrWeight;
  room.state.taskBar = Math.min(100, Math.floor((100 * counted) / total));
  const phase = room.state.phase;
  if (room.state.taskBar === 100 && phase >= Phase.grace && phase < Phase.gameOver) endMatch(room, 'village');
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
